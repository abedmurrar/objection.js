import { QueryBuilderOperation } from './QueryBuilderOperation';
import { StaticHookArguments, hasStaticHook } from '../StaticHookArguments';
import { isMySql } from '../../utils/knexUtils';
import { deprecate } from '../../utils/deprecate';
import type { KnexBuilder, QueryBuilder } from './types';

class DeleteOperation extends QueryBuilderOperation {
  // Without static hooks, the hooks return synchronously, so that the query
  // doesn't wait for promises it doesn't need.
  onBefore2(builder: QueryBuilder, result: unknown): unknown {
    if (!hasStaticHook(builder.modelClass(), 'beforeDelete')) {
      return result;
    }

    return callStaticBeforeDelete(builder, result);
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    assertNoOffset(builder);
    warnOrderedLimit(builder);
    return knexBuilder.delete();
  }

  onAfter2(builder: QueryBuilder, result: unknown): unknown {
    if (!hasStaticHook(builder.modelClass(), 'afterDelete')) {
      return result;
    }

    return callStaticAfterDelete(builder, result);
  }

  toFindOperation(): QueryBuilderOperation | null {
    return null;
  }
}

// Deletes have no offset in SQL, and knex leaves it out. The query would
// delete the first rows (MySQL with a limit) or every matching row.
// `page(0, n)` only adds `offset(0)`, so it's allowed.
// It runs for every delete, so it matches by name (no regex) and the callback
// is defined once (no closure per call).
function assertNoOffset(builder: QueryBuilder): void {
  builder.forEachOperation('offset', assertZeroOffset);
}

function assertZeroOffset(op: QueryBuilderOperation): void {
  const args = (op as unknown as { args: unknown[] | null }).args;

  if (args && args.length > 0 && Number(args[0]) !== 0) {
    throw new Error(
      "offset() can't be used with a delete query. knex leaves the offset out of deletes, so the query would delete the first rows, " +
        'or every matching row when there is no limit. Select the ids of the rows first, then delete them with whereIn().',
    );
  }
}

// knex leaves the order out of deletes on MySQL but keeps their limit, so
// `delete().orderBy('id').limit(1)` deletes any one matching row.
function warnOrderedLimit(builder: QueryBuilder): void {
  if (isMySql(builder.unsafeKnex()) && builder.has('limit') && builder.has(/^orderBy/)) {
    deprecate(
      'orderBy() has no effect in delete queries with limit() on MySQL: knex leaves the order out, ' +
        'so the limit deletes matching rows in any order. Select the ids of the rows first, then ' +
        'delete them with whereIn(). This will throw an error in objection 5.0.',
    );
  }
}

async function callStaticBeforeDelete(builder: QueryBuilder, result: unknown): Promise<unknown> {
  const args = StaticHookArguments.create({ builder });
  await builder.modelClass().beforeDelete(args);
  return result;
}

async function callStaticAfterDelete(builder: QueryBuilder, result: unknown): Promise<unknown> {
  const args = StaticHookArguments.create({ builder, result });
  const maybeResult = await builder.modelClass().afterDelete(args);

  if (maybeResult === undefined) {
    return result;
  } else {
    return maybeResult;
  }
}

export { DeleteOperation };
