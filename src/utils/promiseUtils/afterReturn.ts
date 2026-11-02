import { isPromise } from './isPromise';

// Return `returnValue` after `obj` has been resolved. Return `returnValue`
// synchronously if `obj` is not a promise for performance reasons.
function afterReturn<R>(obj: unknown, returnValue: R): R | PromiseLike<R> {
  if (isPromise(obj)) {
    return obj.then(() => returnValue);
  } else {
    return returnValue;
  }
}

export { afterReturn };
