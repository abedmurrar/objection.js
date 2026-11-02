import { isObject, isFunction } from '../objectUtils';

// The `T &` keeps an `any` argument `any`.
function isPromise<T>(obj: T): obj is T & PromiseLike<unknown> {
  return isObject(obj) && isFunction((obj as { then?: unknown }).then);
}

export { isPromise };
