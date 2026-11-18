import { isMySql } from '../../utils/knexUtils';
import { withWhereScope } from '../../queryBuilder/whereScopes';
import type { Relation, RelationQueryBuilder } from '../Relation';

// Copies the joins and the where clauses of `builder`, a query of the related
// rows, to `query`, the patch of the related table that `relate()` and
// `unrelate()` of a has-many relation run. knex only compiles the joins of an
// update on MySQL. On the other databases a query with joins filters the
// related rows by their ids in a subquery that has the joins and the where
// clauses.
function copyRelatedFilters(
  builder: RelationQueryBuilder,
  query: RelationQueryBuilder,
  relation: Relation,
): void {
  const builderClass = builder.constructor;

  if (!builder.has(builderClass.JoinSelector) || isMySql(builder.knex())) {
    query.copyFrom(builder, builderClass.JoinSelector);
    query.copyFrom(builder, builderClass.WhereSelector);
    return;
  }

  const modelClass = relation.relatedModelClass;
  const idProp = modelClass.getIdRelationProperty();
  const subquery = modelClass
    .query()
    .childQueryOf(builder)
    .copyFrom(builder, builderClass.JoinSelector)
    .copyFrom(builder, builderClass.WhereSelector);

  subquery.select(idProp.refs(subquery));
  withWhereScope(query, () => query.whereInComposite(idProp.refs(query), subquery));
}

export { copyRelatedFilters };
