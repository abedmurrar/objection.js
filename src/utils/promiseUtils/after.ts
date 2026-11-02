import { isPromise } from './isPromise';

// Call `func` after `obj` has been resolved. Call `func` synchronously if
// `obj` is not a promise for performance reasons.
function after<T, R>(
  obj: T | PromiseLike<T>,
  func: (value: T) => R | PromiseLike<R>,
): R | PromiseLike<R> {
  if (isPromise(obj)) {
    return (obj as PromiseLike<T>).then(func);
  } else {
    return func(obj as T);
  }
}

export { after };
