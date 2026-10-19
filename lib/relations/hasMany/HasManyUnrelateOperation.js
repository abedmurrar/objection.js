'use strict';

const { withWhereScope } = require('../../queryBuilder/whereScopes');
const { UnrelateOperation } = require('../../queryBuilder/operations/UnrelateOperation');

class HasManyUnrelateOperation extends UnrelateOperation {
  queryExecutor(builder) {
    const patch = {};
    const relatedProp = this.relation.relatedProp;
    const ownerValues = this.owner.getProps(this.relation);
    const relatedRefs = relatedProp.refs(builder);

    relatedProp.forEach((i) => {
      relatedProp.patch(patch, i, null);
    });

    const query = this.relation.relatedModelClass
      .query()
      .childQueryOf(builder)
      .patch(patch)
      .copyFrom(builder, builder.constructor.JoinSelector)
      .copyFrom(builder, builder.constructor.WhereSelector);

    withWhereScope(query, () => query.whereInComposite(relatedRefs, ownerValues));
    withWhereScope(query, () => query.modify(this.relation.modify));

    return query;
  }
}

module.exports = {
  HasManyUnrelateOperation,
};
