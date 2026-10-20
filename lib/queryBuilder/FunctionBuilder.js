'use strict';

const { RawBuilder, normalizeRawArgs } = require('./RawBuilder');
const { asSingle, isNumber, isPlainObject } = require('../utils/objectUtils');
const { getDialect, isMySql } = require('../utils/knexUtils');
const { FUNCTIONS } = require('./functions/mysql');

class FunctionBuilder extends RawBuilder {
  constructor(sql, args) {
    super(sql, args);
    // The name of the `fn` helper of a MySQL only function.
    this._mysqlFunction = null;
  }

  toKnexRaw(builder) {
    const knex = builder.unsafeKnex();

    if (this._mysqlFunction && knex && !isMySql(knex)) {
      throw new Error(
        `fn.${this._mysqlFunction}() is a MySQL function and can't be used with ${getDialect(knex)}.`,
      );
    }

    return super.toKnexRaw(builder);
  }
}

function fn(...argsIn) {
  const { sql, args } = normalizeRawArgs(argsIn);
  return new FunctionBuilder(`${sql}(${args.map(() => '?').join(', ')})`, args);
}

for (const func of ['coalesce', 'concat', 'sum', 'avg', 'min', 'max', 'count', 'upper', 'lower']) {
  fn[func] = (...args) => fn(func.toUpperCase(), args);
}

fn.now = (precision) => {
  precision = parseInt(asSingle(precision), 10);

  if (isNaN(precision) || !isNumber(precision)) {
    precision = 6;
  }

  // We need to use a literal precision instead of a binding here
  // for the CURRENT_TIMESTAMP to work. This is okay here since we
  // make sure `precision` is a number. There's no chance of SQL
  // injection here.
  return new FunctionBuilder(`CURRENT_TIMESTAMP(${precision})`, []);
};

for (const [name, sql, , , options = {}] of FUNCTIONS) {
  // `defineProperty` since `fn.length` is a read-only property of functions.
  Object.defineProperty(fn, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: createMySqlFunction(name, sql, options),
  });
}

function createMySqlFunction(name, sql, options) {
  return (...args) => {
    const [text, values] = options.build
      ? options.build(name, sql, args)
      : [`${sql}(${args.map(() => '?').join(', ')})`, args];

    const builder = createWithJsonArgs(text, values, options.json);

    if (!options.portable) {
      builder._mysqlFunction = name;
    }

    return builder;
  };
}

// Objects and arrays passed as JSON documents are cast to JSON. Without the cast
// MySQL would get a string (or knex would expand an array into a list).
function createWithJsonArgs(text, values, json) {
  const casts = values.map((value, i) => isJsonArg(json, i) && isJsonValue(value));
  let i = 0;

  text = text.replace(/\?/g, () => (casts[i++] ? 'CAST(? AS JSON)' : '?'));
  values = values.map((value, i) => (casts[i] ? JSON.stringify(value) : value));

  return new FunctionBuilder(text, values);
}

function isJsonArg(json, i) {
  if (json === 'all') {
    return true;
  } else if (json === 'even') {
    return i % 2 === 0;
  } else if (json === 'odd') {
    return i % 2 === 1;
  } else {
    return Array.isArray(json) && json.includes(i);
  }
}

function isJsonValue(value) {
  return Array.isArray(value) || isPlainObject(value);
}

module.exports = {
  FunctionBuilder,
  fn,
};
