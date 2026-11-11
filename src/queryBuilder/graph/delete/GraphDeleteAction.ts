import { GraphAction } from '../GraphAction';
import { asArray, groupBy } from '../../../utils/objectUtils';
import * as promiseUtils from '../../../utils/promiseUtils';
import { isMySql } from '../../../utils/knexUtils';
import { hasStaticHook } from '../../StaticHookArguments';
import { withWhereScope } from '../../whereScopes';
import { isSimpleFilterArg } from '../../../relations/manyToMany/ManyToManyModifyMixin';
import type { GraphData, GraphNode, GraphRelation } from '../GraphData';
import type { QueryBuilder } from '../../QueryBuilder';

class GraphDeleteAction extends GraphAction {
  declare nodes: GraphNode[];

  constructor(graphData: GraphData, { nodes }: { nodes: GraphNode[] }) {
    super(graphData);
    // Nodes to delete.
    this.nodes = nodes;
  }

  run(builder: QueryBuilder): PromiseLike<unknown> {
    const nodesTodelete = this._filterOutBelongsToOneRelationUnrelates(this.nodes);
    const series: QueryBuilder[][] = [];

    if (isMySql(builder.unsafeKnex())) {
      // On MySQL and MariaDB, two deletes of one join table at once, of the
      // join rows of different parents, deadlocked with each other on MariaDB
      // 10.6 (in a third of the calls that unrelated one row from two parents):
      // each locks a range of the table's key. The unrelates of a relation are
      // one query for all parents, by the ids of both sides, when that's what
      // the query of each parent would be. The other deletes of a many-to-many
      // relation run one at a time. The other relations still run at the same
      // time.
      const nodesByRelation = groupBy(nodesTodelete, getRelation);

      nodesByRelation.forEach((nodes, relation) => {
        if (!relation.isObjectionManyToManyRelation) {
          series.push(...this._createDeleteBuilders(builder, nodes).map((it) => [it]));
        } else if (this._canUnrelateInOneQuery(builder, relation, nodes)) {
          series.push([this._createJoinRowDeleteBuilder(builder, relation, nodes)]);
        } else {
          series.push(this._createDeleteBuilders(builder, nodes));
        }
      });
    } else {
      series.push(...this._createDeleteBuilders(builder, nodesTodelete).map((it) => [it]));
    }

    return promiseUtils.map(series, executeInSeries, {
      concurrency: this._getConcurrency(builder, nodesTodelete),
    });
  }

  // Whether the unrelates of a many-to-many relation can be one query that
  // deletes the join rows by the ids of both sides: for more than one parent,
  // when the query of each parent would delete them by ids (see
  // `relatedIdsOfFilters()` of `ManyToManyModifyMixin`), and when no hook of
  // the join model would see a different query.
  _canUnrelateInOneQuery(
    builder: QueryBuilder,
    relation: GraphRelation,
    nodes: GraphNode[],
  ): boolean {
    if (!this.graphOptions.shouldUnrelate(nodes[0], this.graphData)) {
      return false;
    }

    const parents = new Set(nodes.map(getParent));
    const idColumns = relation.relatedModelClass.getIdColumnArray();
    const relatedColumns = relation.relatedProp.cols;
    const joinModelClass = relation.getJoinModelClass(builder.knex());

    return (
      parents.size > 1 &&
      !relation.modify &&
      idColumns.length === relatedColumns.length &&
      idColumns.every((column, i) => column === relatedColumns[i]) &&
      joinModelClass !== null &&
      !hasStaticHook(joinModelClass, 'beforeDelete') &&
      !hasStaticHook(joinModelClass, 'afterDelete') &&
      nodes.every((node) => joinRowIds(relation, node).every(isIdValue))
    );
  }

  _createJoinRowDeleteBuilder(
    parentBuilder: QueryBuilder,
    relation: GraphRelation,
    nodes: GraphNode[],
  ): QueryBuilder {
    const query = relation
      .getJoinModelClass(parentBuilder.knex())!
      .query()
      .childQueryOf(parentBuilder)
      .delete();

    for (const node of nodes) {
      node.userData.deleted = true;
    }

    // The (owner, related) pairs, not owners times related rows, which would
    // also delete the join rows of an owner and a related row of another one.
    withWhereScope(query, () => {
      query.whereInComposite(
        [
          ...relation.joinTableOwnerProp!.refs(query),
          ...relation.joinTableRelatedProp!.refs(query),
        ],
        nodes.map((node) => joinRowIds(relation, node)),
      );
    });
    withWhereScope(query, () => {
      query.modify(relation.joinTableModify);
    });

    return query;
  }

  _filterOutBelongsToOneRelationUnrelates(nodes: GraphNode[]): GraphNode[] {
    // `BelongsToOneRelation` unrelate is handled by `GraphPatch` because
    // unrelating a `BelongsToOneRelation` is just a matter of updating
    // one field of the parent node.
    return nodes.filter((node) => {
      return !(
        this.graphOptions.shouldUnrelate(node, this.graphData) &&
        node.parentEdge!.relation.isObjectionBelongsToOneRelation
      );
    });
  }

  // The delete or unrelate queries, one per relation and parent.
  _createDeleteBuilders(parentBuilder: QueryBuilder, nodesTodelete: GraphNode[]): QueryBuilder[] {
    const nodesByRelation = groupBy(nodesTodelete, getRelation);
    const builders: QueryBuilder[] = [];

    nodesByRelation.forEach((nodes, relation) => {
      const nodesByParent = groupBy(nodes, getParent);

      nodesByParent.forEach((nodes, parentNode) => {
        const shouldUnrelate = this.graphOptions.shouldUnrelate(nodes[0], this.graphData);

        // Forked, so that the options set below stay on this query.
        const builder: QueryBuilder = parentNode!.obj
          .$relatedQuery(relation.name)
          .childQueryOf(parentBuilder, { fork: true });

        if (relation.isObjectionManyToManyRelation) {
          // The current graph was fetched through the relations, so the
          // deleted and unrelated rows are known to be related to their
          // parents. Deletes delete them by their ids only, and unrelates
          // delete the join rows by the ids of both sides. A subquery that
          // joins the join table, or reads the related table, deadlocks with
          // concurrent writes on MySQL.
          builder.internalOptions({ skipRelationFilter: true });
        }

        if (!relation.isObjectionBelongsToOneRelation) {
          // This is useless in case of BelongsToOneRelation.
          builder.findByIds(nodes.map((node) => node.obj.$id()));
        }

        for (const node of nodes) {
          node.userData.deleted = true;
        }

        builders.push(shouldUnrelate ? builder.unrelate() : builder.delete());
      });
    });

    return builders;
  }
}

// The values of the join table columns of a node's join row: the owner's, then
// the related model's.
function joinRowIds(relation: GraphRelation, node: GraphNode): unknown[] {
  return [...relation.ownerProp.getProps(node.parentNode!.obj), ...asArray(node.obj.$id())];
}

function isIdValue(value: unknown): boolean {
  return value !== null && value !== undefined && isSimpleFilterArg(value);
}

function executeInSeries(builders: QueryBuilder[]): PromiseLike<unknown> {
  if (builders.length === 1) {
    return builders[0].execute();
  }

  return builders.reduce<PromiseLike<unknown>>(
    (promise, builder) => promise.then(() => builder.execute()),
    Promise.resolve(),
  );
}

function getRelation(node: GraphNode): GraphRelation {
  return node.parentEdge!.relation;
}

function getParent(node: GraphNode): GraphNode | null {
  return node.parentNode;
}

export { GraphDeleteAction };
