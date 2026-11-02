'use strict';

const { isTypedArray, isMap, isSet, isProxy } = require('node:util').types;

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

function cloneDeep(value) {
  if (!isObject(value)) {
    return value;
  }

  return baseClone(value, false, new Map());
}

// `isNested` is true when the value is inside another value.
function baseClone(value, isNested, seen) {
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
    return clonePlainObject(value, seen);
  }

  return cloneOther(value, isNested, seen);
}

function cloneArray(array, seen) {
  const length = array.length;
  const Ctor = array.constructor;
  const result = new Ctor(length);

  // The properties `RegExp#exec` adds to its result.
  if (length && typeof array[0] === 'string' && hasOwnProperty.call(array, 'index')) {
    result.index = array.index;
    result.input = array.input;
  }

  const cloned = seen.get(array);

  if (cloned !== undefined) {
    return cloned;
  }

  seen.set(array, result);

  if (Ctor === Array) {
    // A new Array has no elements yet, so every assignment happens.
    for (let i = 0; i < length; ++i) {
      result[i] = baseClone(array[i], true, seen);
    }
  } else {
    for (let i = 0; i < length; ++i) {
      assignValue(result, i, baseClone(array[i], true, seen));
    }
  }

  return result;
}

// An object whose prototype is Object.prototype. This is the same as the
// general path for such objects, without the checks that can't apply.
function clonePlainObject(obj, seen) {
  const cloned = seen.get(obj);

  if (cloned !== undefined) {
    return cloned;
  }

  const result = {};
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

function cloneOther(value, isNested, seen) {
  const tag = getTag(value);
  const isFunc = tag === FUNC_TAG || tag === GEN_TAG;
  let result;

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
      result.add(baseClone(item, true, seen));
    });

    return result;
  }

  if (isMap(value)) {
    value.forEach((item, key) => {
      result.set(key, baseClone(item, true, seen));
    });

    return result;
  }

  const keys = getKeys(value);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    assignValue(result, key, baseClone(value[key], true, seen));
  }

  copySymbols(value, result, seen);
  return result;
}

function copySymbols(source, result, seen) {
  const symbols = getOwnPropertySymbols(source);

  for (let i = 0, l = symbols.length; i < l; ++i) {
    const symbol = symbols[i];

    if (propertyIsEnumerable.call(source, symbol)) {
      assignValue(result, symbol, baseClone(source[symbol], true, seen));
    }
  }
}

function initCloneObject(value) {
  if (typeof value.constructor === 'function' && !isPrototype(value)) {
    const proto = getPrototypeOf(value);
    return isObject(proto) ? Object.create(proto) : {};
  }

  return {};
}

function initCloneByTag(value, tag) {
  const Ctor = value.constructor;

  switch (tag) {
    case ARRAY_BUFFER_TAG:
      return cloneArrayBuffer(value);

    case BOOL_TAG:
    case DATE_TAG:
      return new Ctor(+value);

    case DATA_VIEW_TAG:
      return new Ctor(cloneArrayBuffer(value.buffer), value.byteOffset, value.byteLength);

    case MAP_TAG:
    case SET_TAG:
      return new Ctor();

    case NUMBER_TAG:
    case STRING_TAG:
      return new Ctor(value);

    case REGEXP_TAG: {
      const result = new Ctor(value.source, RE_FLAGS.exec(value));
      result.lastIndex = value.lastIndex;
      return result;
    }

    case SYMBOL_TAG:
      return Object(symbolValueOf.call(value));

    default:
      // A typed array.
      return new Ctor(cloneArrayBuffer(value.buffer), value.byteOffset, value.length);
  }
}

function cloneArrayBuffer(arrayBuffer) {
  const result = new arrayBuffer.constructor(arrayBuffer.byteLength);
  new Uint8Array(result).set(new Uint8Array(arrayBuffer));
  return result;
}

// lodash's `keys`: the own enumerable string keys, except the indexes and
// `length` of arguments objects and typed arrays (which are listed by index
// instead) and the `constructor` key of prototype objects.
function getKeys(value) {
  if (isArrayLike(value)) {
    return arrayLikeKeys(value);
  }

  const keys = objectKeys(value);
  return isPrototype(value) ? keys.filter((key) => key !== 'constructor') : keys;
}

function arrayLikeKeys(value) {
  const isArgs = getTag(value) === ARGS_TAG;
  const isTyped = !isArgs && isTypedArray(value);
  const skipIndexes = isArgs || isTyped;
  const length = skipIndexes ? value.length : 0;
  const result = [];

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
function getTag(value) {
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
function canWriteTag(value) {
  let obj = value;

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

function getTagByWriting(value) {
  const isOwn = hasOwnProperty.call(value, symToStringTag);
  const tag = value[symToStringTag];
  let unmasked = false;

  try {
    value[symToStringTag] = undefined;
    unmasked = true;
  } catch (err) {
    // The tag can't be written over, so it's used as is.
  }

  const result = toString.call(value);

  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }

  return result;
}

// Assigns unless the property already has the same value, as lodash does.
function assignValue(object, key, value) {
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

function defineOwn(object, key, value) {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function isObject(value) {
  const type = typeof value;
  return value !== null && (type === 'object' || type === 'function');
}

function isPrototype(value) {
  const Ctor = value.constructor;
  const proto = (typeof Ctor === 'function' && Ctor.prototype) || objectProto;
  return value === proto;
}

function isArrayLike(value) {
  return typeof value !== 'function' && isLength(value.length);
}

function isLength(value) {
  return typeof value === 'number' && value > -1 && value % 1 === 0 && value <= MAX_SAFE_INTEGER;
}

function isIndex(key, length) {
  return length > 0 && RE_IS_UINT.test(key) && key < length;
}

function sameValueZero(a, b) {
  return a === b || (a !== a && b !== b);
}

module.exports = {
  cloneDeep,
};
