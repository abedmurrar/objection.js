import { QueryBuilderOperation } from './QueryBuilderOperation';
import { StaticHookArguments, hasStaticHook } from '../StaticHookArguments';
import { isPromise, after, afterReturn } from '../../utils/promiseUtils';
import { isObject } from '../../utils/objectUtils';
import type { Model, QueryBuilder } from './types';

class FindOperation extends QueryBuilderOperation {
  onBefore2(builder: QueryBuilder, result: unknown): unknown {
    return afterReturn(callStaticBeforeFind(builder), result);
  }

  onAfter3(builder: QueryBuilder, results: unknown): unknown {
    const opt = builder.findOptions();

    if (opt.dontCallFindHooks) {
      return results;
    } else {
      return callAfterFind(builder, results);
    }
  }
}

function callStaticBeforeFind(builder: QueryBuilder): unknown {
  if (!hasStaticHook(builder.modelClass(), 'beforeFind')) {
    return undefined;
  }

  const args = StaticHookArguments.create({ builder });
  return builder.modelClass().beforeFind(args);
}

function callAfterFind(builder: QueryBuilder, result: unknown): unknown {
  const opt = builder.findOptions();
  const maybePromise = callInstanceAfterFind(builder.context(), result, opt.callAfterFindDeeply);

  return after(maybePromise, () => callStaticAfterFind(builder, result));
}

function callStaticAfterFind(builder: QueryBuilder, result: unknown): unknown {
  if (!hasStaticHook(builder.modelClass(), 'afterFind')) {
    return result;
  }

  const args = StaticHookArguments.create({ builder, result });
  const maybePromise = builder.modelClass().afterFind(args);

  return after(maybePromise, (maybeResult: unknown) => {
    if (maybeResult === undefined) {
      return result;
    } else {
      return maybeResult;
    }
  });
}

function callInstanceAfterFind(ctx: unknown, results: unknown, deep: boolean | undefined): unknown {
  if (Array.isArray(results)) {
    if (results.length === 1) {
      return callAfterFindForOne(ctx, results[0], results, deep);
    } else {
      return callAfterFindArray(ctx, results, deep);
    }
  } else {
    return callAfterFindForOne(ctx, results, results, deep);
  }
}

function callAfterFindArray(ctx: unknown, results: unknown[], deep: boolean | undefined): unknown {
  if (results.length === 0 || !isObject(results[0])) {
    return results;
  }

  const start = deep ? 0 : firstWithAfterFindHook(results);
  let promises: unknown[] | null = null;

  for (let i = start, l = results.length; i < l; ++i) {
    const maybePromise = callAfterFindForOne(ctx, results[i], results[i], deep);

    if (isPromise(maybePromise)) {
      if (promises === null) {
        promises = [maybePromise];
      } else {
        promises.push(maybePromise);
      }
    }
  }

  if (promises !== null) {
    return Promise.all(promises).then(() => results);
  } else {
    return results;
  }
}

// The index of the first result that may have its own `$afterFind`, or the
// length of `results` if none does. Usually no model class defines the hook,
// and the results are all checked with one property read each.
function firstWithAfterFindHook(results: unknown[]): number {
  const first = results[0] as Model;

  if (!first.$isObjectionModel) {
    return 0;
  }

  const defaultHook = first.$objectionModelClass.prototype.$afterFind;

  for (let i = 0, l = results.length; i < l; ++i) {
    const result = results[i];

    if (!isObject(result) || (result as Model).$afterFind !== defaultHook) {
      return i;
    }
  }

  return results.length;
}

function callAfterFindForOne(
  ctx: unknown,
  model: unknown,
  result: unknown,
  deep: boolean | undefined,
): unknown {
  if (!isObject(model) || !(model as Model).$isObjectionModel) {
    return result;
  }

  if (deep) {
    const results: unknown[] = [];
    const containsPromise = callAfterFindForRelations(ctx, model as Model, results);

    if (containsPromise) {
      return Promise.all(results).then(() => {
        return doCallAfterFind(ctx, model as Model, result);
      });
    } else {
      return doCallAfterFind(ctx, model as Model, result);
    }
  } else {
    return doCallAfterFind(ctx, model as Model, result);
  }
}

function callAfterFindForRelations(ctx: unknown, model: Model, results: unknown[]): boolean {
  const keys = Object.keys(model);
  let containsPromise = false;

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    const value = model[key];

    if (isRelation(value)) {
      const maybePromise = callInstanceAfterFind(ctx, value, true);

      if (isPromise(maybePromise)) {
        containsPromise = true;
      }

      results.push(maybePromise);
    }
  }

  return containsPromise;
}

function isRelation(value: unknown): boolean {
  return (
    (isObject(value) && (value as Model).$isObjectionModel) ||
    (isNonEmptyObjectArray(value) && (value as Model[])[0].$isObjectionModel)
  );
}

function isNonEmptyObjectArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && isObject(value[0]);
}

function doCallAfterFind(ctx: unknown, model: Model, result: unknown): unknown {
  const afterFind = getAfterFindHook(model);

  if (afterFind !== null) {
    const maybePromise = afterFind.call(model, ctx);

    if (isPromise(maybePromise)) {
      return maybePromise.then(() => result);
    } else {
      return result;
    }
  } else {
    return result;
  }
}

function getAfterFindHook(model: Model): Model['$afterFind'] | null {
  if (model.$afterFind !== model.$objectionModelClass.prototype.$afterFind) {
    return model.$afterFind;
  } else {
    return null;
  }
}

export { FindOperation };
