'use strict';

const { cloneDeep: lodashCloneDeep } = require('./clone');

// A deep clone that gives the same result as lodash's `cloneDeep`, faster.
// Models clone their JSON attributes in `toJSON()` and validation clones the
// input, so this runs for every row of many queries. JSON-like values (plain
// objects, arrays, dates and buffers) are cloned here. Anything else, like a
// class instance, a Map or a typed array anywhere in the value, makes the whole
// value go to lodash, so that the two never mix.
//
// Like lodash, this keeps references to the same object as references to the
// same clone (which also handles circular references), clones buffers every
// time they appear, copies enumerable symbol keys after the other keys and
// defines `__proto__` keys as own properties.

const UNSUPPORTED = Symbol('unsupported');

function cloneDeep(value) {
  if (typeof value !== 'object' || value === null) {
    return typeof value === 'function' ? lodashCloneDeep(value) : value;
  }

  try {
    return cloneValue(value, new Map());
  } catch (err) {
    if (err === UNSUPPORTED) {
      return lodashCloneDeep(value);
    }

    throw err;
  }
}

function cloneValue(value, seen) {
  if (typeof value !== 'object' || value === null) {
    if (typeof value === 'function') {
      throw UNSUPPORTED;
    }

    return value;
  }

  // lodash clones buffers before it looks for references it has seen.
  if (Buffer.isBuffer(value)) {
    const result = Buffer.allocUnsafe(value.length);
    value.copy(result);
    return result;
  }

  const cloned = seen.get(value);

  if (cloned !== undefined) {
    return cloned;
  }

  const proto = Object.getPrototypeOf(value);

  if (proto === Array.prototype) {
    return cloneArray(value, seen);
  } else if (proto === Object.prototype) {
    return cloneObject(value, seen);
  } else if (proto === Date.prototype) {
    return cloneDate(value, seen);
  } else {
    throw UNSUPPORTED;
  }
}

function cloneArray(array, seen) {
  // lodash copies the `index` and `input` properties of RegExp match arrays.
  if (Object.prototype.hasOwnProperty.call(array, 'index')) {
    throw UNSUPPORTED;
  }

  const length = array.length;
  const result = new Array(length);
  seen.set(array, result);

  for (let i = 0; i < length; ++i) {
    result[i] = cloneValue(array[i], seen);
  }

  return result;
}

function cloneObject(obj, seen) {
  const result = {};
  seen.set(obj, result);

  const keys = Object.keys(obj);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    const value = cloneValue(obj[key], seen);

    if (key === '__proto__') {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    } else {
      result[key] = value;
    }
  }

  const symbols = Object.getOwnPropertySymbols(obj);

  for (let i = 0, l = symbols.length; i < l; ++i) {
    const symbol = symbols[i];

    if (Object.prototype.propertyIsEnumerable.call(obj, symbol)) {
      result[symbol] = cloneValue(obj[symbol], seen);
    }
  }

  return result;
}

function cloneDate(date, seen) {
  // lodash also copies the properties of a date object.
  if (Object.keys(date).length !== 0 || Object.getOwnPropertySymbols(date).length !== 0) {
    throw UNSUPPORTED;
  }

  const result = new Date(+date);
  seen.set(date, result);
  return result;
}

module.exports = {
  cloneDeep,
};
