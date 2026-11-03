import { QueryBuilderOperation } from './QueryBuilderOperation';
import { StaticHookArguments, hasStaticHook } from '../StaticHookArguments';
import type { KnexBuilder, QueryBuilder } from './types';

class DeleteOperation extends QueryBuilderOperation {
  async onBefore2(builder: QueryBuilder, result: unknown): Promise<unknown> {
    await callBeforeDelete(builder);
    return result;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    assertNoOffset(builder);
    return knexBuilder.delete();
  }

  onAfter2(builder: QueryBuilder, result: unknown): unknown {
    return callAfterDelete(builder, result);
  }

  toFindOperation(): QueryBuilderOperation | null {
    return null;
  }
}

// Deletes have no offset in SQL, and knex leaves it out. The query would
// delete the first rows (MySQL with a limit) or every matching row.
// `page(0, n)` only adds `offset(0)`, so it's allowed.
function assertNoOffset(builder: QueryBuilder): void {
  builder.forEachOperation(/^offset$/, (op) => {
    const args = (op as unknown as { args: unknown[] | null }).args;

    if (args && args.length > 0 && Number(args[0]) !== 0) {
      throw new Error(
        "offset() can't be used with a delete query. knex leaves the offset out of deletes, so the query would delete the first rows, " +
          'or every matching row when there is no limit. Select the ids of the rows first, then delete them with whereIn().',
      );
    }
  });
}

function callBeforeDelete(builder: QueryBuilder): unknown {
  return callStaticBeforeDelete(builder);
}

function callStaticBeforeDelete(builder: QueryBuilder): unknown {
  if (!hasStaticHook(builder.modelClass(), 'beforeDelete')) {
    return undefined;
  }

  const args = StaticHookArguments.create({ builder });
  return builder.modelClass().beforeDelete(args);
}

function callAfterDelete(builder: QueryBuilder, result: unknown): Promise<unknown> {
  return callStaticAfterDelete(builder, result);
}

async function callStaticAfterDelete(builder: QueryBuilder, result: unknown): Promise<unknown> {
  if (!hasStaticHook(builder.modelClass(), 'afterDelete')) {
    return result;
  }

  const args = StaticHookArguments.create({ builder, result });
  const maybeResult = await builder.modelClass().afterDelete(args);

  if (maybeResult === undefined) {
    return result;
  } else {
    return maybeResult;
  }
}

export { DeleteOperation };
