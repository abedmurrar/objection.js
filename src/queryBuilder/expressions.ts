import type { Knex } from 'knex';
import type { RelationModelClass } from '../relations/Relation';
import type { FunctionBuilder } from './FunctionBuilder';
import type * as FunctionBuilderModule from './FunctionBuilder';
import { isObject } from '../utils/objectUtils';

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

// A model class, as `ref().model()` takes it.
export type ModelClass = RelationModelClass;

// The objection query builder an expression is built for: `toKnexRaw(builder)`.
// Only the methods the expressions call.
export interface ExpressionQueryBuilder {
  knex(): Knex;
  unsafeKnex(): Knex | null;
  tableRefFor(modelClass: ModelClass): string;
}

// The methods `addExpressionMethods()` adds to a prototype.
export interface ExpressionMethods {
  eq(value: unknown): FunctionBuilder;
  ne(value: unknown): FunctionBuilder;
  in(values: unknown): FunctionBuilder;
  notIn(values: unknown): FunctionBuilder;
  like(pattern: unknown): FunctionBuilder;
  between(min: unknown, max: unknown): FunctionBuilder;
  isNull(): FunctionBuilder;
  isNotNull(): FunctionBuilder;
  isBlank(): FunctionBuilder;
  isNotBlank(): FunctionBuilder;
  and(...conditions: unknown[]): FunctionBuilder;
  or(...conditions: unknown[]): FunctionBuilder;
  not(): FunctionBuilder;
  gt(value: unknown): FunctionBuilder;
  gte(value: unknown): FunctionBuilder;
  lt(value: unknown): FunctionBuilder;
  lte(value: unknown): FunctionBuilder;
  plus(value: unknown): FunctionBuilder;
  minus(value: unknown): FunctionBuilder;
  times(value: unknown): FunctionBuilder;
  div(value: unknown): FunctionBuilder;
}

// `this` is the expression the method is called on.
type ExpressionMethod = (this: ExpressionMethods, ...args: never[]) => FunctionBuilder;

// A query: an objection query builder or a knex one.
interface Subquery {
  isObjectionQueryBuilderBase?: boolean;
  toSQL?: unknown;
}

const COMPARISONS: Record<string, string> = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

const ARITHMETIC: Record<string, string> = {
  plus: '+',
  minus: '-',
  times: '*',
  div: '/',
};

const methods: Record<string, ExpressionMethod | undefined> = {
  // `eq(null)` and `ne(null)` are `IS NULL` and `IS NOT NULL`, like `where(col, null)`.
  eq(value: unknown) {
    return value === null ? this.isNull() : expression('(? = ?)', [this, value]);
  },

  ne(value: unknown) {
    return value === null ? this.isNotNull() : expression('(? <> ?)', [this, value]);
  },

  in(values: unknown) {
    return createIn(this, values, 'IN');
  },

  notIn(values: unknown) {
    return createIn(this, values, 'NOT IN');
  },

  like(pattern: unknown) {
    return expression('(? LIKE ?)', [this, pattern]);
  },

  between(min: unknown, max: unknown) {
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

  and(...conditions: unknown[]) {
    return createLogic(this, conditions, 'AND');
  },

  or(...conditions: unknown[]) {
    return createLogic(this, conditions, 'OR');
  },

  not() {
    return expression('(NOT ?)', [this]);
  },
};

for (const [name, operator] of Object.entries(COMPARISONS)) {
  if (!methods[name]) {
    methods[name] = function (this: ExpressionMethods, value: unknown) {
      return expression(`(? ${operator} ?)`, [this, value]);
    };
  }
}

for (const [name, operator] of Object.entries(ARITHMETIC)) {
  methods[name] = function (this: ExpressionMethods, value: unknown) {
    return expression(`(? ${operator} ?)`, [this, value]);
  };
}

function createIn(left: ExpressionMethods, values: unknown, operator: string): FunctionBuilder {
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

function createLogic(first: ExpressionMethods, rest: unknown[], operator: string): FunctionBuilder {
  const conditions = [first, ...rest];
  return expression(`(${conditions.map(() => '?').join(` ${operator} `)})`, conditions);
}

function isSubquery(value: unknown) {
  return (
    isObject(value) &&
    ((value as Subquery).isObjectionQueryBuilderBase ||
      typeof (value as Subquery).toSQL === 'function')
  );
}

function expression(sql: string, args: unknown[]): FunctionBuilder {
  // Required here because `FunctionBuilder` itself gets these methods.
  const { FunctionBuilder } = require('./FunctionBuilder') as typeof FunctionBuilderModule;
  return new FunctionBuilder(sql, args);
}

function addExpressionMethods(prototype: object): void {
  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(prototype, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: method,
    });
  }
}

export { addExpressionMethods, expression };
