import { withWhereScope } from '../../../queryBuilder/whereScopes';
import { UnrelateOperation } from '../../../queryBuilder/operations/UnrelateOperation';
import type { RelationQueryBuilder } from '../../Relation';
import type { RelationOwner } from '../../RelationOwner';
import type { ManyToManyRelation } from '../ManyToManyRelation';

class ManyToManyUnrelateOperationBase extends UnrelateOperation {
  declare relation: ManyToManyRelation;
  declare owner: RelationOwner;

  queryExecutor(builder: RelationQueryBuilder): RelationQueryBuilder {
    const unrelateQuery = this.relation
      .getJoinModelClass(builder.knex())!
      .query()
      .childQueryOf(builder)
      .delete();

    withWhereScope(unrelateQuery, () => {
      this.applyModifyFilterForJoinTable(unrelateQuery);
    });

    return unrelateQuery.modify(this.relation.joinTableModify);
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
