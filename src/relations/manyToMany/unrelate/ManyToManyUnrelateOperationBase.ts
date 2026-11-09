import { withWhereScope } from '../../../queryBuilder/whereScopes';
import { UnrelateOperation } from '../../../queryBuilder/operations/UnrelateOperation';
import type { RelationQueryBuilder } from '../../Relation';
import type { RelationOwner } from '../../RelationOwner';
import type { ManyToManyRelation } from '../ManyToManyRelation';

class ManyToManyUnrelateOperationBase extends UnrelateOperation {
  // Defined by `ManyToManyModifyMixin`, which every concrete class uses.
  declare applyModifyFilterForRelatedTable: (builder: RelationQueryBuilder) => RelationQueryBuilder;
  declare applyModifyFilterForJoinTable: (builder: RelationQueryBuilder) => RelationQueryBuilder;

  declare relation: ManyToManyRelation;
  declare owner: RelationOwner;
  declare skipRelationFilter: boolean;

  // The rows that `upsertGraph()` unrelates are known to be related to the
  // owner, see `ManyToManyModifyMixin.relatedIdsOfFilters()`.
  onAdd(builder: RelationQueryBuilder, args: unknown[]): boolean {
    this.skipRelationFilter = builder.internalOptions().skipRelationFilter;
    return super.onAdd(builder, args);
  }

  get modifiesJoinTable(): boolean {
    return true;
  }

  // The main query is replaced by the query that `queryExecutor()` returns.
  get modifiesJoinTableOnly(): boolean {
    return true;
  }

  queryExecutor(builder: RelationQueryBuilder): RelationQueryBuilder {
    const unrelateQuery = this.relation
      .getJoinModelClass(builder.knex())!
      .query()
      .childQueryOf(builder)
      .delete();

    withWhereScope(unrelateQuery, () => {
      this.applyModifyFilterForJoinTable(unrelateQuery);
    });
    withWhereScope(unrelateQuery, () => {
      unrelateQuery.modify(this.relation.joinTableModify);
    });

    return unrelateQuery;
  }
}

export { ManyToManyUnrelateOperationBase };
