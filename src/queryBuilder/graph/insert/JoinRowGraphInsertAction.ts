import { GraphAction } from '../GraphAction';
import { groupBy, chunk } from '../../../utils/objectUtils';
import * as promiseUtils from '../../../utils/promiseUtils';
import type { GraphData, GraphEdge, GraphNode } from '../GraphData';
import type { QueryBuilder } from '../../QueryBuilder';
import type { ManyToManyRelation } from '../../../relations/manyToMany/ManyToManyRelation';
import type { RelationModel } from '../../../relations/Relation';
import type { ModelClass } from '../../QueryBuilderOperationSupport';

interface JoinRow {
  node: GraphNode;
  joinTableModelClass: ModelClass;
  joinTableObj: RelationModel;
}

class JoinRowGraphInsertAction extends GraphAction {
  declare nodes: GraphNode[];

  constructor(graphData: GraphData, { nodes }: { nodes: GraphNode[] }) {
    super(graphData);
    this.nodes = nodes;
  }

  run(builder: QueryBuilder): PromiseLike<unknown> {
    const batches = this._createInsertBatches(builder);
    const concurrency = this._getConcurrency(builder, this.nodes);

    return promiseUtils.map(batches, (batch: JoinRow[]) => this._insertBatch(builder, batch), {
      concurrency,
    });
  }

  _createInsertBatches(builder: QueryBuilder): JoinRow[][] {
    const batches: JoinRow[][] = [];
    const batchSize = this._getBatchSize(builder);
    const nodesByModel = groupBy(this.nodes, (node: GraphNode) => getJoinTableModel(builder, node));

    for (const [joinTableModelClass, nodes] of nodesByModel.entries()) {
      for (const nodeBatch of chunk(nodes, batchSize)) {
        batches.push(this._createBatch(joinTableModelClass, nodeBatch));
      }
    }

    return batches;
  }

  _createBatch(joinTableModelClass: ModelClass, nodes: GraphNode[]): JoinRow[] {
    return nodes
      .filter((node) => {
        return this.graphOptions.shouldRelate(node, this.graphData) || node.userData.inserted;
      })
      .map((node) => ({
        node,
        joinTableModelClass,
        joinTableObj: this._createJoinTableObj(joinTableModelClass, node),
      }));
  }

  _createJoinTableObj(joinTableModelClass: ModelClass, node: GraphNode): RelationModel {
    const { parentEdge, parentNode } = node;
    // The nodes of this action are in many to many relations.
    const { relation } = parentEdge as GraphEdge & { relation: ManyToManyRelation };

    this._resolveReferences(node);

    return joinTableModelClass.fromJson(
      relation.createJoinModel(relation.ownerProp.getProps(parentNode!.obj), node.obj),
    );
  }

  _insertBatch(parentBuilder: QueryBuilder, batch: JoinRow[]): Promise<unknown> {
    return this._beforeInsert(parentBuilder, batch).then(() => this._insert(parentBuilder, batch));
  }

  _beforeInsert(parentBuilder: QueryBuilder, batch: JoinRow[]): Promise<unknown[]> {
    return Promise.all(
      batch.map(({ node, joinTableObj }) => {
        if (node.parentEdge) {
          return (node.parentEdge.relation as ManyToManyRelation).joinTableBeforeInsert(
            joinTableObj,
            parentBuilder.context(),
          );
        } else {
          return null;
        }
      }),
    );
  }

  _insert(parentBuilder: QueryBuilder, batch: JoinRow[]): QueryBuilder | void {
    if (batch.length > 0) {
      return batch[0].joinTableModelClass
        .query()
        .childQueryOf(parentBuilder)
        .insert(batch.map((it) => it.joinTableObj));
    }
  }
}

function getJoinTableModel(builder: QueryBuilder, node: GraphNode): ModelClass {
  // A many to many relation always has a join model class. `getJoinModelClass()`
  // also gets the missing knex as null if the builder has none.
  return node.parentEdge!.relation.getJoinModelClass(builder.unsafeKnex()!) as ModelClass;
}

export { JoinRowGraphInsertAction };
