import { GraphAction } from '../GraphAction';
import { groupBy, get, set } from '../../../utils/objectUtils';
import { forEachPropertyReference } from '../../../model/graph/ModelGraphBuilder';
import * as promiseUtils from '../../../utils/promiseUtils';
import type { GraphData, GraphModel, GraphNode, GraphRelation } from '../GraphData';
import type { QueryBuilder } from '../../QueryBuilder';
import type { ModelClass } from '../../QueryBuilderOperationSupport';
import type { GraphOptionsInput } from '../GraphOptions';

// The related models of one relation of one parent, which one recursive
// `upsertGraph()` writes, with the nodes of their graphs.
interface UpsertGroup {
  nodes: GraphNode[];
  graphNodes: Set<GraphNode> | null;
}

class GraphRecursiveUpsertAction extends GraphAction {
  declare nodes: GraphNode[];
  declare waves: UpsertGroup[][];

  constructor(graphData: GraphData, { nodes }: { nodes: GraphNode[] }) {
    super(graphData);
    // Nodes to upsert.
    this.nodes = nodes;
    // Computed before anything is written, so that a cycle throws first.
    this.waves = this._orderGroups(this._groupNodes(nodes));
  }

  // The groups of a wave run at the same time. A group whose graph refers to a
  // model in another group's graph runs in a later wave, after that model is
  // written.
  run(builder: QueryBuilder): PromiseLike<unknown> {
    const concurrency = this._getConcurrency(builder, this.nodes);

    return this.waves.reduce<PromiseLike<unknown>>(
      (promise, wave) =>
        promise.then(() =>
          promiseUtils.map(wave, (group) => this._createUpsertBuilder(builder, group).execute(), {
            concurrency,
          }),
        ),
      Promise.resolve(),
    );
  }

  _groupNodes(nodesToUpsert: GraphNode[]): UpsertGroup[] {
    const groups: UpsertGroup[] = [];

    groupBy(nodesToUpsert, getRelation).forEach((nodes) => {
      groupBy(nodes, getParent).forEach((nodes) => {
        groups.push({ nodes, graphNodes: null });
      });
    });

    return groups;
  }

  _orderGroups(groups: UpsertGroup[]): UpsertGroup[][] {
    // Without `allowRefs`, a graph can't have references.
    if (groups.length < 2 || !this.graphOptions.allowRefs()) {
      return [groups];
    }

    // The branches of the related nodes are removed from `this.graph`, with the
    // edges from the related nodes into them, so their nodes are found through
    // their models.
    const nodeByObj = new Map(this.graphData.nodesBeforePruning.map((node) => [node.obj, node]));
    const groupByNode = new Map<GraphNode, UpsertGroup>();

    for (const group of groups) {
      group.graphNodes = new Set();

      for (const node of group.nodes) {
        node.obj.$traverse((obj: GraphModel) => {
          const graphNode = nodeByObj.get(obj);

          if (graphNode) {
            group.graphNodes!.add(graphNode);
            groupByNode.set(graphNode, group);
          }
        });
      }
    }

    const dependencies = new Map<UpsertGroup, Set<UpsertGroup>>();

    for (const group of groups) {
      const groupDependencies = new Set<UpsertGroup>();

      for (const node of group.graphNodes!) {
        for (const edge of node.refEdges) {
          const referencedGroup = edge.isOwnerNode(node) && groupByNode.get(edge.relatedNode);

          if (referencedGroup && referencedGroup !== group) {
            groupDependencies.add(referencedGroup);
          }
        }
      }

      dependencies.set(group, groupDependencies);
    }

    const waves: UpsertGroup[][] = [];
    const done = new Set<UpsertGroup>();
    let remaining = groups;

    while (remaining.length) {
      const wave = remaining.filter((group) =>
        [...dependencies.get(group)!].every((it) => done.has(it)),
      );

      if (!wave.length) {
        throw new Error('the object graph contains cyclic references');
      }

      for (const group of wave) {
        done.add(group);
      }

      remaining = remaining.filter((group) => !done.has(group));
      waves.push(wave);
    }

    return waves;
  }

  _createUpsertBuilder(
    parentBuilder: QueryBuilder,
    { nodes, graphNodes }: UpsertGroup,
  ): QueryBuilder {
    for (const node of nodes) {
      this._resolveSubgraphReferences(node, graphNodes);
    }

    return nodes[0].modelClass
      .query()
      .childQueryOf(parentBuilder)
      .copyFrom(parentBuilder, GraphAction.ReturningAllSelector)
      .upsertGraph(
        nodes.map((node) => node.obj),
        // `GraphOptions` also takes a `GraphOptions` as its options.
        this.graphOptions.rebasedOptions(nodes[0]) as unknown as GraphOptionsInput,
      );
  }

  /**
   * The nodes inside the subgraph we are about to recursively upsert may
   * have references outside that graph that won't be available during the
   * recursive upsertGraph call: to the rest of the graph, or to the graph of
   * another related model, which an earlier wave wrote. This method resolves
   * them. References inside the subgraph are left to the recursive call.
   */
  _resolveSubgraphReferences(node: GraphNode, ownNodes: Set<GraphNode> | null): void {
    node.obj.$traverse((obj: GraphModel) => this._resolveReferencesForObject(obj, ownNodes));
  }

  // The node a reference from the subgraph refers to, if it's outside it.
  // `ownNodes` is null when there is only one subgraph, or no references: then
  // only the rest of the graph, without the subgraph, can be referred to.
  _findReferencedNode(ref: unknown, ownNodes: Set<GraphNode> | null): GraphNode | undefined {
    if (!ownNodes) {
      return this.graph.nodes.find((it) => it.uid === ref);
    }

    const node = this.graphData.nodesBeforePruning.find((it) => it.uid === ref);
    return node && !ownNodes.has(node) ? node : undefined;
  }

  _resolveReferencesForObject(obj: GraphModel, ownNodes: Set<GraphNode> | null): void {
    this._resolveObjectReference(obj, ownNodes);
    this._resolvePropertyReferences(obj, ownNodes);
  }

  _resolveObjectReference(obj: GraphModel, ownNodes: Set<GraphNode> | null): void {
    const modelClass = obj.constructor as ModelClass;
    const ref = obj[modelClass.uidRefProp];

    if (!ref) {
      return;
    }

    const referencedNode = this._findReferencedNode(ref, ownNodes);

    if (!referencedNode) {
      return;
    }

    const relationNames = referencedNode.modelClass.getRelationNames();

    for (const prop of Object.keys(referencedNode.obj)) {
      if (relationNames.includes(prop)) {
        continue;
      }

      obj[prop] = referencedNode.obj[prop];
    }

    delete obj[modelClass.uidRefProp];
  }

  _resolvePropertyReferences(obj: GraphModel, ownNodes: Set<GraphNode> | null): void {
    forEachPropertyReference(
      obj,
      ({
        path,
        refMatch,
        ref,
        refPath,
      }: {
        path: PropertyKey[];
        refMatch: string;
        ref: unknown;
        refPath: string[];
      }) => {
        const referencedNode = this._findReferencedNode(ref, ownNodes);

        if (!referencedNode) {
          return;
        }

        const referencedValue = get(referencedNode.obj, refPath);
        const value = get(obj, path);

        if (value === refMatch) {
          set(obj, path, referencedValue);
        } else {
          // The reference is a part of a string: `replace()` converts the value to a string.
          set(obj, path, (value as string).replace(refMatch, referencedValue as string));
        }
      },
    );
  }
}

function getRelation(node: GraphNode): GraphRelation {
  return node.parentEdge!.relation;
}

function getParent(node: GraphNode): GraphNode | null {
  return node.parentNode;
}

export { GraphRecursiveUpsertAction };
