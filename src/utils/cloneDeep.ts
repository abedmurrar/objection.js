import { types } from 'node:util';

const { isTypedArray, isMap, isSet, isProxy } = types;

// A deep clone that gives the same result as lodash 4.17's `cloneDeep`, which
// objection used before. Models clone their JSON attributes in `toJSON()` and
// validation clones the input, so this runs for every row of many queries.
// Plain objects and arrays take a fast path; everything else follows lodash's
// `baseClone` step by step, including its quirks:
//
// - A class instance is cloned into an object with the same prototype, which
//   gets the instance's own enumerable properties.
// - A Map or Set clones its values but not its keys or its other properties.
// - An Error, a WeakMap, a Promise, a function or any other value lodash can't
//   clone is kept by reference when it's inside another value. On its own it
//   clones to `{}` (with the function's own properties for a function).
// - An object without a prototype is cloned into a plain object.
// - The same object found twice gives the same clone, which also handles
//   circular references.
// - Enumerable symbol keys are copied after the other keys, and a `__proto__`
//   key is defined as an own property.
//
// The one difference: lodash's clone of a buffer shares the memory of the
// original (`buffer.slice()`), while this copies it.

// An object whose properties are read and written by key.
type AnyObject = Record<PropertyKey, unknown>;
// The clones of the objects found so far, by original.
type Seen = Map<object, unknown>;
// The constructor of a value that is cloned by its tag. The arguments depend
// on the tag.
type CloneConstructor = new (...args: unknown[]) => object;

const toString = Object.prototype.toString;
const hasOwnProperty = Object.prototype.hasOwnProperty;
const propertyIsEnumerable = Object.prototype.propertyIsEnumerable;
const getPrototypeOf = Object.getPrototypeOf;
const getOwnPropertySymbols = Object.getOwnPropertySymbols;
const objectKeys = Object.keys;
const objectProto = Object.prototype;
const symToStringTag = Symbol.toStringTag;
const symbolValueOf = Symbol.prototype.valueOf;

const ARGS_TAG = '[object Arguments]';
const ARRAY_BUFFER_TAG = '[object ArrayBuffer]';
const BOOL_TAG = '[object Boolean]';
const DATA_VIEW_TAG = '[object DataView]';
const DATE_TAG = '[object Date]';
const FUNC_TAG = '[object Function]';
const GEN_TAG = '[object GeneratorFunction]';
const MAP_TAG = '[object Map]';
const NUMBER_TAG = '[object Number]';
const OBJECT_TAG = '[object Object]';
const REGEXP_TAG = '[object RegExp]';
const SET_TAG = '[object Set]';
const STRING_TAG = '[object String]';
const SYMBOL_TAG = '[object Symbol]';

const TYPED_ARRAY_TAGS = [
  '[object Float32Array]',
  '[object Float64Array]',
  '[object Int8Array]',
  '[object Int16Array]',
  '[object Int32Array]',
  '[object Uint8Array]',
  '[object Uint8ClampedArray]',
  '[object Uint16Array]',
  '[object Uint32Array]',
];

// The tags lodash clones by type. Values with other tags (Error, WeakMap,
// Promise, a custom `Symbol.toStringTag` and so on) aren't cloned.
const CLONEABLE_TAGS = new Set([
  ARGS_TAG,
  '[object Array]',
  ARRAY_BUFFER_TAG,
  DATA_VIEW_TAG,
  BOOL_TAG,
  DATE_TAG,
  MAP_TAG,
  NUMBER_TAG,
  OBJECT_TAG,
  REGEXP_TAG,
  SET_TAG,
  STRING_TAG,
  SYMBOL_TAG,
  ...TYPED_ARRAY_TAGS,
]);

const RE_FLAGS = /\w*$/;
const RE_IS_UINT = /^(?:0|[1-9]\d*)$/;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

function cloneDeep<T>(value: T): T {
  if (!isObject(value)) {
    return value;
  }

  return baseClone(value, false, new Map()) as T;
}

// `isNested` is true when the value is inside another value.
function baseClone(value: unknown, isNested: boolean, seen: Seen): unknown {
  if (!isObject(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return cloneArray(value, seen);
  }

  if (Buffer.isBuffer(value)) {
    // Buffers are cloned before the lookup of values already seen, so a
    // buffer found twice gives two copies, as in lodash.
    const result = Buffer.allocUnsafe(value.length);
    value.copy(result);
    return result;
  }

  if (getPrototypeOf(value) === objectProto && !hasOwnProperty.call(value, symToStringTag)) {
    return clonePlainObject(value as AnyObject, seen);
  }

  return cloneOther(value, isNested, seen);
}

function cloneArray(array: unknown[], seen: Seen): unknown[] {
  const length = array.length;
  const Ctor = array.constructor as new (length: number) => unknown[];
  const result = new Ctor(length);

  // The properties `RegExp#exec` adds to its result.
  if (length && typeof array[0] === 'string' && hasOwnProperty.call(array, 'index')) {
    (result as RegExpExecArray).index = (array as RegExpExecArray).index;
    (result as RegExpExecArray).input = (array as RegExpExecArray).input;
  }

  const cloned = seen.get(array);

  if (cloned !== undefined) {
    return cloned as unknown[];
  }

  seen.set(array, result);

  if (Ctor === Array) {
    // A new Array has no elements yet, so every assignment happens.
    for (let i = 0; i < length; ++i) {
      result[i] = baseClone(array[i], true, seen);
    }
  } else {
    for (let i = 0; i < length; ++i) {
      assignValue(result as unknown as AnyObject, i, baseClone(array[i], true, seen));
    }
  }

  return result;
}

// An object whose prototype is Object.prototype. This is the same as the
// general path for such objects, without the checks that can't apply.
function clonePlainObject(obj: AnyObject, seen: Seen): AnyObject {
  const cloned = seen.get(obj);

  if (cloned !== undefined) {
    return cloned as AnyObject;
  }

  const result: AnyObject = {};
  seen.set(obj, result);

  const keys = objectKeys(obj);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];

    // lodash skips the `constructor` key of prototype objects.
    if (key === 'constructor' && !isArrayLike(obj) && isPrototype(obj)) {
      continue;
    }

    const value = baseClone(obj[key], true, seen);

    if (key === '__proto__') {
      defineOwn(result, key, value);
    } else {
      result[key] = value;
    }
  }

  copySymbols(obj, result, seen);
  return result;
}

function cloneOther(value: object, isNested: boolean, seen: Seen): unknown {
  const tag = getTag(value);
  const isFunc = tag === FUNC_TAG || tag === GEN_TAG;
  let result: object;

  if (tag === OBJECT_TAG || tag === ARGS_TAG || (isFunc && !isNested)) {
    result = isFunc ? {} : initCloneObject(value);
  } else if (!CLONEABLE_TAGS.has(tag)) {
    return isNested ? value : {};
  } else {
    result = initCloneByTag(value, tag);
  }

  const cloned = seen.get(value);

  if (cloned !== undefined) {
    return cloned;
  }

  seen.set(value, result);

  if (isSet(value)) {
    value.forEach((item) => {
      (result as Set<unknown>).add(baseClone(item, true, seen));
    });

    return result;
  }

  if (isMap(value)) {
    value.forEach((item, key) => {
      (result as Map<unknown, unknown>).set(key, baseClone(item, true, seen));
    });

    return result;
  }

  const keys = getKeys(value);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    assignValue(result as AnyObject, key, baseClone((value as AnyObject)[key], true, seen));
  }

  copySymbols(value, result as AnyObject, seen);
  return result;
}

function copySymbols(source: object, result: AnyObject, seen: Seen): void {
  const symbols = getOwnPropertySymbols(source);

  for (let i = 0, l = symbols.length; i < l; ++i) {
    const symbol = symbols[i];

    if (propertyIsEnumerable.call(source, symbol)) {
      assignValue(result, symbol, baseClone((source as AnyObject)[symbol], true, seen));
    }
  }
}

function initCloneObject(value: object): object {
  if (typeof value.constructor === 'function' && !isPrototype(value)) {
    const proto = getPrototypeOf(value);
    return isObject(proto) ? Object.create(proto) : {};
  }

  return {};
}

// `value` is an object with one of the tags in CLONEABLE_TAGS, other than
// the object, arguments and array tags.
function initCloneByTag(value: object, tag: string): object {
  const Ctor = value.constructor as CloneConstructor;

  switch (tag) {
    case ARRAY_BUFFER_TAG:
      return cloneArrayBuffer(value as ArrayBuffer);

    case BOOL_TAG:
    case DATE_TAG:
      return new Ctor(+value);

    case DATA_VIEW_TAG: {
      const dataView = value as DataView;
      return new Ctor(cloneArrayBuffer(dataView.buffer), dataView.byteOffset, dataView.byteLength);
    }

    case MAP_TAG:
    case SET_TAG:
      return new Ctor();

    case NUMBER_TAG:
    case STRING_TAG:
      return new Ctor(value);

    case REGEXP_TAG: {
      const regExp = value as RegExp;
      const result = new Ctor(regExp.source, RE_FLAGS.exec(regExp as unknown as string)) as RegExp;
      result.lastIndex = regExp.lastIndex;
      return result;
    }

    case SYMBOL_TAG:
      return Object(symbolValueOf.call(value as Symbol));

    default: {
      // A typed array.
      const typedArray = value as Uint8Array;
      return new Ctor(
        cloneArrayBuffer(typedArray.buffer),
        typedArray.byteOffset,
        typedArray.length,
      );
    }
  }
}

function cloneArrayBuffer(arrayBuffer: ArrayBufferLike): ArrayBufferLike {
  const result = new (arrayBuffer.constructor as new (byteLength: number) => ArrayBufferLike)(
    arrayBuffer.byteLength,
  );
  new Uint8Array(result).set(new Uint8Array(arrayBuffer));
  return result;
}

// lodash's `keys`: the own enumerable string keys, except the indexes and
// `length` of arguments objects and typed arrays (which are listed by index
// instead) and the `constructor` key of prototype objects.
function getKeys(value: object): string[] {
  if (isArrayLike(value)) {
    return arrayLikeKeys(value);
  }

  const keys = objectKeys(value);
  return isPrototype(value) ? keys.filter((key) => key !== 'constructor') : keys;
}

function arrayLikeKeys(value: ArrayLike<unknown> & object): string[] {
  const isArgs = getTag(value) === ARGS_TAG;
  const isTyped = !isArgs && isTypedArray(value);
  const skipIndexes = isArgs || isTyped;
  const length = skipIndexes ? value.length : 0;
  const result: string[] = [];

  for (let i = 0; i < length; ++i) {
    result.push(String(i));
  }

  for (const key in value) {
    if (
      hasOwnProperty.call(value, key) &&
      !(
        skipIndexes &&
        (key === 'length' ||
          (isTyped && (key === 'buffer' || key === 'byteLength' || key === 'byteOffset')) ||
          isIndex(key, length))
      )
    ) {
      result.push(key);
    }
  }

  return result;
}

// lodash's `getTag`, which reads the built-in tag of an object whose
// `Symbol.toStringTag` property can be written over, the way lodash does it:
// lodash writes `undefined` over the tag, reads the tag and puts it back.
// Writing over a read-only tag, like the ones of Map, Set and the typed
// arrays, throws. That is checked first, because a throw is slow.
function getTag(value: object): string {
  if (!(symToStringTag in value)) {
    return toString.call(value);
  }

  if (isProxy(value)) {
    return getTagByWriting(value);
  }

  return canWriteTag(value) ? getTagByWriting(value) : toString.call(value);
}

// Whether `value[Symbol.toStringTag] = undefined` would succeed: the first
// object up the prototype chain that has the property decides, as in the
// [[Set]] of ordinary objects.
function canWriteTag(value: object): boolean | undefined {
  let obj: object | null = value;

  while (obj !== null) {
    if (isProxy(obj)) {
      // A proxy decides for itself. Try it, as lodash does.
      return true;
    }

    const desc = Object.getOwnPropertyDescriptor(obj, symToStringTag);

    if (desc !== undefined) {
      if ('value' in desc) {
        return desc.writable && (obj === value || Object.isExtensible(value));
      }

      return desc.set !== undefined;
    }

    obj = getPrototypeOf(obj);
  }

  return true;
}

function getTagByWriting(value: object): string {
  const obj = value as AnyObject;
  const isOwn = hasOwnProperty.call(obj, symToStringTag);
  const tag = obj[symToStringTag];
  let unmasked = false;

  try {
    obj[symToStringTag] = undefined;
    unmasked = true;
  } catch (err) {
    // The tag can't be written over, so it's used as is.
  }

  const result = toString.call(obj);

  if (unmasked) {
    if (isOwn) {
      obj[symToStringTag] = tag;
    } else {
      delete obj[symToStringTag];
    }
  }

  return result;
}

// Assigns unless the property already has the same value, as lodash does.
function assignValue(object: AnyObject, key: PropertyKey, value: unknown): void {
  const objValue = object[key];

  if (
    !(hasOwnProperty.call(object, key) && sameValueZero(objValue, value)) ||
    (value === undefined && !(key in object))
  ) {
    if (key === '__proto__') {
      defineOwn(object, key, value);
    } else {
      object[key] = value;
    }
  }
}

function defineOwn(object: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function isObject(value: unknown): value is object {
  const type = typeof value;
  return value !== null && (type === 'object' || type === 'function');
}

function isPrototype(value: object): boolean {
  const Ctor = value.constructor;
  const proto = (typeof Ctor === 'function' && Ctor.prototype) || objectProto;
  return value === proto;
}

function isArrayLike(value: object): value is ArrayLike<unknown> {
  return typeof value !== 'function' && isLength((value as AnyObject).length);
}

function isLength(value: unknown): value is number {
  return typeof value === 'number' && value > -1 && value % 1 === 0 && value <= MAX_SAFE_INTEGER;
}

function isIndex(key: string, length: number): boolean {
  // `key < length` compares the key as a number.
  return length > 0 && RE_IS_UINT.test(key) && (key as unknown as number) < length;
}

function sameValueZero(a: unknown, b: unknown): boolean {
  return a === b || (a !== a && b !== b);
}

export { cloneDeep };
