import { isPromise } from './isPromise';

// Works like Bluebird.try.
function promiseTry<R>(callback: () => R | PromiseLike<R>): PromiseLike<R> {
  try {
    const maybePromise = callback();

    if (isPromise(maybePromise)) {
      return maybePromise as PromiseLike<R>;
    } else {
      return Promise.resolve(maybePromise as R);
    }
  } catch (err) {
    return Promise.reject(err);
  }
}

export { promiseTry };
