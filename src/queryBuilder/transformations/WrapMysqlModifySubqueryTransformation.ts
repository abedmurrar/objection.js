import { QueryTransformation } from './QueryTransformation';
import { isMySql, isMariaDb, getMariaDbVersion } from '../../utils/knexUtils';
import type { QueryBuilder } from '../QueryBuilder';
import type { ObjectionToKnexConvertingOperation } from '../operations/ObjectionToKnexConvertingOperation';
import { JoinRelatedOperation } from '../operations/JoinRelatedOperation';
import { RelationExpression } from '../RelationExpression';
import { isFunction, isObject, isPlainObject, isString } from '../../utils/objectUtils';
import type { ModelClass } from '../operations/types';
import type { Relation } from '../../relations/Relation';

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

// Whether `query` joins the table `tableName`, which MySQL rejects in a subquery
// of an update or a delete of that table, also under an alias.
function hasJoinsToTable(query: QueryBuilder, tableName: string): boolean {
  let found = false;

  query.forEachOperation(
    (query.constructor as typeof QueryBuilder).JoinSelector,
    (op): boolean | void => {
      if (op instanceof JoinRelatedOperation) {
        found = joinRelatedReadsTable(query, op, tableName);
      } else {
        // The other join operations are `KnexOperation`s, which have `args`.
        const args = (op as ObjectionToKnexConvertingOperation).args;
        found =
          args !== undefined &&
          args !== null &&
          args.length > 0 &&
          joinTargetIsTable(args[0], tableName);
      }

      if (found) {
        return false;
      }
    },
  );

  return found;
}

// The first argument of `join()`: a table name, maybe with an alias
// (`'persons as p'`), an alias object (`{ p: 'persons' }`), a model class, a
// subquery or raw SQL, which can read any table.
function joinTargetIsTable(target: unknown, tableName: string): boolean {
  if (isString(target)) {
    return isTableName(target.trim().split(/\s+/)[0], tableName);
  } else if (isObject(target) && (target as QueryBuilder).isObjectionQueryBuilderBase) {
    const subquery = target as QueryBuilder;
    return subquery.tableName() === tableName || hasJoinsToTable(subquery, tableName);
  } else if (isFunction(target) && isFunction((target as ModelClass).getTableName)) {
    return (target as ModelClass).getTableName() === tableName;
  } else if (isPlainObject(target)) {
    return Object.values(target as object).some((value) => joinTargetIsTable(value, tableName));
  }

  // Raw SQL, or something else that isn't known.
  return true;
}

function isTableName(name: string, tableName: string): boolean {
  return name === tableName || name.endsWith(`.${tableName}`);
}

// The tables that the joins of `joinRelated()` read: the related tables and
// the join tables of the relations, and those of the nested relations.
function joinRelatedReadsTable(
  query: QueryBuilder,
  op: JoinRelatedOperation,
  tableName: string,
): boolean {
  const visit = (expr: RelationExpression, modelClass: ModelClass, depth: number): boolean => {
    let found = false;

    // Recursive expressions repeat the same tables.
    if (depth > 16) {
      return false;
    }

    expr.forEachChildExpression(modelClass, (childExpr, relation) => {
      if (found || relation === null) {
        return;
      }

      const rel = relation as Relation;

      if (
        query.tableNameFor(rel.relatedModelClass.getTableName()) === tableName ||
        (rel.joinTable !== null && rel.joinTable !== undefined && rel.joinTable === tableName)
      ) {
        found = true;
      } else {
        found = visit(childExpr, rel.relatedModelClass as ModelClass, depth + 1);
      }
    });

    return found;
  };

  return op.calls.some((call) =>
    visit(RelationExpression.create(call.expression), query.modelClass(), 0),
  );
}

export { WrapMysqlModifySubqueryTransformation };
