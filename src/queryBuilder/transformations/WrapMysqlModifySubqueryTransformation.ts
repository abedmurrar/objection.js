import { QueryTransformation } from './QueryTransformation';
import { isMySql } from '../../utils/knexUtils';
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
  // In a join callback `parentQuery` is a `JoinBuilder`, which the loop below walks past.
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

    // A subquery in a join callback belongs to the query of the join.
    while (parentQuery && typeof parentQuery.isUpdate !== 'function') {
      // The loop stops at the first parent query that is a `QueryBuilder`.
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
