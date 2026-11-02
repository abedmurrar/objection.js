import path from 'node:path';
import { isString, isFunction } from '../utils/objectUtils';

// A model class, as far as it's checked here.
type ModelClassLike = Function & { readonly isObjectionModelClass: unknown };

class ResolveError extends Error {}

function resolveModel(
  modelRef: unknown,
  modelPaths: readonly string[] | null | undefined,
  errorPrefix: string,
): ModelClassLike | undefined {
  try {
    if (isString(modelRef)) {
      if (isAbsolutePath(modelRef)) {
        return requireModel(modelRef);
      } else if (modelPaths) {
        return requireUsingModelPaths(modelRef, modelPaths);
      }
    } else {
      if (isFunction(modelRef) && !isModelClass(modelRef)) {
        modelRef = modelRef();
      }

      if (!isModelClass(modelRef)) {
        throw new ResolveError(
          `is not a subclass of Model or a file path to a module that exports one. You may be dealing with a require loop. See the documentation section about require loops.`,
        );
      }

      return modelRef;
    }
  } catch (err) {
    if (err instanceof ResolveError) {
      throw new Error(`${errorPrefix}: ${err.message}`);
    } else {
      throw err;
    }
  }

  // A relative path without `modelPaths` doesn't resolve to anything.
  return undefined;
}

function requireUsingModelPaths(modelRef: string, modelPaths: readonly string[]): ModelClassLike {
  let firstError: unknown = null;

  for (const modelPath of modelPaths) {
    try {
      return requireModel(path.join(modelPath, modelRef));
    } catch (err) {
      if (firstError === null) {
        firstError = err;
      }
    }
  }

  if (firstError) {
    throw firstError;
  } else {
    throw new ResolveError(`could not resolve ${modelRef} using modelPaths`);
  }
}

function requireModel(modelPath: string): ModelClassLike {
  /**
   * Wrap path string in template literal to prevent
   * warnings about Objection.JS being an expression
   * in webpack builds.
   * @link https://github.com/webpack/webpack/issues/196
   */
  // The module is the user's, so its exports can be anything.
  const mod = require(`${path.resolve(modelPath)}`) as Record<string, unknown>;
  let modelClass: unknown = null;

  if (isModelClass(mod)) {
    modelClass = mod;
  } else if (isModelClass(mod.default)) {
    // Babel 6 style of exposing default export.
    modelClass = mod.default;
  } else {
    Object.keys(mod).forEach((exportName) => {
      const exp = mod[exportName];

      if (isModelClass(exp)) {
        if (modelClass !== null) {
          throw new ResolveError(
            `path ${modelPath} exports multiple models. Don't know which one to choose.`,
          );
        }

        modelClass = exp;
      }
    });
  }

  if (!isModelClass(modelClass)) {
    throw new ResolveError(`${modelPath} is an invalid file path to a model class`);
  }

  return modelClass;
}

function isAbsolutePath(pth: string): boolean {
  return path.normalize(pth + '/') === path.normalize(path.resolve(pth) + '/');
}

// The `T &` keeps an `any` argument `any`.
function isModelClass<T>(maybeModel: T): maybeModel is T & ModelClassLike {
  // This returns the value of `isObjectionModelClass` as is, like the
  // JavaScript code did. It's `true` on model classes.
  return (isFunction(maybeModel) &&
    (maybeModel as unknown as ModelClassLike).isObjectionModelClass) as boolean;
}

export { resolveModel, isModelClass };
