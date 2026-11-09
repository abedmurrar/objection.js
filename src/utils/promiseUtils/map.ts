import { isPromise } from './isPromise';

type Mapper<T, R> = (item: T, index: number) => R | PromiseLike<R>;

interface PromiseMapOptions {
  concurrency?: number;
}

interface MapContext<T, R> {
  reject: (err: unknown) => void;
  resolve: (results: R[]) => void;
  failed: boolean;
  error: unknown;
  index: number;
  numFinished: number;
  results: R[];
  items: ArrayLike<T>;
  mapper: Mapper<T, R>;
}

// Works like Bluebird.map.
function promiseMap<T, R>(
  items: ArrayLike<T>,
  mapper: Mapper<T, R>,
  opt?: PromiseMapOptions,
): PromiseLike<R[]> {
  switch (items.length) {
    case 0:
      return mapZero();
    case 1:
      return mapOne(items, mapper);
    default:
      return mapMany(items, mapper, opt);
  }
}

function mapZero<R>(): Promise<R[]> {
  return Promise.resolve([]);
}

function mapOne<T, R>(items: ArrayLike<T>, mapper: Mapper<T, R>): PromiseLike<R[]> {
  try {
    const maybePromise = mapper(items[0], 0);

    if (isPromise(maybePromise)) {
      return (maybePromise as PromiseLike<R>).then(wrapArray);
    } else {
      return Promise.resolve(wrapArray(maybePromise as R));
    }
  } catch (err) {
    return Promise.reject(err);
  }
}

function wrapArray<R>(item: R): R[] {
  return [item];
}

function mapMany<T, R>(
  items: ArrayLike<T>,
  mapper: Mapper<T, R>,
  opt: PromiseMapOptions = {},
): Promise<R[]> {
  return new Promise((resolve, reject) => {
    const concurrency = opt.concurrency || Number.MAX_SAFE_INTEGER;

    const ctx: MapContext<T, R> = {
      reject,
      resolve,
      failed: false,
      error: null,
      index: 0,
      numFinished: 0,
      results: new Array(items.length),
      items,
      mapper,
    };

    while (ctx.index < concurrency && ctx.index < items.length && !ctx.failed) {
      executeNext(ctx);
    }
  });
}

function executeNext<T, R>(ctx: MapContext<T, R>): void {
  try {
    if (ctx.failed) {
      return;
    }

    const index = ctx.index++;
    const item = ctx.items[index];
    const maybePromise = ctx.mapper(item, index);

    if (isPromise(maybePromise)) {
      // `catch` is called on the result of `then`, so the value is used as a
      // promise. Promises and query builders have both.
      (maybePromise as Promise<R>)
        .then((result) => afterExecute(ctx, result, index))
        .catch((err: unknown) => onError(ctx, err));
    } else {
      process.nextTick(() => afterExecute(ctx, maybePromise as R, index));
    }
  } catch (err) {
    onError(ctx, err);
  }
}

function afterExecute<T, R>(ctx: MapContext<T, R>, result: R, index: number): void {
  ctx.numFinished++;

  if (ctx.failed) {
    rejectWhenFinished(ctx);
    return;
  }

  ctx.results[index] = result;

  if (ctx.numFinished === ctx.items.length) {
    ctx.resolve(ctx.results);
  }

  if (ctx.index < ctx.items.length) {
    executeNext(ctx);
  }
}

function onError<T, R>(ctx: MapContext<T, R>, err: unknown): void {
  ctx.numFinished++;

  if (!ctx.failed) {
    ctx.failed = true;
    ctx.error = err;
  }

  rejectWhenFinished(ctx);
}

// Wait for all started mappers before rejecting: they may run queries in a
// transaction that the caller rolls back on rejection.
function rejectWhenFinished<T, R>(ctx: MapContext<T, R>): void {
  if (ctx.numFinished === ctx.index) {
    ctx.reject(ctx.error);
  }
}

export { promiseMap };
