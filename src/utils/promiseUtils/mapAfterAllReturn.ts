import { isPromise } from './isPromise';
import { handleRejections } from './handleRejections';

// Map `arr` with `mapper` and after that return `returnValue`. If none of
// the mapped values is a promise, return synchronously for performance
// reasons.
function mapAfterAllReturn<T, R>(
  arr: ArrayLike<T>,
  mapper: (item: T) => unknown,
  returnValue: R,
): R | Promise<R> {
  const results = new Array<unknown>(arr.length);
  let containsPromise = false;
  let i = 0;

  try {
    for (const l = arr.length; i < l; ++i) {
      results[i] = mapper(arr[i]);

      if (isPromise(results[i])) {
        containsPromise = true;
      }
    }
  } catch (err) {
    // The error of this item is thrown. The earlier items' promises may
    // still reject, with nobody waiting for them.
    handleRejections(results, i);
    throw err;
  }

  if (containsPromise) {
    return Promise.all(results).then(() => returnValue);
  } else {
    return returnValue;
  }
}

export { mapAfterAllReturn };
