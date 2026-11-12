import type { Knex } from 'knex';
import { RawBuilder, normalizeRawArgs } from './RawBuilder';
import { ref, type ReferenceBuilder } from './ReferenceBuilder';
import { expression, type ExpressionQueryBuilder } from './expressions';
import { asArray, asSingle, isNumber, isObject, isPlainObject } from '../utils/objectUtils';
import { getDialect, isMySql, isMariaDb, isSqlite } from '../utils/knexUtils';
import { jsonCastsForDialect, JSON_CAST } from '../utils/mysqlJsonPath';
import {
  FUNCTIONS,
  MARIADB_UNSUPPORTED,
  buildOrderBy,
  type FunctionOptions,
} from './functions/mysql';

// The options of `over()`.
interface OverOptions {
  partitionBy?: unknown;
  orderBy?: unknown;
}

class FunctionBuilder extends RawBuilder {
  declare _mysqlFunction: string | null;
  declare _mariaDbError: string | null;
  declare _aggregated: number | '*' | null;
  declare _windowFunction: string | null;
  declare _filters: unknown[];
  declare _over: OverOptions | null;
  declare readonly isObjectionFunctionBuilder: true;

  constructor(sql: unknown, args: unknown[]) {
    super(sql, args);
    // The name of the `fn` helper of a MySQL only function.
    this._mysqlFunction = null;
    // Why the helper can't be used on MariaDB, if it can't.
    this._mariaDbError = null;
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
  filter(condition: unknown): this {
    if (this._aggregated === null) {
      throw new Error(
        'filter() only works with the aggregate functions of fn, like fn.count() and fn.sum().',
      );
    }

    this._filters.push(condition);
    return this;
  }

  // `fn.rowNumber().over({ partitionBy: 'ownerId', orderBy: ['createdAt', 'desc'] })`.
  over(window: OverOptions = {}): this {
    for (const key of Object.keys(window)) {
      if (key !== 'partitionBy' && key !== 'orderBy') {
        throw new Error(`over(): unknown option "${key}". Use partitionBy and orderBy.`);
      }
    }

    this._over = window;
    return this;
  }

  toKnexRaw(builder: ExpressionQueryBuilder): Knex.Raw {
    const knex = builder.unsafeKnex();

    if (this._mysqlFunction && knex && !isMySql(knex)) {
      throw new Error(
        `fn.${this._mysqlFunction}() is a MySQL function and can't be used with ${getDialect(knex)}.`,
      );
    }

    // The SQL of the helpers is created before the database is known.
    if (knex && isMariaDb(knex) && this._sql.includes(JSON_CAST)) {
      const copy: this = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
      copy._sql = jsonCastsForDialect(this._sql, knex);
      return copy.toKnexRaw(builder);
    }

    if (this._mariaDbError && knex && isMariaDb(knex)) {
      throw new Error(this._mariaDbError);
    }

    if (this._windowFunction && !this._over) {
      throw new Error(`fn.${this._windowFunction}() is a window function and needs over().`);
    }

    if (this._filters.length === 0 && !this._over) {
      return super.toKnexRaw(builder);
    }

    return new RawBuilder(...this._buildFilterAndOver()).as(this._as).toKnexRaw(builder);
  }

  _buildFilterAndOver(): [string, unknown[]] {
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
        const filtered: unknown[] = [];
        let i = 0;

        sql = sql.replace(/\?/g, () => {
          const arg = args[i++];

          // A number: `filter()` needs an aggregate, and '*' is handled above.
          if (i <= (this._aggregated as number)) {
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
  declare _hasValue: boolean;
  declare _value: unknown;
  declare _whens: [unknown, unknown][];
  declare _hasElse: boolean;
  declare _else: unknown;

  constructor(hasValue: boolean, value: unknown) {
    super('', []);
    this._hasValue = hasValue;
    this._value = value;
    this._whens = [];
    this._hasElse = false;
    this._else = null;
  }

  when(condition: unknown, result: unknown): this {
    this._whens.push([condition, result]);
    return this;
  }

  else(result: unknown): this {
    this._hasElse = true;
    this._else = result;
    return this;
  }

  toKnexRaw(builder: ExpressionQueryBuilder): Knex.Raw {
    if (this._whens.length === 0) {
      throw new Error('fn.case() needs at least one when().');
    }

    const args: unknown[] = this._hasValue ? [this._value] : [];
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
  declare _column: string;

  constructor(column: unknown) {
    super('', []);

    if (isObject(column) && (column as ReferenceBuilder).isObjectionReferenceBuilder) {
      column = (column as ReferenceBuilder).column;
    }

    if (typeof column !== 'string') {
      throw new Error('fn.excluded() takes a column name.');
    }

    this._column = column;
  }

  toKnexRaw(builder: ExpressionQueryBuilder): Knex.Raw {
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

// `CURRENT_TIMESTAMP(precision)`, or `CURRENT_TIMESTAMP` on SQLite, which has
// no precision and rejects one.
class NowBuilder extends FunctionBuilder {
  declare _precision: number;

  constructor(precision: number) {
    super('', []);
    this._precision = precision;
  }

  toKnexRaw(builder: ExpressionQueryBuilder): Knex.Raw {
    // We need to use a literal precision instead of a binding here
    // for the CURRENT_TIMESTAMP to work. This is okay here since `fn.now()`
    // makes sure `precision` is a number. There's no chance of SQL
    // injection here.
    this._sql = isSqlite(builder.unsafeKnex())
      ? 'CURRENT_TIMESTAMP'
      : `CURRENT_TIMESTAMP(${this._precision})`;

    return super.toKnexRaw(builder);
  }
}

function buildOver({ partitionBy, orderBy }: OverOptions): [string, unknown[]] {
  const parts: string[] = [];
  const args: unknown[] = [];

  if (partitionBy !== undefined) {
    const columns = asArray(partitionBy).map((it: unknown) =>
      typeof it === 'string' ? ref(it) : it,
    );
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

// `fn` with the helpers that the loops below add by name.
type FnWithHelpers = typeof fn & Record<string, (...args: never[]) => FunctionBuilder>;

function fn(...argsIn: unknown[]): FunctionBuilder {
  const { sql, args } = normalizeRawArgs(argsIn);
  return new FunctionBuilder(`${sql}(${args.map(() => '?').join(', ')})`, args);
}

for (const func of ['coalesce', 'concat', 'upper', 'lower']) {
  (fn as FnWithHelpers)[func] = (...args: unknown[]) => fn(func.toUpperCase(), args);
}

for (const func of ['sum', 'avg', 'min', 'max']) {
  (fn as FnWithHelpers)[func] = (...args: unknown[]) =>
    aggregate(fn(func.toUpperCase(), args), args.length);
}

// `fn.count()` and `fn.count('*')` are `COUNT(*)`.
fn.count = (...args: unknown[]): FunctionBuilder => {
  if (args.length === 0 || (args.length === 1 && args[0] === '*')) {
    return aggregate(new FunctionBuilder('COUNT(*)', []), '*');
  }

  return aggregate(fn('COUNT', args), args.length);
};

fn.now = (precision: unknown): FunctionBuilder => {
  // `parseInt()` converts a number to a string first.
  precision = parseInt(asSingle(precision) as string, 10);

  // A number, from `parseInt()`.
  if (isNaN(precision as number) || !isNumber(precision)) {
    precision = 6;
  }

  return new NowBuilder(precision as number);
};

fn.case = (...args: unknown[]): CaseBuilder => new CaseBuilder(args.length !== 0, args[0]);

fn.exists = (subquery: unknown): FunctionBuilder => {
  if (
    !isObject(subquery) ||
    !(subquery as { isObjectionQueryBuilderBase?: boolean }).isObjectionQueryBuilderBase
  ) {
    throw new Error('fn.exists() takes a query.');
  }

  return new FunctionBuilder('(EXISTS ?)', [subquery]);
};

fn.excluded = (column: unknown): ExcludedBuilder => new ExcludedBuilder(column);

for (const [name, sql, , , options = {}] of FUNCTIONS) {
  // `defineProperty` since `fn.length` is a read-only property of functions.
  Object.defineProperty(fn, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: createMySqlFunction(name, sql, options),
  });
}

function createMySqlFunction(
  name: string,
  sql: string,
  options: FunctionOptions,
): (...args: unknown[]) => FunctionBuilder {
  return (...args) => {
    const [text, values] = options.build
      ? options.build(name, sql, args)
      : [`${sql}(${args.map(() => '?').join(', ')})`, args];

    const builder = createWithJsonArgs(text, values, options.json);

    if (!options.portable) {
      builder._mysqlFunction = name;
    }

    const mariaDbReason = MARIADB_UNSUPPORTED[name] && MARIADB_UNSUPPORTED[name](args);

    if (mariaDbReason) {
      builder._mariaDbError = `fn.${name}() ${mariaDbReason}.`;
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

function aggregate(builder: FunctionBuilder, aggregated: number | '*'): FunctionBuilder {
  builder._aggregated = aggregated;
  return builder;
}

// Objects and arrays passed as JSON documents are cast to JSON. Without the cast
// MySQL would get a string (or knex would expand an array into a list).
function createWithJsonArgs(
  text: string,
  values: unknown[],
  json: FunctionOptions['json'],
): FunctionBuilder {
  const casts = values.map((value, i) => isJsonArg(json, i) && isJsonValue(value));
  let i = 0;

  text = text.replace(/\?/g, () => (casts[i++] ? 'CAST(? AS JSON)' : '?'));
  values = values.map((value, i) => (casts[i] ? JSON.stringify(value) : value));

  return new FunctionBuilder(text, values);
}

function isJsonArg(json: FunctionOptions['json'], i: number): boolean {
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

function isJsonValue(value: unknown): boolean {
  return Array.isArray(value) || isPlainObject(value);
}

Object.defineProperties(FunctionBuilder.prototype, {
  isObjectionFunctionBuilder: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

export { FunctionBuilder, fn };
