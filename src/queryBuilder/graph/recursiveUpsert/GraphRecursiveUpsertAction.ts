import { GraphAction } from '../GraphAction';
import { groupBy, get, set } from '../../../utils/objectUtils';
import { forEachPropertyReference } from '../../../model/graph/ModelGraphBuilder';
import * as promiseUtils from '../../../utils/promiseUtils';
import type { GraphData, GraphModel, GraphNode, GraphRelation } from '../GraphData';
import type { QueryBuilder } from '../../QueryBuilder';
import type { ModelClass } from '../../QueryBuilderOperationSupport';
import type { GraphOptionsInput } from '../GraphOptions';

class GraphRecursiveUpsertAction extends GraphAction {
  declare nodes: GraphNode[];

  constructor(graphData: GraphData, { nodes }: { nodes: GraphNode[] }) {
    super(graphData);
    // Nodes to upsert.
    this.nodes = nodes;
  }

  run(builder: QueryBuilder): PromiseLike<unknown> {
    const builders = this._createUpsertBuilders(builder, this.nodes);

    return promiseUtils.map(builders, (builder: QueryBuilder) => builder.execute(), {
      concurrency: this._getConcurrency(builder, this.nodes),
    });
  }

  _createUpsertBuilders(parentBuilder: QueryBuilder, nodesToUpsert: GraphNode[]): QueryBuilder[] {
    const nodesByRelation = groupBy(nodesToUpsert, getRelation);
    const builders: QueryBuilder[] = [];

    nodesByRelation.forEach((nodes) => {
      const nodesByParent = groupBy(nodes, getParent);

      nodesByParent.forEach((nodes) => {
        for (const node of nodes) {
          this._resolveReferences(node);
          node.userData.upserted = true;
        }

        builders.push(
          nodes[0].modelClass
            .query()
            .childQueryOf(parentBuilder)
            .copyFrom(parentBuilder, GraphAction.ReturningAllSelector)
            .upsertGraph(
              nodes.map((node) => node.obj),
              // `GraphOptions` also takes a `GraphOptions` as its options.
              this.graphOptions.rebasedOptions(nodes[0]) as unknown as GraphOptionsInput,
            ),
        );
      });
    });

    return builders;
  }

  /**
   * The nodes inside the subgraph we are about to recursively upsert may
   * have references outside that graph that won't be available during the
   * recursive upsertGraph call. This method resolves the references.
   *
   * TODO: This doesn't work if a recursively upserted node refers to
   *       a node inside another recursively upsertable graph.
   */
  _resolveReferences(node: GraphNode): void {
    node.obj.$traverse((obj: GraphModel) => this._resolveReferencesForObject(obj));
  }

  _resolveReferencesForObject(obj: GraphModel): void {
    this._resolveObjectReference(obj);
    this._resolvePropertyReferences(obj);
  }

  _resolveObjectReference(obj: GraphModel): void {
    const modelClass = obj.constructor as ModelClass;
    const ref = obj[modelClass.uidRefProp];

    if (!ref) {
      return;
    }

    const referencedNode = this.graph.nodes.find((it) => it.uid === ref);

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

  _resolvePropertyReferences(obj: GraphModel): void {
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
        const referencedNode = this.graph.nodes.find((it) => it.uid === ref);

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
