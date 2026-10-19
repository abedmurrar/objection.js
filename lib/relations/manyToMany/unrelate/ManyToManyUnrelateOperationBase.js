'use strict';

const { withWhereScope } = require('../../../queryBuilder/whereScopes');
const { UnrelateOperation } = require('../../../queryBuilder/operations/UnrelateOperation');

class ManyToManyUnrelateOperationBase extends UnrelateOperation {
  queryExecutor(builder) {
    const unrelateQuery = this.relation
      .getJoinModelClass(builder.knex())
      .query()
      .childQueryOf(builder)
      .delete();

    withWhereScope(unrelateQuery, () => {
      this.applyModifyFilterForJoinTable(unrelateQuery);
    });

    return unrelateQuery.modify(this.relation.joinTableModify);
  }

  /* istanbul ignore next */
  applyModifyFilterForRelatedTable(builder) {
    throw new Error('not implemented');
  }

  /* istanbul ignore next */
  applyModifyFilterForJoinTable(builder) {
    throw new Error('not implemented');
  }
}

module.exports = {
  ManyToManyUnrelateOperationBase,
};
