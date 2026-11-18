import { isPromise } from './isPromise';

// Marks the rejections of the promises among `values[0..end)` as handled. A
// loop that collects promises and then throws synchronously for a later item
// rethrows that error, and the earlier promises would otherwise reject with
// nobody listening: an `unhandledRejection`, which ends the process by default.
function handleRejections(values: ArrayLike<unknown>, end: number = values.length): void {
  for (let i = 0; i < end; ++i) {
    const value = values[i];

    if (isPromise(value)) {
      (value as PromiseLike<unknown>).then(undefined, noop);
    }
  }
}

function noop(): void {}

export { handleRejections };
