import { QueryTransformation } from './QueryTransformation';
import { isMySql, isMariaDb, getMariaDbVersion } from '../../utils/knexUtils';
import type { QueryBuilder } from '../QueryBuilder';
import type { ObjectionToKnexConvertingOperation } from '../operations/ObjectionToKnexConvertingOperation';

/**
 * Mysql doesn't allow queries like this:
 *
 *   update foo set bar = 1 where id in (select id from foo)
 *
 * because the subquery is for the same table `foo` as the parent update query.
 * The same goes for delete queries too.
 *
 * This transformation wraps those subqueries like this:
 *
 *   update foo set bar = 1 where id in (select * from (select id from foo))
 */
class WrapMysqlModifySubqueryTransformation extends QueryTransformation {
  // In a where group or a join callback `parentQuery` is a partial builder,
  // which the loop below walks past.
  onConvertQueryBuilderBase(query: QueryBuilder, parentQuery: QueryBuilder | null): QueryBuilder {
    const knex = parentQuery!.unsafeKnex();

    // Cannot detect anything if, for whatever reason, a knex instance
    // or a transaction is not registered at this point.
    if (!knex) {
      return query;
    }

    // This transformation only applies to MySQL.
    if (!isMySql(knex)) {
      return query;
    }

    // MariaDB 10.3.2+ allows these subqueries. Wrapping them would break
    // correlated subqueries, since MariaDB doesn't support outer references in
    // derived tables (MySQL 8.0.14+ does).
    if (allowsSameTableSubqueries(knex)) {
      return query;
    }

    // Subqueries in where groups and join clauses are converted with a
    // partial builder (or a `JoinBuilder`) as their parent. Walk up to the
    // query that they belong to.
    while (
      parentQuery &&
      (typeof parentQuery.isUpdate !== 'function' ||
        (parentQuery.isPartial() && parentQuery.parentQuery()))
    ) {
      parentQuery = parentQuery.parentQuery() as QueryBuilder | null;
    }

    // This transformation only applies to update and delete queries.
    if (!parentQuery || (!parentQuery.isUpdate() && !parentQuery.isDelete())) {
      return query;
    }

    // If the subquery is for another table and the query doesn't join the
    // parent query's table, we're good to go.
    if (
      parentQuery.tableName() !== query.tableName() &&
      !hasJoinsToTable(query, parentQuery.tableName())
    ) {
      return query;
    }

    return query.modelClass().query().from(query.as('mysql_subquery_fix'));
  }
}

function allowsSameTableSubqueries(knex: unknown): boolean {
  if (!isMariaDb(knex)) {
    return false;
  }

  const version = getMariaDbVersion(knex);

  // A MariaDB without a known version is assumed to be a current one.
  return !version || version[0] > 10 || (version[0] === 10 && version[1] >= 3);
}

function hasJoinsToTable(query: QueryBuilder, tableName: string): boolean {
  let found = false;

  query.forEachOperation(
    (query.constructor as typeof QueryBuilder).JoinSelector,
    (op): boolean | void => {
      // The join operations are `KnexOperation`s, which have `args`.
      if ((op as ObjectionToKnexConvertingOperation).args![0] === tableName) {
        found = true;
        return false;
      }
    },
  );

  return found;
}

export { WrapMysqlModifySubqueryTransformation };
