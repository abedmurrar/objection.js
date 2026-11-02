const expect = require('expect.js');

/**
 * Expect that `result` contains all attributes of `partial` and their values equal.
 *
 * Example:
 *
 * ```js
 * // doesn't throw.
 * expectPartialEqual({a: 1, b: 2}, {a: 1});
 * // doesn't throw.
 * expectPartialEqual([{a: 1, b: 2}, {a: 2, b: 4}], [{a: 1}, {b: 4}]);
 * // Throws
 * expectPartialEqual({a: 1}, {b: 1});
 * // Throws
 * expectPartialEqual({a: 1}, {a: 2});
 * ```
 */
function expectPartialEqual(result, partial) {
  if (Array.isArray(result) && Array.isArray(partial)) {
    expect(result).to.have.length(partial.length);
    result.forEach((value, idx) => {
      expectPartialEqual(result[idx], partial[idx]);
    });
  } else if (
    isObject(result) &&
    !Array.isArray(partial) &&
    isObject(partial) &&
    !Array.isArray(result)
  ) {
    const picked = {};

    for (const key of Object.keys(partial)) {
      if (key in result) {
        picked[key] = result[key];
      }
    }

    expect(picked).to.eql(partial);
  } else {
    throw new Error('result and partial must both be arrays or objects');
  }
}

function isObject(value) {
  const type = typeof value;
  return value !== null && (type === 'object' || type === 'function');
}

/**
 * Sorts a copy of `list` (or of an object's values) like lodash's `sortBy`:
 * stable, and in ascending order of each of `iteratees` in turn. An iteratee
 * is a property name or a function, or an array of them. `null`, `undefined`
 * and `NaN` sort after the other values, in that order.
 */
function sortBy(list, iteratees = (it) => it) {
  const items = Array.isArray(list) ? list : Object.values(list || {});
  const getters = (Array.isArray(iteratees) ? iteratees : [iteratees]).map((it) =>
    typeof it === 'function' ? it : (value) => (value == null ? undefined : value[it]),
  );

  return items
    .map((value, index) => ({ value, index, criteria: getters.map((get) => get(value)) }))
    .sort((a, b) => {
      for (let i = 0; i < getters.length; ++i) {
        const order = compareAscending(a.criteria[i], b.criteria[i]);

        if (order !== 0) {
          return order;
        }
      }

      return a.index - b.index;
    })
    .map((it) => it.value);
}

// lodash's compareAscending.
function compareAscending(value, other) {
  if (value !== other) {
    const valIsDefined = value !== undefined;
    const valIsNull = value === null;
    const valIsReflexive = value === value;
    const valIsSymbol = typeof value === 'symbol';

    const othIsDefined = other !== undefined;
    const othIsNull = other === null;
    const othIsReflexive = other === other;
    const othIsSymbol = typeof other === 'symbol';

    if (
      (!othIsNull && !othIsSymbol && !valIsSymbol && value > other) ||
      (valIsSymbol && othIsDefined && othIsReflexive && !othIsNull && !othIsSymbol) ||
      (valIsNull && othIsDefined && othIsReflexive) ||
      (!valIsDefined && othIsReflexive) ||
      !valIsReflexive
    ) {
      return 1;
    }

    if (
      (!valIsNull && !valIsSymbol && !othIsSymbol && value < other) ||
      (othIsSymbol && valIsDefined && valIsReflexive && !valIsNull && !valIsSymbol) ||
      (othIsNull && valIsDefined && valIsReflexive) ||
      (!othIsDefined && valIsReflexive) ||
      !othIsReflexive
    ) {
      return -1;
    }
  }

  return 0;
}

// Calls `fn` for each item, one after the other, and resolves with the results.
async function mapSeries(items, fn) {
  const results = [];

  for (let i = 0; i < items.length; ++i) {
    results.push(await fn(items[i], i, items.length));
  }

  return results;
}

function createRejectionReflection(err) {
  return {
    isRejected: () => true,
    isFulfilled: () => false,
    reason: () => err,
  };
}

module.exports = {
  expectPartialEqual,
  sortBy,
  mapSeries,
  createRejectionReflection,
};
