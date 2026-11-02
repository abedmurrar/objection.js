import { cloneDeep } from './cloneDeep';

const SMALL_ARRAY_SIZE = 10;

// An object whose properties are read and written by key.
type AnyObject = Record<PropertyKey, unknown>;
type Compare = (val1: unknown, val2: unknown) => boolean;

function isEmpty(item: unknown): boolean {
  if (Array.isArray(item) || Buffer.isBuffer(item)) {
    return item.length === 0;
  } else if (isObject(item)) {
    return Object.keys(item).length === 0;
  } else {
    return true;
  }
}

// The `T &` keeps an `any` argument `any`.
function isObject<T>(value: T): value is T & object {
  return value !== null && typeof value === 'object';
}

// Quick and dirty check if an object is a plain object and not
// for example an instance of some class.
function isPlainObject<T>(value: T): value is T & AnyObject {
  return (
    isObject(value) &&
    (!value.constructor || value.constructor === Object) &&
    (!value.toString || value.toString === Object.prototype.toString)
  );
}

function isFunction<T>(value: T): value is T & Function {
  return typeof value === 'function';
}

function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function asArray<T>(value: T | readonly T[]): T[] {
  return Array.isArray(value) ? value : [value as T];
}

function asSingle<T>(value: T | readonly T[]): T {
  return Array.isArray(value) ? value[0] : (value as T);
}

function uniqBy<T, K = T>(items: ArrayLike<T>, keyGetter: ((item: T) => K) | null = null): T[] {
  const map = new Map<K, T>();

  for (let i = 0, l = items.length; i < l; ++i) {
    const item = items[i];
    const key = keyGetter !== null ? keyGetter(item) : (item as unknown as K);

    map.set(key, item);
  }

  return Array.from(map.values());
}

function groupBy<T, K = T>(
  items: Iterable<T>,
  keyGetter: ((item: T) => K) | null = null,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();

  for (const item of items) {
    const key = keyGetter !== null ? keyGetter(item) : (item as unknown as K);
    let group = groups.get(key);

    if (!group) {
      group = [];
      groups.set(key, group);
    }

    group.push(item);
  }

  return groups;
}

function omit(obj: object, keysToOmit: string | readonly string[]): AnyObject {
  const keysToOmitArray = asArray(keysToOmit);

  const keys = Object.keys(obj);
  const out: AnyObject = {};

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];

    if (!keysToOmitArray.includes(key)) {
      out[key] = (obj as AnyObject)[key];
    }
  }

  return out;
}

function difference<T>(arr1: ArrayLike<T>, arr2: Iterable<T>): T[] {
  const arr2Set = new Set(arr2);
  const diff: T[] = [];

  for (let i = 0; i < arr1.length; ++i) {
    const value = arr1[i];

    if (!arr2Set.has(value)) {
      diff.push(value);
    }
  }

  return diff;
}

function union<T>(arr1: readonly T[], arr2: readonly T[]): T[] {
  if (arr1.length < SMALL_ARRAY_SIZE && arr2.length < SMALL_ARRAY_SIZE) {
    return unionSmall(arr1, arr2);
  } else {
    return unionGeneric(arr1, arr2);
  }
}

function unionSmall<T>(arr1: readonly T[], arr2: readonly T[]): T[] {
  const all = arr1.slice();

  for (let i = 0, l = arr2.length; i < l; ++i) {
    const item = arr2[i];

    if (all.indexOf(item) === -1) {
      all.push(item);
    }
  }

  return all;
}

function unionGeneric<T>(arr1: readonly T[], arr2: readonly T[]): T[] {
  const all = new Set<T>();

  for (let i = 0; i < arr1.length; ++i) {
    all.add(arr1[i]);
  }

  for (let i = 0; i < arr2.length; ++i) {
    all.add(arr2[i]);
  }

  return Array.from(all);
}

function last<T>(arr: ArrayLike<T>): T {
  return arr[arr.length - 1];
}

function once<This, Args extends unknown[], R>(
  func: (this: This, ...args: Args) => R,
): (this: This, ...args: Args) => R {
  let called = false;
  let value: R;

  return function (this: This, ...args: Args): R {
    if (called === false) {
      called = true;
      value = func.apply(this, args);
    }

    return value;
  };
}

function flatten<T>(arrays: ArrayLike<T | readonly T[]>): T[] {
  const out: T[] = [];

  for (let i = 0, l = arrays.length; i < l; ++i) {
    const value = arrays[i];

    if (Array.isArray(value)) {
      for (let j = 0; j < value.length; ++j) {
        out.push(value[j]);
      }
    } else {
      out.push(value as T);
    }
  }

  return out;
}

function get(obj: unknown, path: readonly PropertyKey[]): unknown {
  for (let i = 0, l = path.length; i < l; ++i) {
    const key = path[i];

    if (!isObject(obj)) {
      return undefined;
    }

    obj = (obj as AnyObject)[key];
  }

  return obj;
}

function set<T>(obj: T, path: readonly PropertyKey[], value: unknown): T {
  const inputObj = obj;
  // `obj` walks down the path. It's indexed as is, like the JavaScript code
  // did, so a non-object input throws the same way.
  let current = obj as AnyObject;

  for (let i = 0, l = path.length - 1; i < l; ++i) {
    const key = path[i];

    if (!isSafeKey(key)) {
      return inputObj;
    }

    let child = current[key];

    if (!isObject(child)) {
      const nextKey = path[i + 1];

      // isNaN() converts the key to a number, so '1' is a number and 'a' is not.
      if (isNaN(nextKey as number)) {
        child = {};
      } else {
        child = [];
      }

      current[key] = child;
    }

    current = child as AnyObject;
  }

  if (path.length > 0 && isObject(current)) {
    const key = path[path.length - 1];

    if (isSafeKey(key)) {
      current[key] = value;
    }
  }

  return inputObj;
}

function zipObject(keys: ArrayLike<unknown>, values: ArrayLike<unknown>): AnyObject {
  const out: AnyObject = {};

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];

    if (isSafeKey(key)) {
      out[key] = values[i];
    }
  }

  return out;
}

function chunk<T>(arr: ArrayLike<T>, chunkSize: number): T[][] {
  const out: T[][] = [];

  for (let i = 0, l = arr.length; i < l; ++i) {
    const item = arr[i];

    if (out.length === 0 || out[out.length - 1].length === chunkSize) {
      out.push([]);
    }

    out[out.length - 1].push(item);
  }

  return out;
}

function jsonEquals(val1: unknown, val2: unknown): boolean {
  return jsonEqualsBase(val1, val2, compareStrict);
}

function jsonEqualsBase(val1: unknown, val2: unknown, compare: Compare): boolean {
  if (val1 === val2) {
    return true;
  }

  return jsonEqualsSlowPath(val1, val2, compare);
}

function jsonEqualsSlowPath(val1: unknown, val2: unknown, compare: Compare): boolean {
  const type1 = typeof val1;
  const type2 = typeof val2;

  const isNonNullObject1 = type1 === 'object' && !compare(val1, null);
  const isNonNullObject2 = type2 === 'object' && !compare(val2, null);

  if (isNonNullObject1 && isNonNullObject2) {
    const isArray1 = Array.isArray(val1);
    const isArray2 = Array.isArray(val2);

    if (isArray1 && isArray2) {
      return jsonEqualsArray(val1 as unknown[], val2 as unknown[], compare);
    } else if (!isArray1 && !isArray2) {
      return jsonEqualsObject(val1 as AnyObject, val2 as AnyObject, compare);
    } else {
      return false;
    }
  } else if (isNonNullObject1 !== isNonNullObject2) {
    return false;
  } else {
    return compare(val1, val2);
  }
}

function jsonEqualsArray(arr1: unknown[], arr2: unknown[], compare: Compare): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }

  for (let i = 0, l = arr1.length; i < l; ++i) {
    if (!jsonEqualsBase(arr1[i], arr2[i], compare)) {
      return false;
    }
  }

  return true;
}

function jsonEqualsObject(obj1: AnyObject, obj2: AnyObject, compare: Compare): boolean {
  if (obj1.constructor === Date && obj2.constructor === Date) {
    return equalsDate(obj1 as unknown as Date, obj2 as unknown as Date);
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (let i = 0, l = keys1.length; i < l; ++i) {
    const key = keys1[i];

    if (!jsonEqualsBase(obj1[key], obj2[key], compare)) {
      return false;
    }
  }

  return true;
}

function equalsDate(date1: Date, date2: Date): boolean {
  return date1.getTime() === date2.getTime();
}

function compareStrict(val1: unknown, val2: unknown): boolean {
  return val1 === val2;
}

function isSafeKey(key: unknown): key is string | number {
  return isNumber(key) || (isString(key) && key !== '__proto__');
}

function mergeMaps<K, V>(
  map1: Iterable<readonly [K, V]> | null | undefined,
  map2: ReadonlyMap<K, V> | null | undefined,
): Map<K, V> {
  const map = new Map(map1);

  if (map2) {
    for (const key of map2.keys()) {
      map.set(key, map2.get(key) as V);
    }
  }

  return map;
}

export {
  isEmpty,
  isString,
  isRegExp,
  isObject,
  isNumber,
  isFunction,
  jsonEquals,
  isPlainObject,
  difference,
  zipObject,
  mergeMaps,
  cloneDeep,
  asSingle,
  asArray,
  flatten,
  groupBy,
  uniqBy,
  union,
  chunk,
  omit,
  once,
  last,
  get,
  set,
};
