import { QueryBuilderOperation } from './QueryBuilderOperation';
import { StaticHookArguments, hasStaticHook } from '../StaticHookArguments';
import type { KnexBuilder, QueryBuilder } from './types';

class DeleteOperation extends QueryBuilderOperation {
  async onBefore2(builder: QueryBuilder, result: unknown): Promise<unknown> {
    await callBeforeDelete(builder);
    return result;
  }

  onBuildKnex(knexBuilder: KnexBuilder): KnexBuilder {
    return knexBuilder.delete();
  }

  onAfter2(builder: QueryBuilder, result: unknown): unknown {
    return callAfterDelete(builder, result);
  }

  toFindOperation(): QueryBuilderOperation | null {
    return null;
  }
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
