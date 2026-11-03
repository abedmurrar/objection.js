import { GraphAction } from '../GraphAction';
import { groupBy, chunk, get, set } from '../../../utils/objectUtils';
import { ModelGraphEdge } from '../../../model/graph/ModelGraphEdge';
import * as promiseUtils from '../../../utils/promiseUtils';
import { isMySql } from '../../../utils/knexUtils';
import type { GraphData, GraphEdge, GraphNode } from '../GraphData';
import type { QueryBuilder } from '../../QueryBuilder';
import type { ManyToManyRelation } from '../../../relations/manyToMany/ManyToManyRelation';
import type { ModelClass } from '../../QueryBuilderOperationSupport';

// The edges each node depends on.
type Dependencies = Map<GraphNode, GraphEdge[]>;

// A MySQL insert of several rows returns the id of the first row only, which
// gives the ids of the others when none of the rows has one (see
// `InsertOperation.prepareMySqlBatchInsert()`). So the rows with an id and the
// ones without are inserted separately. The ids of rows with a composite id
// can't be computed, so those without one are inserted one at a time.
// The ids are checked right before the insert, since the inserts of the
// nodes they depend on can set them.
function splitBatch(
  builder: QueryBuilder,
  modelClass: ModelClass,
  nodes: GraphNode[],
): GraphNode[][] {
  if (nodes.length === 1 || !isMySql(builder.unsafeKnex())) {
    return [nodes];
  }

  const withId: GraphNode[] = [];
  const withoutId: GraphNode[] = [];

  for (const node of nodes) {
    (node.obj.$hasId() ? withId : withoutId).push(node);
  }

  const batches: GraphNode[][] = [];

  if (withId.length !== 0) {
    batches.push(withId);
  }

  if (withoutId.length !== 0) {
    if (Array.isArray(modelClass.getIdColumn())) {
      for (const node of withoutId) {
        batches.push([node]);
      }
    } else {
      batches.push(withoutId);
    }
  }

  return batches;
}

/**
 * Inserts a batch of nodes for a GraphInsert.
 *
 * One of these is created for each batch of nodes that can be inserted at once.
 * However, the nodes can have a different table and not all databases support
 * batch inserts, so this class splits the inserts into further sub batches
 * when needed.
 */
class GraphInsertAction extends GraphAction {
  declare nodes: GraphNode[];
  declare dependencies: Dependencies;

  constructor(
    graphData: GraphData,
    { nodes, dependencies }: { nodes: GraphNode[]; dependencies: Dependencies },
  ) {
    super(graphData);

    // Nodes to insert.
    this.nodes = nodes;
    this.dependencies = dependencies;
  }

  run(builder: QueryBuilder): PromiseLike<unknown> {
    const batches = this._createInsertBatches(builder);
    const concurrency = this._getConcurrency(builder, this.nodes);

    return promiseUtils.map(batches, (batch: GraphNode[]) => this._insertBatch(builder, batch), {
      concurrency,
    });
  }

  _createInsertBatches(builder: QueryBuilder): GraphNode[][] {
    const batches: GraphNode[][] = [];
    const batchSize = this._getBatchSize(builder);
    const nodesByModelClass = groupBy(this.nodes, getModelClass);

    for (const nodes of nodesByModelClass.values()) {
      for (const nodeBatch of chunk(nodes, batchSize)) {
        batches.push(nodeBatch);
      }
    }

    return batches;
  }

  async _insertBatch(parentBuilder: QueryBuilder, nodes: GraphNode[]): Promise<void> {
    await this._beforeInsert(nodes);
    await this._insert(parentBuilder, nodes);
    await this._afterInsert(nodes);
  }

  _beforeInsert(nodes: GraphNode[]): Promise<void> {
    this._resolveDependencies(nodes);
    this._omitManyToManyExtraProps(nodes);
    this._copyRelationPropsFromCurrentIfNeeded(nodes);

    return Promise.resolve();
  }

  _resolveDependencies(nodes: GraphNode[]): void {
    for (const node of nodes) {
      const edges = this.dependencies.get(node);

      if (edges) {
        for (const edge of edges) {
          // `node` needs `dependencyNode` to have been inserted (and it has been).
          const dependencyNode = edge.getOtherNode(node);

          this._resolveDependency(dependencyNode, edge);
        }
      }
    }
  }

  _resolveDependency(dependencyNode: GraphNode, edge: GraphEdge): void {
    if (edge.type === ModelGraphEdge.Type.Relation && !edge.relation.joinTable) {
      this._resolveRelationDependency(dependencyNode, edge);
    } else if (edge.refType === ModelGraphEdge.ReferenceType.Property) {
      this._resolvePropertyReferenceNode(dependencyNode, edge);
    }
  }

  _resolveRelationDependency(dependencyNode: GraphNode, edge: GraphEdge): void {
    const dependentNode = edge.getOtherNode(dependencyNode);

    let sourceProp;
    let targetProp;

    if (edge.isOwnerNode(dependencyNode)) {
      sourceProp = edge.relation.ownerProp;
      targetProp = edge.relation.relatedProp;
    } else {
      targetProp = edge.relation.ownerProp;
      sourceProp = edge.relation.relatedProp;
    }

    this._resolveReferences(dependencyNode);

    targetProp.forEach((i: number) => {
      targetProp.setProp(dependentNode.obj, i, sourceProp.getProp(dependencyNode.obj, i));
    });
  }

  _resolvePropertyReferenceNode(dependencyNode: GraphNode, edge: GraphEdge): void {
    const dependentNode = edge.getOtherNode(dependencyNode);

    // A property reference edge has the paths.
    let sourcePath: PropertyKey[];
    let targetPath: PropertyKey[];

    if (edge.isOwnerNode(dependencyNode)) {
      sourcePath = edge.refOwnerDataPath!;
      targetPath = edge.refRelatedDataPath!;
    } else {
      targetPath = edge.refOwnerDataPath!;
      sourcePath = edge.refRelatedDataPath!;
    }

    const sourceValue = get(dependencyNode.obj, sourcePath);
    const targetValue = get(dependentNode.obj, targetPath);

    if (targetValue === edge.refMatch) {
      set(dependentNode.obj, targetPath, sourceValue);
    } else {
      // The reference is a part of a string: `replace()` converts the value to a string.
      set(
        dependentNode.obj,
        targetPath,
        (targetValue as string).replace(edge.refMatch!, sourceValue as string),
      );
    }
  }

  _omitManyToManyExtraProps(nodes: GraphNode[]): void {
    for (const node of nodes) {
      if (
        node.parentEdge &&
        node.parentEdge.type === ModelGraphEdge.Type.Relation &&
        node.parentEdge.relation.joinTableExtras.length > 0
      ) {
        // Only many to many relations have join table extras.
        (node.parentEdge.relation as ManyToManyRelation).omitExtraProps([node.obj]);
      }
    }
  }

  _copyRelationPropsFromCurrentIfNeeded(nodes: GraphNode[]): void {
    for (const node of nodes) {
      const currentNode = this.currentGraph.nodeForNode(node);

      if (!currentNode) {
        continue;
      }

      for (const edge of node.edges) {
        if (edge.type !== ModelGraphEdge.Type.Relation) {
          continue;
        }

        const prop = edge.isOwnerNode(node) ? edge.relation.ownerProp : edge.relation.relatedProp;

        prop.forEach((i: number) => {
          const value = prop.getProp(node.obj, i);

          if (value !== undefined) {
            return;
          }

          prop.setProp(node.obj, i, prop.getProp(currentNode.obj, i));
        });
      }
    }
  }

  _insert(parentBuilder: QueryBuilder, nodes: GraphNode[]): Promise<unknown> | void {
    const [{ modelClass }] = nodes;

    nodes = nodes.filter((node) => {
      return this.graphOptions.shouldInsert(node, this.graphData);
    });

    for (const node of nodes) {
      delete node.obj[modelClass.uidProp];
      node.obj.$validate(null, { dataPath: node.dataPathKey });
    }

    if (nodes.length === 0) {
      return;
    }

    for (const node of nodes) {
      node.userData.inserted = true;
    }

    return this._runRelationBeforeInsertMethods(parentBuilder, nodes).then(async () => {
      for (const batch of splitBatch(parentBuilder, modelClass, nodes)) {
        await modelClass
          .query()
          .insert(batch.map((node) => node.obj))
          .childQueryOf(parentBuilder)
          .copyFrom(parentBuilder, GraphAction.ReturningAllSelector)
          .execute();
      }
    });
  }

  _runRelationBeforeInsertMethods(
    parentBuilder: QueryBuilder,
    nodes: GraphNode[],
  ): Promise<unknown[]> {
    return Promise.all(
      nodes.map((node) => {
        if (node.parentEdge) {
          return node.parentEdge.relation.beforeInsert(node.obj, parentBuilder.context());
        } else {
          return null;
        }
      }),
    );
  }

  _afterInsert(nodes: GraphNode[]): void {
    for (const node of nodes) {
      for (const refNode of node.referencingNodes) {
        this._resolveDependency(refNode, refNode.parentEdge!);
      }
    }
  }
}

function getModelClass(node: GraphNode): ModelClass {
  return node.modelClass;
}

export { GraphInsertAction };
