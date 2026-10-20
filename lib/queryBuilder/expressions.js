'use strict';

const { isObject } = require('../utils/objectUtils');

// Comparison, logic and arithmetic methods for `ref()`, `val()`, `fn()` and
// `raw()`, so that expressions can be written without raw sql:
//
//   Person.ref('age').gte(18).as('isAdult')
//   Pet.ref('order').plus(1)
//   Person.ref('firstName').isNotBlank().or(Person.ref('lastName').isNotBlank())
//
// Every method returns a new `FunctionBuilder`. The sql is wrapped in parentheses,
// so expressions can be nested without thinking about operator precedence. The
// arguments are bindings like the arguments of `fn()`: strings are values and
// columns are passed with `ref()` or `Model.ref()`.

const COMPARISONS = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const ARITHMETIC = {
  plus: '+',
  minus: '-',
  times: '*',
  div: '/',
};

const methods = {
  // `eq(null)` and `ne(null)` are `IS NULL` and `IS NOT NULL`, like `where(col, null)`.
  eq(value) {
    return value === null ? this.isNull() : expression('(? = ?)', [this, value]);
  },

  ne(value) {
    return value === null ? this.isNotNull() : expression('(? <> ?)', [this, value]);
  },

  in(values) {
    return createIn(this, values, 'IN');
  },

  notIn(values) {
    return createIn(this, values, 'NOT IN');
  },

  like(pattern) {
    return expression('(? LIKE ?)', [this, pattern]);
  },

  between(min, max) {
    return expression('(? BETWEEN ? AND ?)', [this, min, max]);
  },

  isNull() {
    return expression('(? IS NULL)', [this]);
  },

  isNotNull() {
    return expression('(? IS NOT NULL)', [this]);
  },

  // NULL, an empty string or a string of only spaces.
  isBlank() {
    return expression("(COALESCE(TRIM(?), '') = '')", [this]);
  },

  isNotBlank() {
    return expression("(COALESCE(TRIM(?), '') <> '')", [this]);
  },

  and(...conditions) {
    return createLogic(this, conditions, 'AND');
  },

  or(...conditions) {
    return createLogic(this, conditions, 'OR');
  },

  not() {
    return expression('(NOT ?)', [this]);
  },
};

for (const [name, operator] of Object.entries(COMPARISONS)) {
  if (!methods[name]) {
    methods[name] = function (value) {
      return expression(`(? ${operator} ?)`, [this, value]);
    };
  }
}

for (const [name, operator] of Object.entries(ARITHMETIC)) {
  methods[name] = function (value) {
    return expression(`(? ${operator} ?)`, [this, value]);
  };
}

function createIn(left, values, operator) {
  if (isSubquery(values)) {
    return expression(`(? ${operator} ?)`, [left, values]);
  }

  if (!Array.isArray(values)) {
    throw new Error(`${operator.toLowerCase()}() takes an array or a subquery.`);
  }

  if (values.length === 0) {
    // Like knex's `whereIn(col, [])`.
    return expression(operator === 'IN' ? '(1 = 0)' : '(1 = 1)', []);
  }

  return expression(`(? ${operator} (${values.map(() => '?').join(', ')}))`, [left, ...values]);
}

function createLogic(first, rest, operator) {
  const conditions = [first, ...rest];
  return expression(`(${conditions.map(() => '?').join(` ${operator} `)})`, conditions);
}

function isSubquery(value) {
  return (
    isObject(value) && (value.isObjectionQueryBuilderBase || typeof value.toSQL === 'function')
  );
}

function expression(sql, args) {
  // Required here because `FunctionBuilder` itself gets these methods.
  const { FunctionBuilder } = require('./FunctionBuilder');
  return new FunctionBuilder(sql, args);
}

function addExpressionMethods(prototype) {
  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(prototype, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: method,
    });
  }
}

module.exports = {
  addExpressionMethods,
  expression,
};
