'use strict';

const { RawBuilder, normalizeRawArgs } = require('./RawBuilder');
const { ref } = require('./ReferenceBuilder');
const { expression } = require('./expressions');
const { asArray, asSingle, isNumber, isObject, isPlainObject } = require('../utils/objectUtils');
const { getDialect, isMySql } = require('../utils/knexUtils');
const { FUNCTIONS, buildOrderBy } = require('./functions/mysql');

class FunctionBuilder extends RawBuilder {
  constructor(sql, args) {
    super(sql, args);
    // The name of the `fn` helper of a MySQL only function.
    this._mysqlFunction = null;
    // For aggregate functions, the number of the first `?`s that are aggregated,
    // or '*' for `COUNT(*)`.
    this._aggregated = null;
    // The name of the `fn` helper of a window function.
    this._windowFunction = null;
    this._filters = [];
    this._over = null;
  }

  // Only aggregates the rows that match `condition`:
  //
  //   fn.count().filter(Pet.ref('species').eq('dog'))
  //
  // is `COUNT(CASE WHEN species = 'dog' THEN 1 END)`. That works on every
  // database, unlike `FILTER (WHERE ...)`.
  filter(condition) {
    if (this._aggregated === null) {
      throw new Error(
        'filter() only works with the aggregate functions of fn, like fn.count() and fn.sum().',
      );
    }

    this._filters.push(condition);
    return this;
  }

  // `fn.rowNumber().over({ partitionBy: 'ownerId', orderBy: ['createdAt', 'desc'] })`.
  over(window = {}) {
    for (const key of Object.keys(window)) {
      if (key !== 'partitionBy' && key !== 'orderBy') {
        throw new Error(`over(): unknown option "${key}". Use partitionBy and orderBy.`);
      }
    }

    this._over = window;
    return this;
  }

  toKnexRaw(builder) {
    const knex = builder.unsafeKnex();

    if (this._mysqlFunction && knex && !isMySql(knex)) {
      throw new Error(
        `fn.${this._mysqlFunction}() is a MySQL function and can't be used with ${getDialect(knex)}.`,
      );
    }

    if (this._windowFunction && !this._over) {
      throw new Error(`fn.${this._windowFunction}() is a window function and needs over().`);
    }

    if (this._filters.length === 0 && !this._over) {
      return super.toKnexRaw(builder);
    }

    return new RawBuilder(...this._buildFilterAndOver()).as(this._as).toKnexRaw(builder);
  }

  _buildFilterAndOver() {
    let sql = this._sql;
    let args = this._args;

    if (this._filters.length !== 0) {
      const condition =
        this._filters.length === 1
          ? this._filters[0]
          : expression(`(${this._filters.map(() => '?').join(' AND ')})`, this._filters);

      if (this._aggregated === '*') {
        sql = sql.replace('*', 'CASE WHEN ? THEN 1 END');
        args = [condition];
      } else {
        const filtered = [];
        let i = 0;

        sql = sql.replace(/\?/g, () => {
          const arg = args[i++];

          if (i <= this._aggregated) {
            filtered.push(condition, arg);
            return 'CASE WHEN ? THEN ? END';
          } else {
            filtered.push(arg);
            return '?';
          }
        });

        args = filtered;
      }
    }

    if (this._over) {
      const [overSql, overArgs] = buildOver(this._over);
      sql = `${sql} OVER (${overSql})`;
      args = [...args, ...overArgs];
    }

    return [sql, args];
  }
}

// `fn.case()` is `CASE WHEN condition THEN result ... END` and `fn.case(value)` is
// `CASE value WHEN other THEN result ... END`.
class CaseBuilder extends FunctionBuilder {
  constructor(hasValue, value) {
    super('', []);
    this._hasValue = hasValue;
    this._value = value;
    this._whens = [];
    this._hasElse = false;
    this._else = null;
  }

  when(condition, result) {
    this._whens.push([condition, result]);
    return this;
  }

  else(result) {
    this._hasElse = true;
    this._else = result;
    return this;
  }

  toKnexRaw(builder) {
    if (this._whens.length === 0) {
      throw new Error('fn.case() needs at least one when().');
    }

    const args = this._hasValue ? [this._value] : [];
    let sql = this._hasValue ? '(CASE ?' : '(CASE';

    for (const [condition, result] of this._whens) {
      sql += ' WHEN ? THEN ?';
      args.push(condition, result);
    }

    if (this._hasElse) {
      sql += ' ELSE ?';
      args.push(this._else);
    }

    this._sql = `${sql} END)`;
    this._args = args;

    return super.toKnexRaw(builder);
  }
}

// The value an upsert tried to insert: `VALUES(col)` on MySQL, `excluded.col` on
// postgres and SQLite.
class ExcludedBuilder extends FunctionBuilder {
  constructor(column) {
    super('', []);

    if (isObject(column) && column.isObjectionReferenceBuilder) {
      column = column.column;
    }

    if (typeof column !== 'string') {
      throw new Error('fn.excluded() takes a column name.');
    }

    this._column = column;
  }

  toKnexRaw(builder) {
    if (isMySql(builder.unsafeKnex())) {
      this._sql = 'VALUES(??)';
      this._args = [this._column];
    } else {
      this._sql = '??';
      this._args = [`excluded.${this._column}`];
    }

    return super.toKnexRaw(builder);
  }
}

function buildOver({ partitionBy, orderBy }) {
  const parts = [];
  const args = [];

  if (partitionBy !== undefined) {
    const columns = asArray(partitionBy).map((it) => (typeof it === 'string' ? ref(it) : it));
    parts.push(`PARTITION BY ${columns.map(() => '?').join(', ')}`);
    args.push(...columns);
  }

  if (orderBy !== undefined) {
    const [orderBySql, orderByArgs] = buildOrderBy('over()', orderBy);
    parts.push(`ORDER BY ${orderBySql}`);
    args.push(...orderByArgs);
  }

  return [parts.join(' '), args];
}

function fn(...argsIn) {
  const { sql, args } = normalizeRawArgs(argsIn);
  return new FunctionBuilder(`${sql}(${args.map(() => '?').join(', ')})`, args);
}

for (const func of ['coalesce', 'concat', 'upper', 'lower']) {
  fn[func] = (...args) => fn(func.toUpperCase(), args);
}

for (const func of ['sum', 'avg', 'min', 'max']) {
  fn[func] = (...args) => aggregate(fn(func.toUpperCase(), args), args.length);
}

// `fn.count()` and `fn.count('*')` are `COUNT(*)`.
fn.count = (...args) => {
  if (args.length === 0 || (args.length === 1 && args[0] === '*')) {
    return aggregate(new FunctionBuilder('COUNT(*)', []), '*');
  }

  return aggregate(fn('COUNT', args), args.length);
};

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

fn.case = (...args) => new CaseBuilder(args.length !== 0, args[0]);

fn.exists = (subquery) => {
  if (!isObject(subquery) || !subquery.isObjectionQueryBuilderBase) {
    throw new Error('fn.exists() takes a query.');
  }

  return new FunctionBuilder('(EXISTS ?)', [subquery]);
};

fn.excluded = (column) => new ExcludedBuilder(column);

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

    if (options.window) {
      builder._windowFunction = name;
    }

    if (options.aggregate) {
      aggregate(builder, options.aggregate === true ? args.length : options.aggregate(args));
    }

    return builder;
  };
}

function aggregate(builder, aggregated) {
  builder._aggregated = aggregated;
  return builder;
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

Object.defineProperties(FunctionBuilder.prototype, {
  isObjectionFunctionBuilder: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

module.exports = {
  FunctionBuilder,
  fn,
};
