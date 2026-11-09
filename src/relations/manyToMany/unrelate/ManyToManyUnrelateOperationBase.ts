import { withWhereScope } from '../../../queryBuilder/whereScopes';
import { UnrelateOperation } from '../../../queryBuilder/operations/UnrelateOperation';
import type { RelationQueryBuilder } from '../../Relation';
import type { RelationOwner } from '../../RelationOwner';
import type { ManyToManyRelation } from '../ManyToManyRelation';

class ManyToManyUnrelateOperationBase extends UnrelateOperation {
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

  /* istanbul ignore next */
  applyModifyFilterForRelatedTable(builder: RelationQueryBuilder): RelationQueryBuilder {
    throw new Error('not implemented');
  }

  /* istanbul ignore next */
  applyModifyFilterForJoinTable(builder: RelationQueryBuilder): RelationQueryBuilder {
    throw new Error('not implemented');
  }
}

export { ManyToManyUnrelateOperationBase };
