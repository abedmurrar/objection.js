/// <reference types="node" />

// Type definitions for Objection.js
// Project: <http://vincit.github.io/objection.js/>
//
// Contributions by:
// * Matthew McEachen <https://github.com/mceachen>
// * Sami Koskimäki <https://github.com/koskimas>
// * Mikael Lepistö <https://github.com/elhigu>
// * Joseph T Lapp <https://github.com/jtlapp>
// * Drew R. <https://github.com/drew-r>
// * Karl Blomster <https://github.com/kblomster>
// * And many others: See <https://github.com/Vincit/objection.js/blob/main/typings/objection/index.d.ts>

import Ajv, { Options as AjvOptions } from 'ajv';
import * as dbErrors from 'db-errors';
import { Knex } from 'knex';
import {
  GraphNode,
  ParseError,
  ParseRelationExpression,
  UnknownGraph,
} from './relation-expression';

// Export the entire Objection namespace.
export = Objection;

declare namespace Objection {
  const raw: RawFunction;
  const val: ValueFunction;
  const ref: ReferenceFunction;
  const fn: FunctionFunction;

  const compose: ComposeFunction;
  const mixin: MixinFunction;
  const defineRelations: DefineRelationsFunction;

  const BelongsToOneRelation: RelationType<'one'>;
  const HasOneRelation: RelationType<'one'>;
  const HasManyRelation: RelationType<'many'>;
  const ManyToManyRelation: RelationType<'many'>;
  const HasOneThroughRelation: RelationType<'one'>;

  const snakeCaseMappers: SnakeCaseMappersFactory;
  const knexSnakeCaseMappers: KnexSnakeCaseMappersFactory;

  const transaction: transaction;
  const initialize: initialize;

  const DBError: typeof dbErrors.DBError;
  const DataError: typeof dbErrors.DataError;
  const CheckViolationError: typeof dbErrors.CheckViolationError;
  const UniqueViolationError: typeof dbErrors.UniqueViolationError;
  const ConstraintViolationError: typeof dbErrors.ConstraintViolationError;
  const ForeignKeyViolationError: typeof dbErrors.ForeignKeyViolationError;
  const NotNullViolationError: typeof dbErrors.NotNullViolationError;

  export interface RawBuilder extends Aliasable {}
  /**
   * What `raw()` returns: a `RawBuilder` with the expression methods.
   */
  export interface RawExpressionBuilder extends RawBuilder, ExpressionMethods {}

  export interface RawFunction extends RawInterface<RawExpressionBuilder> {}
  export interface RawInterface<R> {
    (sql: string, ...bindings: any[]): R;
  }

  export interface ValueBuilder extends Castable, ExpressionMethods {}
  export interface ValueFunction {
    (
      value: PrimitiveValue | PrimitiveValue[] | PrimitiveValueObject | PrimitiveValueObject[],
    ): ValueBuilder;
  }

  /**
   * A reference to a column or a field of a JSON column. `T` is the type of the value.
   */
  export interface ReferenceBuilder<T = unknown> extends Aliasable, ExpressionMethods {
    /**
     * The type of the referenced value. Only used by the typings.
     */
    '~type'?: T;
    from(tableReference: string): this;
    table(tableReference: string): this;
    castText(): ReferenceBuilder<string | null>;
    castInt(): ReferenceBuilder<number | null>;
    castBigInt(): ReferenceBuilder<FnNumeric | null>;
    castFloat(): ReferenceBuilder<number | null>;
    castDecimal(): ReferenceBuilder<FnNumeric | null>;
    castReal(): ReferenceBuilder<number | null>;
    castBool(): ReferenceBuilder<boolean | 0 | 1 | null>;
    castJson(): ReferenceBuilder<unknown>;
    castTo<U = unknown>(sqlType: string): ReferenceBuilder<U>;
  }
  export interface ReferenceFunction {
    (expression: string): ReferenceBuilder;
  }

  /**
   * The columns of model `M`: its data properties, without relations and methods.
   */
  type RefColumnName<M> = Extract<ModelProps<Extract<M, Model>>, string>;

  type IsJsonType<T> = 0 extends 1 & T
    ? true
    : unknown extends T
      ? true
      : [Exclude<T, null | undefined>] extends [Date | Buffer]
        ? false
        : [Exclude<T, null | undefined>] extends [object]
          ? true
          : false;

  /**
   * The columns of model `M` that hold JSON objects or arrays.
   */
  type JsonColumnName<M> = {
    [K in RefColumnName<M>]: IsJsonType<M[K & keyof M]> extends true ? K : never;
  }[RefColumnName<M>];

  /**
   * The json field part of a field expression (`a.b`, `[0]`, `[key]`) for a column of
   * type `T`. The first key is checked when `T` has known keys.
   */
  type JsonFieldPath<T> = 0 extends 1 & T
    ? string
    : unknown extends T
      ? string
      : T extends readonly unknown[]
        ? `[${string}` | `${number}${string}`
        : string extends keyof T
          ? string
          : `${Extract<keyof T, string>}${'' | `.${string}` | `[${string}`}` | `[${string}`;

  /**
   * The expressions `Model.ref()` accepts for model `M`: a column, optionally with a
   * table or alias (`alias.column`), and field expressions of JSON columns
   * (`column:a.b`). Models that declare no columns accept any string.
   */
  type RefExpression<M> = [RefColumnName<M>] extends [never]
    ? string
    :
        | RefColumnName<M>
        | `${string}.${RefColumnName<M>}`
        | '*'
        | {
            [K in JsonColumnName<M>]: `${K | `${string}.${K}`}:${JsonFieldPath<
              Exclude<M[K & keyof M], null | undefined>
            >}`;
          }[JsonColumnName<M>];

  type RefValue<M, E> = E extends `${string}:${string}`
    ? unknown
    : E extends `${string}.${infer C}`
      ? M[C & keyof M]
      : M[E & keyof M];

  export interface FunctionBuilder<T = unknown> extends Castable, ExpressionMethods {
    /**
     * The type of the result of the function. Only used by the typings.
     */
    '~type'?: T;
  }
  export interface SqlFunctionShortcut<T = unknown> {
    (...args: any[]): FunctionBuilder<T>;
  }
  export interface AggregateFunctionShortcut<T = unknown> {
    (...args: any[]): AggregateFunctionBuilder<T>;
  }

  /**
   * An aggregate function like `fn.count()` or `fn.sum()`.
   */
  export interface AggregateFunctionBuilder<T = unknown> extends FunctionBuilder<T> {
    /**
     * Only aggregates the rows that match `condition`.
     * `fn.count().filter(Pet.ref('species').eq('dog'))` is
     * `COUNT(CASE WHEN species = 'dog' THEN 1 END)`. Calling it again adds a
     * condition with `AND`.
     */
    filter(condition: FnArg): this;
    /**
     * Uses the function as a window function: `fn.sum(ref('amount')).over({ partitionBy: 'ownerId' })`.
     */
    over(window?: FnWindow): this;
  }

  /**
   * A window function like `fn.rowNumber()`. It can only be used after `over()`.
   */
  export interface WindowFunctionBuilder<T = unknown> {
    over(window?: FnWindow): FunctionBuilder<T>;
  }

  /**
   * The window of `over()`. Strings are column names.
   */
  interface FnWindow {
    partitionBy?: FnArg | readonly FnArg[];
    orderBy?: FnOrderBy | readonly FnOrderBy[];
  }

  /**
   * `fn.case()` and `fn.case(value)`.
   */
  export interface CaseBuilder<T = never> extends FunctionBuilder<T | null> {
    /**
     * `WHEN condition THEN result`, or `WHEN value THEN result` for `fn.case(value)`.
     */
    when<const R>(condition: FnArg, result: R): CaseBuilder<T | FnResult<R>>;
    else<const R>(result: R): FunctionBuilder<T | FnResult<R>>;
  }

  /**
   * The type of the value of an expression.
   */
  type FnResult<R> =
    R extends FunctionBuilder<infer U>
      ? U
      : R extends ReferenceBuilder<infer U>
        ? U
        : R extends Raw | ValueBuilder | AnyQueryBuilder
          ? unknown
          : R;

  /**
   * The value of a condition: a boolean on postgres, 0 or 1 on MySQL and SQLite, and
   * NULL when a compared value is NULL.
   */
  type SqlBoolean = boolean | 0 | 1 | null;

  /**
   * An expression with a known value type.
   */
  interface Typed {
    '~type'?: unknown;
  }

  /**
   * A value to compare with a value of type `T`. Dates can also be compared with
   * strings.
   */
  type CompareValue<T> = unknown extends T
    ? FnArg
    : Exclude<T, undefined> | (Date extends T ? string : never) | null | FnExpression;

  /**
   * Comparison, logic and arithmetic methods of `ref()`, `val()`, `fn()` and `raw()`:
   * `Person.ref('age').gte(18)`, `Pet.ref('order').plus(1)`. The sql of each one is
   * wrapped in parentheses. Values are checked against the type of the expression.
   */
  interface ExpressionMethods {
    /**
     * The type of the value. Only used by the typings.
     */
    '~type'?: unknown;
    /**
     * `= value`. `eq(null)` is `IS NULL`.
     */
    eq<S extends Typed>(this: S, value: CompareValue<S['~type']>): FunctionBuilder<SqlBoolean>;
    /**
     * `<> value`. `ne(null)` is `IS NOT NULL`.
     */
    ne<S extends Typed>(this: S, value: CompareValue<S['~type']>): FunctionBuilder<SqlBoolean>;
    gt<S extends Typed>(this: S, value: CompareValue<S['~type']>): FunctionBuilder<SqlBoolean>;
    gte<S extends Typed>(this: S, value: CompareValue<S['~type']>): FunctionBuilder<SqlBoolean>;
    lt<S extends Typed>(this: S, value: CompareValue<S['~type']>): FunctionBuilder<SqlBoolean>;
    lte<S extends Typed>(this: S, value: CompareValue<S['~type']>): FunctionBuilder<SqlBoolean>;
    in<S extends Typed>(
      this: S,
      values: readonly CompareValue<S['~type']>[] | AnyQueryBuilder,
    ): FunctionBuilder<SqlBoolean>;
    notIn<S extends Typed>(
      this: S,
      values: readonly CompareValue<S['~type']>[] | AnyQueryBuilder,
    ): FunctionBuilder<SqlBoolean>;
    like(pattern: string | FnExpression): FunctionBuilder<SqlBoolean>;
    between<S extends Typed>(
      this: S,
      min: CompareValue<S['~type']>,
      max: CompareValue<S['~type']>,
    ): FunctionBuilder<SqlBoolean>;
    isNull(): FunctionBuilder<SqlBoolean>;
    isNotNull(): FunctionBuilder<SqlBoolean>;
    /**
     * NULL, an empty string or a string of only spaces.
     */
    isBlank(): FunctionBuilder<SqlBoolean>;
    isNotBlank(): FunctionBuilder<SqlBoolean>;
    and(...conditions: FnArg[]): FunctionBuilder<SqlBoolean>;
    or(...conditions: FnArg[]): FunctionBuilder<SqlBoolean>;
    not(): FunctionBuilder<SqlBoolean>;
    plus(value: FnArg): FunctionBuilder<FnNumeric | null>;
    minus(value: FnArg): FunctionBuilder<FnNumeric | null>;
    times(value: FnArg): FunctionBuilder<FnNumeric | null>;
    div(value: FnArg): FunctionBuilder<FnNumeric | null>;
  }

  /**
   * A number that the database driver may return as a string, like `DECIMAL` and
   * `BIGINT` values with mysql2's and pg's default settings.
   */
  type FnNumeric = number | string;
  /**
   * An argument of an `fn` helper. Strings are values; use `ref()` for columns.
   */
  type FnArg =
    | ReferenceBuilder
    | Raw
    | FunctionBuilder<any>
    | ValueBuilder
    | AnyQueryBuilder
    | PrimitiveValue;
  /**
   * A JSON document argument. Objects and arrays are cast to JSON.
   */
  type FnJsonArg = FnArg | object;
  /**
   * An `fn` argument that isn't a plain value.
   */
  type FnExpression = Exclude<FnArg, PrimitiveValue>;
  type FnOrderBy = FnArg | [FnArg, 'asc' | 'desc' | 'ASC' | 'DESC'];

  // <generated:mysql-function-types>
  type FnIntervalUnit =
    | 'MICROSECOND'
    | 'microsecond'
    | 'SECOND'
    | 'second'
    | 'MINUTE'
    | 'minute'
    | 'HOUR'
    | 'hour'
    | 'DAY'
    | 'day'
    | 'WEEK'
    | 'week'
    | 'MONTH'
    | 'month'
    | 'QUARTER'
    | 'quarter'
    | 'YEAR'
    | 'year'
    | 'SECOND_MICROSECOND'
    | 'second_microsecond'
    | 'MINUTE_MICROSECOND'
    | 'minute_microsecond'
    | 'MINUTE_SECOND'
    | 'minute_second'
    | 'HOUR_MICROSECOND'
    | 'hour_microsecond'
    | 'HOUR_SECOND'
    | 'hour_second'
    | 'HOUR_MINUTE'
    | 'hour_minute'
    | 'DAY_MICROSECOND'
    | 'day_microsecond'
    | 'DAY_SECOND'
    | 'day_second'
    | 'DAY_MINUTE'
    | 'day_minute'
    | 'DAY_HOUR'
    | 'day_hour'
    | 'YEAR_MONTH'
    | 'year_month';
  type FnTimestampUnit =
    | 'MICROSECOND'
    | 'microsecond'
    | 'SECOND'
    | 'second'
    | 'MINUTE'
    | 'minute'
    | 'HOUR'
    | 'hour'
    | 'DAY'
    | 'day'
    | 'WEEK'
    | 'week'
    | 'MONTH'
    | 'month'
    | 'QUARTER'
    | 'quarter'
    | 'YEAR'
    | 'year';
  // </generated:mysql-function-types>

  export interface FunctionFunction {
    (functionName: string, ...arguments: any[]): FunctionBuilder;

    now(precision: number): FunctionBuilder<Date | string>;
    now(): FunctionBuilder<Date | string>;

    coalesce: SqlFunctionShortcut;
    concat: SqlFunctionShortcut<string | null>;
    sum: AggregateFunctionShortcut<FnNumeric | null>;
    avg: AggregateFunctionShortcut<FnNumeric | null>;
    min: AggregateFunctionShortcut;
    max: AggregateFunctionShortcut;
    /**
     * `fn.count()` and `fn.count('*')` are `COUNT(*)`.
     */
    count: AggregateFunctionShortcut<FnNumeric>;
    upper: SqlFunctionShortcut<string | null>;
    lower: SqlFunctionShortcut<string | null>;

    /**
     * `fn.case().when(condition, result).else(result)` is `CASE WHEN ... END`.
     */
    case(): CaseBuilder;
    /**
     * `fn.case(value).when(other, result).else(result)` is `CASE value WHEN ... END`.
     */
    case(value: FnArg): CaseBuilder;
    /**
     * `EXISTS (subquery)`.
     */
    exists(subquery: AnyQueryBuilder): FunctionBuilder<SqlBoolean>;
    /**
     * The value an upsert tried to insert, for `onConflict().merge({ ... })`:
     * `VALUES(column)` on MySQL, `excluded.column` on postgres and SQLite.
     */
    excluded(column: string | ReferenceBuilder): FunctionBuilder;

    // The MySQL built-in functions. Generated from lib/queryBuilder/functions/mysql.js
    // by scripts/generate-fn-typings.js.
    // <generated:mysql-functions>
    /** `ASCII()` (portable) */
    ascii(str: FnArg): FunctionBuilder<number | null>;
    /** `BIN()` (MySQL) */
    bin(n: FnArg): FunctionBuilder<string | null>;
    /** `BIT_LENGTH()` (portable) */
    bitLength(str: FnArg): FunctionBuilder<number | null>;
    /** `CHAR()` (MySQL) */
    char(codes: FnArg | FnArg[], options?: { using?: string }): FunctionBuilder<Buffer | null>;
    /** `CHAR_LENGTH()` (portable) */
    charLength(str: FnArg): FunctionBuilder<number | null>;
    /** `CHARACTER_LENGTH()` (portable) */
    characterLength(str: FnArg): FunctionBuilder<number | null>;
    /** `CONCAT_WS()` (portable) */
    concatWs(separator: FnArg, ...strs: FnArg[]): FunctionBuilder<string | null>;
    /** `ELT()` (MySQL) */
    elt(n: FnArg, ...strs: FnArg[]): FunctionBuilder<string | null>;
    /** `EXPORT_SET()` (MySQL) */
    exportSet(
      bits: FnArg,
      on: FnArg,
      off: FnArg,
      separator?: FnArg,
      numberOfBits?: FnArg,
    ): FunctionBuilder<string | null>;
    /** `FIELD()` (MySQL) */
    field(str: FnArg, ...strs: FnArg[]): FunctionBuilder<number | null>;
    /** `FIND_IN_SET()` (MySQL) */
    findInSet(str: FnArg, strList: FnArg): FunctionBuilder<number | null>;
    /** `FORMAT()` (MySQL) */
    format(x: FnArg, decimals: FnArg, locale?: FnArg): FunctionBuilder<string | null>;
    /** `FROM_BASE64()` (MySQL) */
    fromBase64(str: FnArg): FunctionBuilder<Buffer | null>;
    /** `HEX()` (MySQL) */
    hex(x: FnArg): FunctionBuilder<string | null>;
    /** `INSERT()` (MySQL) */
    insert(str: FnArg, pos: FnArg, len: FnArg, newStr: FnArg): FunctionBuilder<string | null>;
    /** `INSTR()` (MySQL) */
    instr(str: FnArg, substr: FnArg): FunctionBuilder<number | null>;
    /** `LCASE()` (MySQL) */
    lcase(str: FnArg): FunctionBuilder<string | null>;
    /** `LEFT()` (portable) */
    left(str: FnArg, len: FnArg): FunctionBuilder<string | null>;
    /** `LENGTH()` (portable) */
    length(str: FnArg): FunctionBuilder<number | null>;
    /** `LOCATE()` (MySQL) */
    locate(substr: FnArg, str: FnArg, pos?: FnArg): FunctionBuilder<number | null>;
    /** `LPAD()` (portable) */
    lpad(str: FnArg, len: FnArg, padStr: FnArg): FunctionBuilder<string | null>;
    /** `LTRIM()` (portable) */
    ltrim(str: FnArg): FunctionBuilder<string | null>;
    /** `MAKE_SET()` (MySQL) */
    makeSet(bits: FnArg, ...strs: FnArg[]): FunctionBuilder<string | null>;
    /** `MID()` (MySQL) */
    mid(str: FnArg, pos: FnArg, len?: FnArg): FunctionBuilder<string | null>;
    /** `OCT()` (MySQL) */
    oct(n: FnArg): FunctionBuilder<string | null>;
    /** `OCTET_LENGTH()` (portable) */
    octetLength(str: FnArg): FunctionBuilder<number | null>;
    /** `ORD()` (MySQL) */
    ord(str: FnArg): FunctionBuilder<number | null>;
    /** `POSITION()` (portable) */
    position(substr: FnArg, str: FnArg): FunctionBuilder<number | null>;
    /** `QUOTE()` (MySQL) */
    quote(str: FnArg): FunctionBuilder<string | null>;
    /** `REGEXP_INSTR()` (MySQL) */
    regexpInstr(
      expr: FnArg,
      pattern: FnArg,
      pos?: FnArg,
      occurrence?: FnArg,
      returnOption?: FnArg,
      matchType?: FnArg,
    ): FunctionBuilder<number | null>;
    /** `REGEXP_LIKE()` (MySQL) */
    regexpLike(expr: FnArg, pattern: FnArg, matchType?: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `REGEXP_REPLACE()` (MySQL) */
    regexpReplace(
      expr: FnArg,
      pattern: FnArg,
      replacement: FnArg,
      pos?: FnArg,
      occurrence?: FnArg,
      matchType?: FnArg,
    ): FunctionBuilder<string | null>;
    /** `REGEXP_SUBSTR()` (MySQL) */
    regexpSubstr(
      expr: FnArg,
      pattern: FnArg,
      pos?: FnArg,
      occurrence?: FnArg,
      matchType?: FnArg,
    ): FunctionBuilder<string | null>;
    /** `REPEAT()` (portable) */
    repeat(str: FnArg, count: FnArg): FunctionBuilder<string | null>;
    /** `REPLACE()` (portable) */
    replace(str: FnArg, from: FnArg, to: FnArg): FunctionBuilder<string | null>;
    /** `REVERSE()` (portable) */
    reverse(str: FnArg): FunctionBuilder<string | null>;
    /** `RIGHT()` (portable) */
    right(str: FnArg, len: FnArg): FunctionBuilder<string | null>;
    /** `RPAD()` (portable) */
    rpad(str: FnArg, len: FnArg, padStr: FnArg): FunctionBuilder<string | null>;
    /** `RTRIM()` (portable) */
    rtrim(str: FnArg): FunctionBuilder<string | null>;
    /** `SOUNDEX()` (MySQL) */
    soundex(str: FnArg): FunctionBuilder<string | null>;
    /** `SPACE()` (MySQL) */
    space(n: FnArg): FunctionBuilder<string | null>;
    /** `STRCMP()` (MySQL) */
    strcmp(a: FnArg, b: FnArg): FunctionBuilder<-1 | 0 | 1 | null>;
    /** `SUBSTR()` (portable) */
    substr(str: FnArg, pos: FnArg, len?: FnArg): FunctionBuilder<string | null>;
    /** `SUBSTRING()` (portable) */
    substring(str: FnArg, pos: FnArg, len?: FnArg): FunctionBuilder<string | null>;
    /** `SUBSTRING_INDEX()` (MySQL) */
    substringIndex(str: FnArg, delimiter: FnArg, count: FnArg): FunctionBuilder<string | null>;
    /** `TO_BASE64()` (MySQL) */
    toBase64(str: FnArg): FunctionBuilder<string | null>;
    /** `TRIM()` (portable) */
    trim(
      str: FnArg,
      options?: { side?: 'both' | 'leading' | 'trailing'; remove?: FnArg },
    ): FunctionBuilder<string | null>;
    /** `UCASE()` (MySQL) */
    ucase(str: FnArg): FunctionBuilder<string | null>;
    /** `UNHEX()` (MySQL) */
    unhex(str: FnArg): FunctionBuilder<Buffer | null>;
    /** `WEIGHT_STRING()` (MySQL) */
    weightString(str: FnArg): FunctionBuilder<Buffer | null>;
    /** `MATCH()` (MySQL) */
    match(
      columns: FnArg | FnArg[],
      search: FnArg,
      options?: {
        mode?: 'natural' | 'natural with query expansion' | 'boolean' | 'with query expansion';
      },
    ): FunctionBuilder<number | null>;
    /** `ABS()` (portable) */
    abs(x: FnArg): FunctionBuilder<FnNumeric | null>;
    /** `ACOS()` (portable) */
    acos(x: FnArg): FunctionBuilder<number | null>;
    /** `ASIN()` (portable) */
    asin(x: FnArg): FunctionBuilder<number | null>;
    /** `ATAN()` (MySQL) */
    atan(x: FnArg, y?: FnArg): FunctionBuilder<number | null>;
    /** `ATAN2()` (portable) */
    atan2(y: FnArg, x: FnArg): FunctionBuilder<number | null>;
    /** `CEIL()` (portable) */
    ceil(x: FnArg): FunctionBuilder<FnNumeric | null>;
    /** `CEILING()` (portable) */
    ceiling(x: FnArg): FunctionBuilder<FnNumeric | null>;
    /** `CONV()` (MySQL) */
    conv(n: FnArg, fromBase: FnArg, toBase: FnArg): FunctionBuilder<string | null>;
    /** `COS()` (portable) */
    cos(x: FnArg): FunctionBuilder<number | null>;
    /** `COT()` (portable) */
    cot(x: FnArg): FunctionBuilder<number | null>;
    /** `CRC32()` (MySQL) */
    crc32(x: FnArg): FunctionBuilder<number | null>;
    /** `DEGREES()` (portable) */
    degrees(x: FnArg): FunctionBuilder<number | null>;
    /** `EXP()` (portable) */
    exp(x: FnArg): FunctionBuilder<number | null>;
    /** `FLOOR()` (portable) */
    floor(x: FnArg): FunctionBuilder<FnNumeric | null>;
    /** `LN()` (portable) */
    ln(x: FnArg): FunctionBuilder<number | null>;
    /** `LOG()` (MySQL) */
    log(baseOrX: FnArg, x?: FnArg): FunctionBuilder<number | null>;
    /** `LOG10()` (MySQL) */
    log10(x: FnArg): FunctionBuilder<number | null>;
    /** `LOG2()` (MySQL) */
    log2(x: FnArg): FunctionBuilder<number | null>;
    /** `MOD()` (portable) */
    mod(n: FnArg, m: FnArg): FunctionBuilder<FnNumeric | null>;
    /** `PI()` (portable) */
    pi(): FunctionBuilder<number | null>;
    /** `POW()` (MySQL) */
    pow(x: FnArg, y: FnArg): FunctionBuilder<number | null>;
    /** `POWER()` (portable) */
    power(x: FnArg, y: FnArg): FunctionBuilder<number | null>;
    /** `RADIANS()` (portable) */
    radians(x: FnArg): FunctionBuilder<number | null>;
    /** `RAND()` (MySQL) */
    rand(seed?: FnArg): FunctionBuilder<number | null>;
    /** `ROUND()` (portable) */
    round(x: FnArg, decimals?: FnArg): FunctionBuilder<FnNumeric | null>;
    /** `SIGN()` (portable) */
    sign(x: FnArg): FunctionBuilder<number | null>;
    /** `SIN()` (portable) */
    sin(x: FnArg): FunctionBuilder<number | null>;
    /** `SQRT()` (portable) */
    sqrt(x: FnArg): FunctionBuilder<number | null>;
    /** `TAN()` (portable) */
    tan(x: FnArg): FunctionBuilder<number | null>;
    /** `TRUNCATE()` (MySQL) */
    truncate(x: FnArg, decimals: FnArg): FunctionBuilder<FnNumeric | null>;
    /** `ADDDATE()` (MySQL) */
    addDate(
      date: FnArg,
      amount: FnArg,
      unit?: FnIntervalUnit,
    ): FunctionBuilder<Date | string | null>;
    /** `ADDTIME()` (MySQL) */
    addTime(datetime: FnArg, time: FnArg): FunctionBuilder<Date | string | null>;
    /** `CONVERT_TZ()` (MySQL) */
    convertTz(datetime: FnArg, fromTz: FnArg, toTz: FnArg): FunctionBuilder<Date | string | null>;
    /** `CURDATE()` (MySQL) */
    curDate(): FunctionBuilder<Date | string | null>;
    /** `CURRENT_DATE()` (MySQL) */
    currentDate(): FunctionBuilder<Date | string | null>;
    /** `CURRENT_TIME()` (MySQL) */
    currentTime(fsp?: number): FunctionBuilder<string | null>;
    /** `CURRENT_TIMESTAMP()` (MySQL) */
    currentTimestamp(fsp?: number): FunctionBuilder<Date | string | null>;
    /** `CURTIME()` (MySQL) */
    curTime(fsp?: number): FunctionBuilder<string | null>;
    /** `DATE()` (MySQL) */
    date(x: FnArg): FunctionBuilder<Date | string | null>;
    /** `DATE_ADD()` (MySQL) */
    dateAdd(
      date: FnArg,
      amount: FnArg,
      unit: FnIntervalUnit,
    ): FunctionBuilder<Date | string | null>;
    /** `DATEDIFF()` (MySQL) */
    dateDiff(a: FnArg, b: FnArg): FunctionBuilder<number | null>;
    /** `DATE_FORMAT()` (MySQL) */
    dateFormat(date: FnArg, format: FnArg): FunctionBuilder<string | null>;
    /** `DATE_SUB()` (MySQL) */
    dateSub(
      date: FnArg,
      amount: FnArg,
      unit: FnIntervalUnit,
    ): FunctionBuilder<Date | string | null>;
    /** `DAY()` (MySQL) */
    day(date: FnArg): FunctionBuilder<number | null>;
    /** `DAYNAME()` (MySQL) */
    dayName(date: FnArg): FunctionBuilder<string | null>;
    /** `DAYOFMONTH()` (MySQL) */
    dayOfMonth(date: FnArg): FunctionBuilder<number | null>;
    /** `DAYOFWEEK()` (MySQL) */
    dayOfWeek(date: FnArg): FunctionBuilder<number | null>;
    /** `DAYOFYEAR()` (MySQL) */
    dayOfYear(date: FnArg): FunctionBuilder<number | null>;
    /** `EXTRACT()` (MySQL) */
    extract(unit: FnIntervalUnit, date: FnArg): FunctionBuilder<number | null>;
    /** `FROM_DAYS()` (MySQL) */
    fromDays(days: FnArg): FunctionBuilder<Date | string | null>;
    /** `FROM_UNIXTIME()` (MySQL) */
    fromUnixTime(timestamp: FnArg, format?: FnArg): FunctionBuilder<Date | string | null>;
    /** `GET_FORMAT()` (MySQL) */
    getFormat(
      type: 'DATE' | 'TIME' | 'DATETIME' | 'TIMESTAMP',
      locale: FnArg,
    ): FunctionBuilder<string | null>;
    /** `HOUR()` (MySQL) */
    hour(time: FnArg): FunctionBuilder<number | null>;
    /** `LAST_DAY()` (MySQL) */
    lastDay(date: FnArg): FunctionBuilder<Date | string | null>;
    /** `LOCALTIME()` (MySQL) */
    localTime(fsp?: number): FunctionBuilder<Date | string | null>;
    /** `LOCALTIMESTAMP()` (MySQL) */
    localTimestamp(fsp?: number): FunctionBuilder<Date | string | null>;
    /** `MAKEDATE()` (MySQL) */
    makeDate(year: FnArg, dayOfYear: FnArg): FunctionBuilder<Date | string | null>;
    /** `MAKETIME()` (MySQL) */
    makeTime(hour: FnArg, minute: FnArg, second: FnArg): FunctionBuilder<string | null>;
    /** `MICROSECOND()` (MySQL) */
    microsecond(time: FnArg): FunctionBuilder<number | null>;
    /** `MINUTE()` (MySQL) */
    minute(time: FnArg): FunctionBuilder<number | null>;
    /** `MONTH()` (MySQL) */
    month(date: FnArg): FunctionBuilder<number | null>;
    /** `MONTHNAME()` (MySQL) */
    monthName(date: FnArg): FunctionBuilder<string | null>;
    /** `PERIOD_ADD()` (MySQL) */
    periodAdd(period: FnArg, months: FnArg): FunctionBuilder<number | null>;
    /** `PERIOD_DIFF()` (MySQL) */
    periodDiff(a: FnArg, b: FnArg): FunctionBuilder<number | null>;
    /** `QUARTER()` (MySQL) */
    quarter(date: FnArg): FunctionBuilder<number | null>;
    /** `SECOND()` (MySQL) */
    second(time: FnArg): FunctionBuilder<number | null>;
    /** `SEC_TO_TIME()` (MySQL) */
    secToTime(seconds: FnArg): FunctionBuilder<string | null>;
    /** `STR_TO_DATE()` (MySQL) */
    strToDate(str: FnArg, format: FnArg): FunctionBuilder<Date | string | null>;
    /** `SUBDATE()` (MySQL) */
    subDate(
      date: FnArg,
      amount: FnArg,
      unit?: FnIntervalUnit,
    ): FunctionBuilder<Date | string | null>;
    /** `SUBTIME()` (MySQL) */
    subTime(datetime: FnArg, time: FnArg): FunctionBuilder<Date | string | null>;
    /** `SYSDATE()` (MySQL) */
    sysdate(fsp?: number): FunctionBuilder<Date | string | null>;
    /** `TIME()` (MySQL) */
    time(x: FnArg): FunctionBuilder<string | null>;
    /** `TIMEDIFF()` (MySQL) */
    timeDiff(a: FnArg, b: FnArg): FunctionBuilder<string | null>;
    /** `TIMESTAMP()` (MySQL) */
    timestamp(x: FnArg, time?: FnArg): FunctionBuilder<Date | string | null>;
    /** `TIMESTAMPADD()` (MySQL) */
    timestampAdd(
      unit: FnTimestampUnit,
      amount: FnArg,
      date: FnArg,
    ): FunctionBuilder<Date | string | null>;
    /** `TIMESTAMPDIFF()` (MySQL) */
    timestampDiff(unit: FnTimestampUnit, from: FnArg, to: FnArg): FunctionBuilder<number | null>;
    /** `TIME_FORMAT()` (MySQL) */
    timeFormat(time: FnArg, format: FnArg): FunctionBuilder<string | null>;
    /** `TIME_TO_SEC()` (MySQL) */
    timeToSec(time: FnArg): FunctionBuilder<number | null>;
    /** `TO_DAYS()` (MySQL) */
    toDays(date: FnArg): FunctionBuilder<number | null>;
    /** `TO_SECONDS()` (MySQL) */
    toSeconds(date: FnArg): FunctionBuilder<number | null>;
    /** `UNIX_TIMESTAMP()` (MySQL) */
    unixTimestamp(date?: FnArg): FunctionBuilder<FnNumeric | null>;
    /** `UTC_DATE()` (MySQL) */
    utcDate(): FunctionBuilder<Date | string | null>;
    /** `UTC_TIME()` (MySQL) */
    utcTime(fsp?: number): FunctionBuilder<string | null>;
    /** `UTC_TIMESTAMP()` (MySQL) */
    utcTimestamp(fsp?: number): FunctionBuilder<Date | string | null>;
    /** `WEEK()` (MySQL) */
    week(date: FnArg, mode?: FnArg): FunctionBuilder<number | null>;
    /** `WEEKDAY()` (MySQL) */
    weekday(date: FnArg): FunctionBuilder<number | null>;
    /** `WEEKOFYEAR()` (MySQL) */
    weekOfYear(date: FnArg): FunctionBuilder<number | null>;
    /** `YEAR()` (MySQL) */
    year(date: FnArg): FunctionBuilder<number | null>;
    /** `YEARWEEK()` (MySQL) */
    yearWeek(date: FnArg, mode?: FnArg): FunctionBuilder<number | null>;
    /** `BIT_AND()` (MySQL, aggregate) */
    bitAnd(x: FnArg): AggregateFunctionBuilder<FnNumeric | null>;
    /** `BIT_OR()` (MySQL, aggregate) */
    bitOr(x: FnArg): AggregateFunctionBuilder<FnNumeric | null>;
    /** `BIT_XOR()` (MySQL, aggregate) */
    bitXor(x: FnArg): AggregateFunctionBuilder<FnNumeric | null>;
    /** `COUNT()` (portable, aggregate) */
    countDistinct(...exprs: FnArg[]): AggregateFunctionBuilder<number>;
    /** `GROUP_CONCAT()` (MySQL, aggregate) */
    groupConcat(
      exprs: FnArg | FnArg[],
      options?: { distinct?: boolean; orderBy?: FnOrderBy | FnOrderBy[]; separator?: string },
    ): AggregateFunctionBuilder<string | null>;
    /** `JSON_ARRAYAGG()` (MySQL, aggregate) */
    jsonArrayAgg(x: FnArg): AggregateFunctionBuilder<unknown[] | null>;
    /** `JSON_OBJECTAGG()` (MySQL) */
    jsonObjectAgg(key: FnArg, value: FnArg): FunctionBuilder<Record<string, unknown> | null>;
    /** `STD()` (MySQL, aggregate) */
    std(x: FnArg): AggregateFunctionBuilder<number | null>;
    /** `STDDEV()` (portable, aggregate) */
    stddev(x: FnArg): AggregateFunctionBuilder<number | null>;
    /** `STDDEV_POP()` (portable, aggregate) */
    stddevPop(x: FnArg): AggregateFunctionBuilder<number | null>;
    /** `STDDEV_SAMP()` (portable, aggregate) */
    stddevSamp(x: FnArg): AggregateFunctionBuilder<number | null>;
    /** `VARIANCE()` (portable, aggregate) */
    variance(x: FnArg): AggregateFunctionBuilder<number | null>;
    /** `VAR_POP()` (portable, aggregate) */
    varPop(x: FnArg): AggregateFunctionBuilder<number | null>;
    /** `VAR_SAMP()` (portable, aggregate) */
    varSamp(x: FnArg): AggregateFunctionBuilder<number | null>;
    /** `ROW_NUMBER()` (portable, window function) */
    rowNumber(): WindowFunctionBuilder<number>;
    /** `RANK()` (portable, window function) */
    rank(): WindowFunctionBuilder<number>;
    /** `DENSE_RANK()` (portable, window function) */
    denseRank(): WindowFunctionBuilder<number>;
    /** `PERCENT_RANK()` (portable, window function) */
    percentRank(): WindowFunctionBuilder<number>;
    /** `CUME_DIST()` (portable, window function) */
    cumeDist(): WindowFunctionBuilder<number>;
    /** `NTILE()` (portable, window function) */
    ntile(buckets: number): WindowFunctionBuilder<number>;
    /** `LAG()` (portable, window function) */
    lag(x: FnArg, offset?: number, defaultValue?: FnArg): WindowFunctionBuilder<unknown>;
    /** `LEAD()` (portable, window function) */
    lead(x: FnArg, offset?: number, defaultValue?: FnArg): WindowFunctionBuilder<unknown>;
    /** `FIRST_VALUE()` (portable, window function) */
    firstValue(x: FnArg): WindowFunctionBuilder<unknown>;
    /** `LAST_VALUE()` (portable, window function) */
    lastValue(x: FnArg): WindowFunctionBuilder<unknown>;
    /** `NTH_VALUE()` (portable, window function) */
    nthValue(x: FnArg, n: number): WindowFunctionBuilder<unknown>;
    /** `GREATEST()` (portable) */
    greatest(...values: FnArg[]): FunctionBuilder<unknown>;
    /** `IF()` (MySQL) */
    if(condition: FnArg, then: FnArg, otherwise: FnArg): FunctionBuilder<unknown>;
    /** `IFNULL()` (MySQL) */
    ifNull(value: FnArg, otherwise: FnArg): FunctionBuilder<unknown>;
    /** `INTERVAL()` (MySQL) */
    interval(n: FnArg, ...ns: FnArg[]): FunctionBuilder<number | null>;
    /** `ISNULL()` (MySQL) */
    isNull(x: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `LEAST()` (portable) */
    least(...values: FnArg[]): FunctionBuilder<unknown>;
    /** `NULLIF()` (portable) */
    nullIf(a: FnArg, b: FnArg): FunctionBuilder<unknown>;
    /** `CAST()` (MySQL) */
    cast(x: FnArg, type: string): FunctionBuilder<unknown>;
    /** `CONVERT()` (MySQL) */
    convert(x: FnArg, type: string | { using: string }): FunctionBuilder<unknown>;
    /** `CHARSET()` (MySQL) */
    charset(str: FnArg): FunctionBuilder<string | null>;
    /** `COERCIBILITY()` (MySQL) */
    coercibility(str: FnArg): FunctionBuilder<number | null>;
    /** `COLLATION()` (MySQL) */
    collation(str: FnArg): FunctionBuilder<string | null>;
    /** `CONNECTION_ID()` (MySQL) */
    connectionId(): FunctionBuilder<number | null>;
    /** `CURRENT_ROLE()` (MySQL) */
    currentRole(): FunctionBuilder<string | null>;
    /** `CURRENT_USER()` (MySQL) */
    currentUser(): FunctionBuilder<string | null>;
    /** `DATABASE()` (MySQL) */
    database(): FunctionBuilder<string | null>;
    /** `ICU_VERSION()` (MySQL) */
    icuVersion(): FunctionBuilder<string | null>;
    /** `LAST_INSERT_ID()` (MySQL) */
    lastInsertId(x?: FnArg): FunctionBuilder<number | null>;
    /** `ROLES_GRAPHML()` (MySQL) */
    rolesGraphml(): FunctionBuilder<string | null>;
    /** `ROW_COUNT()` (MySQL) */
    rowCount(): FunctionBuilder<number | null>;
    /** `SCHEMA()` (MySQL) */
    schema(): FunctionBuilder<string | null>;
    /** `SESSION_USER()` (MySQL) */
    sessionUser(): FunctionBuilder<string | null>;
    /** `SYSTEM_USER()` (MySQL) */
    systemUser(): FunctionBuilder<string | null>;
    /** `USER()` (MySQL) */
    user(): FunctionBuilder<string | null>;
    /** `VERSION()` (MySQL) */
    version(): FunctionBuilder<string | null>;
    /** `AES_DECRYPT()` (MySQL) */
    aesDecrypt(crypt: FnArg, key: FnArg, ...options: FnArg[]): FunctionBuilder<Buffer | null>;
    /** `AES_ENCRYPT()` (MySQL) */
    aesEncrypt(str: FnArg, key: FnArg, ...options: FnArg[]): FunctionBuilder<Buffer | null>;
    /** `COMPRESS()` (MySQL) */
    compress(str: FnArg): FunctionBuilder<Buffer | null>;
    /** `MD5()` (portable) */
    md5(str: FnArg): FunctionBuilder<string | null>;
    /** `RANDOM_BYTES()` (MySQL) */
    randomBytes(length: FnArg): FunctionBuilder<Buffer | null>;
    /** `SHA1()` (MySQL) */
    sha1(str: FnArg): FunctionBuilder<string | null>;
    /** `SHA2()` (MySQL) */
    sha2(str: FnArg, hashLength: FnArg): FunctionBuilder<string | null>;
    /** `STATEMENT_DIGEST()` (MySQL) */
    statementDigest(statement: FnArg): FunctionBuilder<string | null>;
    /** `STATEMENT_DIGEST_TEXT()` (MySQL) */
    statementDigestText(statement: FnArg): FunctionBuilder<string | null>;
    /** `UNCOMPRESS()` (MySQL) */
    uncompress(str: FnArg): FunctionBuilder<Buffer | null>;
    /** `UNCOMPRESSED_LENGTH()` (MySQL) */
    uncompressedLength(str: FnArg): FunctionBuilder<number | null>;
    /** `GET_LOCK()` (MySQL) */
    getLock(name: FnArg, timeout: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `IS_FREE_LOCK()` (MySQL) */
    isFreeLock(name: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `IS_USED_LOCK()` (MySQL) */
    isUsedLock(name: FnArg): FunctionBuilder<number | null>;
    /** `RELEASE_ALL_LOCKS()` (MySQL) */
    releaseAllLocks(): FunctionBuilder<number | null>;
    /** `RELEASE_LOCK()` (MySQL) */
    releaseLock(name: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `ANY_VALUE()` (MySQL) */
    anyValue(x: FnArg): FunctionBuilder<unknown>;
    /** `BIN_TO_UUID()` (MySQL) */
    binToUuid(bin: FnArg, swap?: FnArg): FunctionBuilder<string | null>;
    /** `DEFAULT()` (MySQL) */
    default(column: FnArg): FunctionBuilder<unknown>;
    /** `GROUPING()` (MySQL) */
    grouping(...exprs: FnArg[]): FunctionBuilder<number | null>;
    /** `INET6_ATON()` (MySQL) */
    inet6Aton(address: FnArg): FunctionBuilder<Buffer | null>;
    /** `INET6_NTOA()` (MySQL) */
    inet6Ntoa(address: FnArg): FunctionBuilder<string | null>;
    /** `INET_ATON()` (MySQL) */
    inetAton(address: FnArg): FunctionBuilder<number | null>;
    /** `INET_NTOA()` (MySQL) */
    inetNtoa(address: FnArg): FunctionBuilder<string | null>;
    /** `IS_IPV4()` (MySQL) */
    isIpv4(address: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `IS_IPV4_COMPAT()` (MySQL) */
    isIpv4Compat(address: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `IS_IPV4_MAPPED()` (MySQL) */
    isIpv4Mapped(address: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `IS_IPV6()` (MySQL) */
    isIpv6(address: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `IS_UUID()` (MySQL) */
    isUuid(uuid: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `SLEEP()` (MySQL) */
    sleep(seconds: FnArg): FunctionBuilder<number | null>;
    /** `UUID()` (MySQL) */
    uuid(): FunctionBuilder<string>;
    /** `UUID_SHORT()` (MySQL) */
    uuidShort(): FunctionBuilder<FnNumeric>;
    /** `UUID_TO_BIN()` (MySQL) */
    uuidToBin(uuid: FnArg, swap?: FnArg): FunctionBuilder<Buffer | null>;
    /** `BIT_COUNT()` (MySQL) */
    bitCount(x: FnArg): FunctionBuilder<number | null>;
    /** `FORMAT_BYTES()` (MySQL) */
    formatBytes(bytes: FnArg): FunctionBuilder<string | null>;
    /** `FORMAT_PICO_TIME()` (MySQL) */
    formatPicoTime(time: FnArg): FunctionBuilder<string | null>;
    /** `PS_CURRENT_THREAD_ID()` (MySQL) */
    psCurrentThreadId(): FunctionBuilder<number | null>;
    /** `PS_THREAD_ID()` (MySQL) */
    psThreadId(connectionId: FnArg): FunctionBuilder<number | null>;
    /** `GTID_SUBSET()` (MySQL) */
    gtidSubset(set1: FnArg, set2: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `GTID_SUBTRACT()` (MySQL) */
    gtidSubtract(set1: FnArg, set2: FnArg): FunctionBuilder<string | null>;
    /** `SOURCE_POS_WAIT()` (MySQL) */
    sourcePosWait(
      logName: FnArg,
      logPos: FnArg,
      ...options: FnArg[]
    ): FunctionBuilder<number | null>;
    /** `WAIT_FOR_EXECUTED_GTID_SET()` (MySQL) */
    waitForExecutedGtidSet(gtidSet: FnArg, timeout?: FnArg): FunctionBuilder<number | null>;
    /** `EXTRACTVALUE()` (MySQL) */
    extractValue(xml: FnArg, xpath: FnArg): FunctionBuilder<string | null>;
    /** `UPDATEXML()` (MySQL) */
    updateXml(xml: FnArg, xpath: FnArg, newXml: FnArg): FunctionBuilder<string | null>;
    /** `JSON_ARRAY()` (MySQL) */
    jsonArray(...values: FnJsonArg[]): FunctionBuilder<unknown[]>;
    /** `JSON_ARRAY_APPEND()` (MySQL) */
    jsonArrayAppend(
      doc: FnJsonArg,
      path: FnArg,
      value: FnJsonArg,
      ...pathsAndValues: FnJsonArg[]
    ): FunctionBuilder<unknown>;
    /** `JSON_ARRAY_INSERT()` (MySQL) */
    jsonArrayInsert(
      doc: FnJsonArg,
      path: FnArg,
      value: FnJsonArg,
      ...pathsAndValues: FnJsonArg[]
    ): FunctionBuilder<unknown>;
    /** `JSON_CONTAINS()` (MySQL) */
    jsonContains(
      target: FnJsonArg,
      candidate: FnJsonArg,
      path?: FnArg,
    ): FunctionBuilder<0 | 1 | null>;
    /** `JSON_CONTAINS_PATH()` (MySQL) */
    jsonContainsPath(
      doc: FnJsonArg,
      oneOrAll: 'one' | 'all',
      ...paths: FnArg[]
    ): FunctionBuilder<0 | 1 | null>;
    /** `JSON_DEPTH()` (MySQL) */
    jsonDepth(doc: FnJsonArg): FunctionBuilder<number | null>;
    /** `JSON_EXTRACT()` (MySQL) */
    jsonExtract(doc: FnJsonArg, ...paths: FnArg[]): FunctionBuilder<unknown>;
    /** `JSON_INSERT()` (MySQL) */
    jsonInsert(
      doc: FnJsonArg,
      path: FnArg,
      value: FnJsonArg,
      ...pathsAndValues: FnJsonArg[]
    ): FunctionBuilder<unknown>;
    /** `JSON_KEYS()` (MySQL) */
    jsonKeys(doc: FnJsonArg, path?: FnArg): FunctionBuilder<string[] | null>;
    /** `JSON_LENGTH()` (MySQL) */
    jsonLength(doc: FnJsonArg, path?: FnArg): FunctionBuilder<number | null>;
    /** `JSON_MERGE_PATCH()` (MySQL) */
    jsonMergePatch(...docs: FnJsonArg[]): FunctionBuilder<unknown>;
    /** `JSON_MERGE_PRESERVE()` (MySQL) */
    jsonMergePreserve(...docs: FnJsonArg[]): FunctionBuilder<unknown>;
    /** `JSON_OBJECT()` (MySQL) */
    jsonObject(
      objectOrKeysAndValues?: { [key: string]: FnJsonArg } | FnJsonArg,
      ...keysAndValues: FnJsonArg[]
    ): FunctionBuilder<Record<string, unknown>>;
    /** `JSON_OVERLAPS()` (MySQL) */
    jsonOverlaps(a: FnJsonArg, b: FnJsonArg): FunctionBuilder<0 | 1 | null>;
    /** `JSON_PRETTY()` (MySQL) */
    jsonPretty(doc: FnJsonArg): FunctionBuilder<string | null>;
    /** `JSON_QUOTE()` (MySQL) */
    jsonQuote(str: FnArg): FunctionBuilder<string | null>;
    /** `JSON_REMOVE()` (MySQL) */
    jsonRemove(doc: FnJsonArg, ...paths: FnArg[]): FunctionBuilder<unknown>;
    /** `JSON_REPLACE()` (MySQL) */
    jsonReplace(
      doc: FnJsonArg,
      path: FnArg,
      value: FnJsonArg,
      ...pathsAndValues: FnJsonArg[]
    ): FunctionBuilder<unknown>;
    /** `JSON_SCHEMA_VALID()` (MySQL) */
    jsonSchemaValid(schema: FnJsonArg, doc: FnJsonArg): FunctionBuilder<0 | 1 | null>;
    /** `JSON_SCHEMA_VALIDATION_REPORT()` (MySQL) */
    jsonSchemaValidationReport(
      schema: FnJsonArg,
      doc: FnJsonArg,
    ): FunctionBuilder<Record<string, unknown> | null>;
    /** `JSON_SEARCH()` (MySQL) */
    jsonSearch(
      doc: FnJsonArg,
      oneOrAll: 'one' | 'all',
      search: FnArg,
      escape?: FnArg,
      ...paths: FnArg[]
    ): FunctionBuilder<string | string[] | null>;
    /** `JSON_SET()` (MySQL) */
    jsonSet(
      doc: FnJsonArg,
      path: FnArg,
      value: FnJsonArg,
      ...pathsAndValues: FnJsonArg[]
    ): FunctionBuilder<unknown>;
    /** `JSON_STORAGE_FREE()` (MySQL) */
    jsonStorageFree(doc: FnJsonArg): FunctionBuilder<number | null>;
    /** `JSON_STORAGE_SIZE()` (MySQL) */
    jsonStorageSize(doc: FnJsonArg): FunctionBuilder<number | null>;
    /** `JSON_TYPE()` (MySQL) */
    jsonType(value: FnJsonArg): FunctionBuilder<string | null>;
    /** `JSON_UNQUOTE()` (MySQL) */
    jsonUnquote(str: FnArg): FunctionBuilder<string | null>;
    /** `JSON_VALID()` (MySQL) */
    jsonValid(value: FnArg): FunctionBuilder<0 | 1 | null>;
    /** `JSON_VALUE()` (MySQL) */
    jsonValue(
      doc: FnJsonArg,
      path: FnArg,
      options?: { returning?: string },
    ): FunctionBuilder<unknown>;
    /** `MEMBER OF()` (MySQL) */
    memberOf(value: FnJsonArg, array: FnJsonArg): FunctionBuilder<0 | 1 | null>;
    // </generated:mysql-functions>
  }

  export interface ComposeFunction {
    (...plugins: Plugin[]): Plugin;
    (plugins: Plugin[]): Plugin;
  }

  export interface Plugin {
    <M extends typeof Model>(modelClass: M): M;
  }

  export interface MixinFunction {
    <MC extends AnyModelConstructor>(modelClass: MC, ...plugins: Plugin[]): MC;
    <MC extends AnyModelConstructor>(modelClass: MC, plugins: Plugin[]): MC;
  }

  interface Aliasable {
    as(alias: string): this;
  }

  interface Castable extends Aliasable {
    castText(): this;
    castInt(): this;
    castBigInt(): this;
    castFloat(): this;
    castDecimal(): this;
    castReal(): this;
    castBool(): this;
    castJson(): this;
    castArray(): this;
    asArray(): this;
    castType(sqlType: string): this;
    castTo(sqlType: string): this;
  }

  type Raw = RawBuilder | Knex.Raw;
  type Operator = string;
  type ColumnRef = string | Raw | ReferenceBuilder;
  /**
   * A table: a name, a model class, a subquery, or an object that maps aliases to
   * any of these (`{ p: Pet }`).
   */
  type TableRef<QB extends AnyQueryBuilder> =
    | ColumnRef
    | AnyQueryBuilder
    | CallbackVoid<QB>
    | AnyModelConstructor
    | { [alias: string]: string | AnyModelConstructor | AnyQueryBuilder | Raw };

  type PrimitiveValue =
    | string
    | number
    | boolean
    | Date
    | Buffer
    | string[]
    | number[]
    | boolean[]
    | Date[]
    | Buffer[]
    | null;

  type Expression<T> = T | Raw | ReferenceBuilder | ValueBuilder | AnyQueryBuilder;

  type Id = string | number | BigInt | Buffer;
  type CompositeId = Id[];
  type MaybeCompositeId = Id | CompositeId;

  interface ExpressionObject {
    [key: string]: Expression<PrimitiveValue>;
  }

  interface PrimitiveValueObject {
    [key: string]: PrimitiveValue;
  }

  interface CallbackVoid<T> {
    (this: T, arg: T): void;
  }

  type Identity<T> = (value: T) => T;
  /**
   * A query builder of any result kind for models of type `M`.
   *
   * Use this as the parameter type of modifiers and other functions that take
   * query builders so that they accept queries of every kind (`find`,
   * `first()`, `findById()`, `patch()`, ...).
   */
  type AnyQueryBuilder<M extends Model = any> = QueryBuilder<M, any, any>;
  type AnyModelConstructor = ModelConstructor<Model>;
  type ModifierFunction<QB extends AnyQueryBuilder> = (qb: QB, ...args: any[]) => void;
  type Modifier<QB extends AnyQueryBuilder = AnyQueryBuilder> =
    | ModifierFunction<QB>
    | string
    | string[]
    | Record<string, Expression<PrimitiveValue>>;
  type OrderByDirection = 'asc' | 'desc' | 'ASC' | 'DESC';
  type OrderByNulls = 'first' | 'last';

  interface Modifiers<QB extends AnyQueryBuilder = AnyQueryBuilder> {
    [key: string]: Modifier<QB>;
  }

  type RelationExpression<M extends Model> = string | object;

  /**
   * `E` if it's a valid relation expression for model `M`, otherwise a message
   * that says what's wrong with it. Expressions that aren't known at compile time
   * (like a `string`) aren't checked.
   */
  type CheckRelationExpression<M, E> =
    ParseRelationExpression<E> extends infer G
      ? G extends ParseError<infer Message>
        ? Message
        : G extends GraphNode
          ? GraphErrors<M, G['children'], ''> extends infer Errors
            ? [Errors] extends [never]
              ? E
              : Errors
            : never
          : E
      : never;

  // The errors of the nodes of a relation graph of model `M`. `Path` is the path
  // of the parent node followed by a dot, or an empty string at the root.
  type GraphErrors<M, Children, Path extends string> =
    IsUncheckedModel<M> extends true
      ? never
      : {
          [P in keyof Children & string]: Children[P] extends GraphNode
            ? NodeErrors<M, Children[P], P, Path>
            : never;
        }[keyof Children & string];

  type NodeErrors<M, N extends GraphNode, Prop extends string, Path extends string> =
    N['rel'] extends RelationNameKeys<M>
      ? GraphErrors<RelatedModel<M, N['rel']>, N['children'], `${Path}${Prop}.`>
      : Path extends `${infer Parent}.`
        ? `Unknown relation "${N['rel']}" at "${Parent}"`
        : `Unknown relation "${N['rel']}"`;

  // The names that are accepted as relations of `M`: its relation properties, and
  // the properties typed as objects, since relations are sometimes declared with
  // types that aren't models, like `programs?: Pick<Program, 'id' | 'name'>[]`.
  type RelationNameKeys<M> =
    | RelationKeys<M>
    | {
        [K in ModelDataKeys<M>]-?: K extends `$${string}`
          ? never
          : IsAnyType<M[K]> extends true
            ? never
            : NonNullable<M[K]> extends Function | Date
              ? never
              : NonNullable<M[K]> extends object
                ? K
                : never;
      }[ModelDataKeys<M>];

  // The related model of relation `K` of model `M`.
  type RelatedModel<M, K extends keyof M> = ElementOrSelf<NonNullable<M[K]>>;

  type ElementOrSelf<T> = T extends readonly (infer E)[] ? E : T;

  // Models whose relations can't be known, like the related model of a relation
  // whose `modelClass` is a module path.
  type IsUncheckedModel<M> =
    IsAnyType<M> extends true
      ? true
      : [Exclude<keyof M, keyof Model>] extends [never]
        ? true
        : false;

  /**
   * The type of model `M` with the relations of the relation expression `E`
   * loaded: `Loaded<Person, '[pets.toys, mom]'>`.
   */
  export type Loaded<M, E> = WithGraph<ModelRow<M>, M, E>;

  // Result item `I` of model `M` after loading the relations of expression `E`.
  type WithGraph<I, M, E> =
    IsAnyType<I> extends true
      ? any
      : ParseRelationExpression<E> extends infer G
        ? G extends GraphNode
          ? G['all'] extends true
            ? MakeOpaque<I, M>
            : WithChildren<I, M, G['children']>
          : MakeOpaque<I, M>
        : never;

  type WithChildren<I, M, Children> = [keyof Children] extends [never]
    ? I
    : [Extract<keyof Children, keyof I>] extends [never]
      ? I & LoadedRelations<I, M, Children>
      : Replace<I, M, Extract<keyof Children, keyof I>, LoadedRelations<I, M, Children>>;

  // `I` with the properties `K` replaced by `Props`. The rows of models that keep
  // their relations (see `ModelRow`) aren't copied, since the copy couldn't be
  // used where the model is expected. `Props` is intersected with them instead.
  type Replace<I, M, K, Props> = [Row<M>] extends [ModelRow<M>] ? Without<I, K> & Props : I & Props;

  // `I` without the properties `K`.
  type Without<I, K> = { [P in keyof I as P extends K ? never : P]: I[P] };

  type LoadedRelations<I, M, Children> = {
    -readonly [P in keyof Children as Children[P] extends { maybe: true }
      ? never
      : P]: LoadedRelation<I, M, P, Children[P]>;
  } & MaybeLoadedRelations<I, M, Children>;

  // Relations with a `boolean` in object notation, which may not be loaded.
  type MaybeLoadedRelations<I, M, Children> = [
    { [P in keyof Children]: Children[P] extends { maybe: true } ? P : never }[keyof Children],
  ] extends [never]
    ? unknown
    : {
        -readonly [P in keyof Children as Children[P] extends { maybe: true }
          ? P
          : never]?: LoadedRelation<I, M, P, Children[P]>;
      };

  // The type of the relation property `P` loaded by node `N`.
  type LoadedRelation<I, M, P, N> = N extends GraphNode
    ? N['rel'] extends keyof M
      ? RelationValue<M[N['rel']], LoadedNodeRow<PreviousRow<I, P>, RelatedModel<M, N['rel']>, N>>
      : unknown
    : unknown;

  // To-many relations are arrays. Objection sets to-one relations to `null` when
  // there's no related model, but rows must still be usable where the model is
  // expected, so the declared type decides: `Row | null` for relations declared
  // with `| null` (like the inferred ones), `Row | undefined` for optional ones.
  type RelationValue<Declared, Row> = [NonNullable<Declared>] extends [readonly any[]]
    ? Row[]
    : [Extract<NonNullable<Declared>, readonly any[]>] extends [never]
      ? null extends Declared
        ? Row | null
        : undefined extends Declared
          ? Row | undefined
          : Row
      : Row | Row[] | null;

  // The row of a relation that an earlier call already loaded, so that calls
  // add to each other like they do at runtime.
  type PreviousRow<I, P> = P extends keyof I
    ? {} extends Pick<I, P>
      ? never
      : ElementOrSelf<NonNullable<I[P]>>
    : never;

  // The row of the related model `RM` loaded by node `N`, starting from `Previous`.
  type LoadedNodeRow<Previous, RM, N extends GraphNode> = WithChildren<
    ApplyNodeModifiers<
      [Previous] extends [never] ? ModelRow<RM> : Previous,
      RM,
      N['recursive'] extends true ? ['~opaque'] : N['all'] extends true ? ['~opaque'] : N['mods']
    >,
    RM,
    N['children']
  >;

  type ApplyNodeModifiers<I, RM, Mods> = Mods extends readonly [infer First, ...infer Rest]
    ? ApplyNodeModifiers<ModifiedItem<I, RM, First>, RM, Rest>
    : I;

  // The item after a modifier. A modifier function that returns the query builder
  // adds what it loaded. Anything else may load relations the types can't see.
  type ModifiedItem<I, M, Modifier> = Modifier extends (...args: any[]) => infer Ret
    ? ReturnedItem<I, M, Ret>
    : MakeOpaque<I, M>;

  type ReturnedItem<I, M, Ret> = Ret extends { '~state': infer S extends QueryBuilderState }
    ? IsAnyType<S['item']> extends true
      ? MakeOpaque<I, M>
      : S extends { opaque: true }
        ? MakeOpaque<MergeLoaded<I, M, S['item']>, M>
        : MergeLoaded<I, M, S['item']>
    : MakeOpaque<I, M>;

  // Adds to `I` the relations `Other` has loaded: its required relation
  // properties and the properties that aren't properties of the model (aliases).
  type MergeLoaded<I, M, Other> = [LoadedKeys<M, Other>] extends [never]
    ? I
    : [Extract<LoadedKeys<M, Other>, keyof I>] extends [never]
      ? I & Only<Other, LoadedKeys<M, Other>>
      : Replace<I, M, LoadedKeys<M, Other>, Only<Other, LoadedKeys<M, Other>>>;

  // Like `Pick`, but shown as an object type in messages.
  type Only<T, K> = { [P in keyof T as P extends K ? P : never]: T[P] };

  type LoadedKeys<M, Other> =
    | {
        [K in keyof Other]-?: K extends RelationKeys<M>
          ? {} extends Pick<Other, K>
            ? never
            : K
          : never;
      }[keyof Other]
    | Exclude<keyof Other, keyof M>;

  // The query builder `QB` after loading the relations of expression `E`.
  type WithGraphQueryBuilder<QB extends AnyQueryBuilder, E> = QB['~state'] extends {
    cast: true;
  }
    ? OpaqueQueryBuilder<QB>
    : ParseRelationExpression<E> extends GraphNode
      ? ItemQueryBuilder<QB, WithGraph<QB['~state']['item'], GraphModel<QB>, E>>
      : OpaqueQueryBuilder<QB>;

  // An interface instead of a static method, so that it isn't compared every
  // time a model class is compared with another one.
  interface StaticFetchGraphMethod {
    <
      MC extends Constructor<Model>,
      T extends PartialModelObject<Extract<ModelInstance<MC>, Model>>,
      const E extends RelationExpression<Extract<ModelInstance<MC>, Model>>,
    >(
      this: MC,
      modelOrObject: T,
      expression: CheckRelationExpression<ModelInstance<MC>, E>,
      options?: FetchGraphOptions,
    ): StaticFetchGraphQueryBuilder<MC, T, E, 'one'>;
    <
      MC extends Constructor<Model>,
      T extends PartialModelObject<Extract<ModelInstance<MC>, Model>>,
      const E extends RelationExpression<Extract<ModelInstance<MC>, Model>>,
    >(
      this: MC,
      modelOrObject: T[],
      expression: CheckRelationExpression<ModelInstance<MC>, E>,
      options?: FetchGraphOptions,
    ): StaticFetchGraphQueryBuilder<MC, T, E, 'many'>;
  }

  type StaticFetchGraphQueryBuilder<MC, T, E, Kind extends 'one' | 'many'> =
    Extract<ModelInstance<MC>, Model> extends infer M extends Model
      ? [M] extends [never]
        ? any
        : FetchGraphQueryBuilder<QueryBuilderType<M>, M, T, E, Kind>
      : any;

  // The query builder of `fetchGraph()` for objects of type `T` of model `M`.
  // Plain objects are turned into models.
  type FetchGraphQueryBuilder<QB extends AnyQueryBuilder, M, T, E, Kind extends 'one' | 'many'> =
    WithGraph<T extends Model ? T : M, M, E> extends infer I
      ? RebindQueryBuilder<
          QB,
          ModelType<QB>,
          Kind extends 'one' ? I : I[],
          ParseRelationExpression<E> extends GraphNode
            ? QueryBuilderItemState<I>
            : OpaqueItemState<I>
        >
      : never;

  // The query builder `QB` with result items of type `I`.
  type ItemQueryBuilder<QB extends AnyQueryBuilder, I> = RebindQueryBuilder<
    QB,
    ModelType<QB>,
    ReplaceResultItem<ResultType<QB>, I>,
    QB['~state'] extends { opaque: true } ? OpaqueItemState<I> : QueryBuilderItemState<I>
  >;

  // The query builder `QB` after a modifier that returned `Ret`.
  type ModifiedQueryBuilder<QB extends AnyQueryBuilder, Ret> = Ret extends {
    '~state': infer S extends QueryBuilderState;
  }
    ? IsAnyType<S['item']> extends true
      ? OpaqueQueryBuilder<QB>
      : S extends { opaque: true }
        ? OpaqueQueryBuilder<
            ItemQueryBuilder<QB, MergeLoaded<QB['~state']['item'], GraphModel<QB>, S['item']>>
          >
        : ItemQueryBuilder<QB, MergeLoaded<QB['~state']['item'], GraphModel<QB>, S['item']>>
    : OpaqueQueryBuilder<QB>;

  /**
   * If T is an array, returns the item type, otherwise returns T.
   */
  type ItemType<T> = T extends Array<unknown> ? T[number] : T;

  /**
   * Type for keys of non-function properties of T.
   */
  type NonFunctionPropertyNames<T> = { [K in keyof T]: T[K] extends Function ? never : K }[keyof T];

  /**
   * Type that attempts to only select the user-defined model properties.
   */
  type DataPropertyNames<T> = Exclude<NonFunctionPropertyNames<T>, 'QueryBuilderType'>;

  /**
   * Removes `undefined` from a type.
   */
  type Defined<T> = Exclude<T, undefined>;

  /**
   * A Pojo version of model.
   */
  type ModelObject<T extends Model> = Pick<T, DataPropertyNames<T>>;

  /**
   * Any object that has some of the properties of model class T match this type.
   */
  type PartialModelObject<T extends Model> = {
    [K in DataPropertyNames<T>]?: Defined<T[K]> extends Model
      ? T[K]
      : Defined<T[K]> extends Array<infer I>
        ? I extends Model
          ? I[]
          : Expression<T[K]>
        : Expression<T[K]>;
  };

  type JsonFieldKey<T> = `${JsonColumnName<T>}:${string}`;

  /**
   * Checks an object for `patch()`, `update()` and `merge()` that sets fields of JSON
   * columns one at a time: `patch({ 'payload:courseName': 'Physics' })`. The other keys
   * must be properties of the model. Keys that aren't allowed get the type `never`.
   */
  type CheckModelUpdate<M extends Model, U> = [Extract<keyof U, `${string}:${string}`>] extends [
    never,
  ]
    ? // Objects without field keys are checked by the plain overload, which gives better
      // errors and is cheaper for values like subqueries.
      never
    : {
        [K in keyof U]: K extends `${string}:${string}`
          ? K extends JsonFieldKey<M>
            ? U[K]
            : never
          : K extends keyof PartialModelObject<M>
            ? PartialModelObject<M>[K]
            : never;
      };

  /**
   * Additional optional parameters that may be used in graphs.
   */
  type GraphParameters = {
    '#dbRef'?: MaybeCompositeId;
    '#ref'?: string;
    '#id'?: string;
  };

  /**
   * Just like PartialModelObject but this is applied recursively to relations.
   */
  type PartialModelGraph<M, T = M & GraphParameters> = T extends any
    ? {
        [K in DataPropertyNames<T>]?: null extends T[K]
          ? PartialModelGraphField<NonNullable<T[K]>> | null // handle nullable BelongsToOneRelations
          : PartialModelGraphField<T[K]>;
      }
    : never;

  type PartialModelGraphField<F> =
    Defined<F> extends Model
      ? PartialModelGraph<Defined<F>>
      : Defined<F> extends Array<infer I>
        ? I extends Model
          ? PartialModelGraph<I>[]
          : Expression<F>
        : Expression<F>;

  /**
   * Extracts the property names (excluding relations) of a model class.
   */
  type ModelProps<T extends Model> = Exclude<
    {
      [K in ModelDataKeys<T>]-?: NonNullable<T[K]> extends Model | readonly Model[]
        ? never
        : NonNullable<T[K]> extends Array<infer I>
          ? I extends Model
            ? never
            : K
          : T[K] extends Function
            ? never
            : K;
    }[ModelDataKeys<T>],
    undefined
  >;

  /**
   * The keys of a model, without the ones objection uses internally. They are left out
   * before looking at the property types, since `QueryBuilderType` refers back to the
   * model.
   */
  type ModelDataKeys<T> = Exclude<keyof T, 'QueryBuilderType' | `~${string}`>;

  /**
   * Extracts the relation names of the a model class.
   */
  type ModelRelations<T extends Model> = Defined<
    {
      [K in keyof T]?: NonNullable<T[K]> extends Model | readonly Model[]
        ? K
        : NonNullable<T[K]> extends Array<infer I>
          ? I extends Model
            ? K
            : never
          : never;
    }[keyof T]
  >;

  /**
   * Given a model property type, returns a query builer type of
   * correct kind if the property is a model or a model array.
   */
  type RelatedQueryBuilder<T> = T extends Model
    ? // A to-one relation query returns `undefined` if there is no related model.
      MaybeSingleQueryBuilder<RowQueryBuilder<QueryBuilderType<T>, T>>
    : T extends Array<infer I>
      ? I extends Model
        ? RowQueryBuilder<QueryBuilderType<I>, I>
        : never
      : never;

  /**
   * Just like RelatedQueryBuilder but always returns an array
   * query builder even if the property type is a model and not
   * an array of models.
   */
  type ArrayRelatedQueryBuilder<T> = T extends Model
    ? RowQueryBuilder<QueryBuilderType<T>, T>
    : T extends Array<infer I>
      ? I extends Model
        ? RowQueryBuilder<QueryBuilderType<I>, I>
        : never
      : never;

  /**
   * Gets the query builder type for a model type.
   */
  type QueryBuilderType<T extends { QueryBuilderType: any }> = T['QueryBuilderType'];

  /**
   * Gets the model type from a query builder type.
   */
  type ModelType<T extends { ModelType: any }> = T['ModelType'];

  /**
   * Gets the result type from a query builder type.
   */
  type ResultType<T extends { ResultType: any }> = T['ResultType'];

  type IsAnyType<T> = 0 extends 1 & T ? true : false;

  /**
   * The type of the items of a query result `R`. For example `Person` for
   * `Person[]`, `Person | undefined` and `Page<Person>`. For results without
   * items (`number`), returns `M`.
   */
  type ResultItemOf<R, M = unknown> =
    IsAnyType<R> extends true
      ? any
      : [R] extends [number]
        ? M
        : [R] extends [readonly (infer I)[]]
          ? I
          : [R] extends [Page<infer I>]
            ? I
            : Exclude<R, undefined>;

  type IsSingleResult<R> =
    IsAnyType<R> extends true
      ? false
      : [R] extends [number]
        ? false
        : [R] extends [readonly any[]]
          ? false
          : [R] extends [Page<any>]
            ? false
            : true;

  /**
   * The type-level state of a query builder. It's kept when the result kind
   * changes (for example when `first()` or `patch()` is called).
   */
  interface QueryBuilderState {
    // The type of the result items, for example `Person` when the result is
    // `Person[]`, `Person | undefined` or `Page<Person>`.
    item: unknown;
    // `true` when something ran that may have loaded relations the types can't
    // see, like a modifier that doesn't return the query builder. Only opaque
    // states have it, so that opaque query builders can be assigned to
    // variables of the others.
    opaque?: true;
    // `true` after `castTo(ModelClass)`.
    cast?: true;
  }

  type QueryBuilderItemState<T> = { item: T };

  type OpaqueItemState<T> = { item: T; opaque: true };

  // The state after `castTo(ModelClass)`.
  type CastItemState<T> = { item: T; opaque: true; cast: true };

  /**
   * A model as a query returns it: without the relations the query didn't load.
   * Loaded relations are added by `withGraphFetched()` and the other graph methods.
   *
   * Models whose rows couldn't be used where the model is expected keep their
   * relations: models that declare a relation as required (`pets!: Pet[]`
   * instead of `pets?: Pet[]`), and models with `private` or `protected` members.
   */
  export type ModelRow<M> = [RequiredRelationKeys<M>] extends [never]
    ? Row<M> extends M
      ? Row<M>
      : M
    : M;

  type RequiredRelationKeys<M> = {
    [K in RelationKeys<M>]: {} extends Pick<M, K> ? never : K;
  }[RelationKeys<M>];

  type Row<M> = { [K in keyof M as K extends RelationKeys<M> ? never : K]: M[K] };

  // The keys of the relation properties of `M`. Unlike `ModelRelations`, this
  // ignores properties typed as `any`.
  type RelationKeys<M> = {
    [K in keyof M]-?: IsAnyType<M[K]> extends true
      ? never
      : NonNullable<M[K]> extends ModelLike | readonly ModelLike[]
        ? K
        : never;
  }[keyof M];

  // Checking for a few members of `Model` is much cheaper than comparing with
  // `Model`, which compares the types of all its methods.
  type ModelLike = { $modelClass: unknown; $relatedQuery: unknown; $fetchGraph: unknown };

  // Adds back the relations of `M` that `I` doesn't have, as optional
  // properties, for results that may contain relations the types can't see.
  // A row without loaded relations becomes the model itself.
  type MakeOpaque<I, M> = [Exclude<RelationKeys<M>, keyof I>] extends [never]
    ? I
    : [Exclude<keyof I, keyof M> | Extract<keyof I, RelationKeys<M>>] extends [never]
      ? M
      : I & { [K in Exclude<RelationKeys<M>, keyof I>]?: M[K] };

  // The query builder `QB` after something ran that may have loaded relations
  // the types can't see.
  type OpaqueQueryBuilder<QB extends AnyQueryBuilder> = QB['~state'] extends { opaque: true }
    ? QB
    : RebindQueryBuilder<
        QB,
        ModelType<QB>,
        ReplaceResultItem<
          ResultType<QB>,
          MakeOpaque<QB['~state']['item'], RelationsModel<ModelType<QB>>>
        >,
        OpaqueItemState<MakeOpaque<QB['~state']['item'], RelationsModel<ModelType<QB>>>>
      >;

  // The query builder `QB` for model `M` with rows as the result items.
  type RowQueryBuilder<
    QB extends AnyQueryBuilder,
    M extends Model,
    I = ModelRow<M>,
  > = RebindQueryBuilder<QB, M, I[], QueryBuilderItemState<I>>;

  /**
   * The state of a query builder whose result type `R` was given explicitly,
   * as in `QueryBuilder<Person, Person | undefined>`.
   */
  // This is a conditional type so that it resolves to `QueryBuilderItemState`,
  // whose instances only differ by the item type. This makes for example
  // `DefaultQueryBuilderState<M, M[]>` and `DefaultQueryBuilderState<M, M | undefined>`
  // the same type.
  type DefaultQueryBuilderState<M, R> = [R] extends [never]
    ? QueryBuilderItemState<never>
    : QueryBuilderItemState<ResultItemOf<R, M>>;

  /**
   * Returns the query builder type `QB` (including custom query builder
   * subclasses) for model `M`, result `R` and state `S`.
   */
  type RebindQueryBuilder<
    QB extends AnyQueryBuilder,
    M extends Model,
    R,
    S extends QueryBuilderState = QB['~S'],
  > = (QB['~rebind'] & { '~args': [M, R, S] })['~rebind'];

  /**
   * Gets the single item query builder type for a query builder.
   */
  type SingleQueryBuilder<QB extends AnyQueryBuilder> = QB['~one'];

  /**
   * Gets the single or undefined item query builder type for a query builder.
   */
  type MaybeSingleQueryBuilder<QB extends AnyQueryBuilder> = QB['~maybe'];

  /**
   * Gets the multi-item query builder type for a query builder.
   */
  type ArrayQueryBuilder<QB extends AnyQueryBuilder> = QB['~many'];

  /**
   * Gets the number query builder type for a query builder.
   */
  type NumberQueryBuilder<QB extends AnyQueryBuilder> = QB['~count'];

  /**
   * Gets the page query builder type for a query builder.
   */
  type PageQueryBuilder<QB extends AnyQueryBuilder> = QB['~page'];

  // `runAfter` replaces the result with whatever the callback returns, also
  // when it returns nothing.
  type RunAfterResult<T> = [Awaited<T>] extends [void] ? undefined : Awaited<T>;

  // Replaces the item type of result `R` with `I`, keeping the result kind.
  type ReplaceResultItem<R, I> =
    IsAnyType<R> extends true ? any : [R] extends [never] ? never : ReplaceResultMember<R, I>;

  // Each member of a union like `Person[] | Person | number | undefined`.
  type ReplaceResultMember<R, I> = R extends number
    ? number
    : R extends readonly any[]
      ? I[]
      : R extends Page<any>
        ? Page<I>
        : R extends undefined | null
          ? R
          : I;

  /**
   * The query builder type of the static `query()` method of model class `MC`.
   * This is based on the static `QueryBuilder` property, which decides the
   * query builder class at runtime.
   */
  // `I` is the type of the rows.
  type ModelClassQueryBuilder<MC, M extends Model, I = ModelRow<M>> = MC extends {
    QueryBuilder: { prototype: infer QB };
  }
    ? keyof QueryBuilderType<M> extends keyof QB
      ? // The static `QueryBuilder` creates query builders of the declared
        // `QueryBuilderType` (only the keys are compared, which is much faster).
        RowQueryBuilder<QueryBuilderType<M>, M, I>
      : // `QueryBuilderType` was declared, but the static `QueryBuilder` creates
        // some other query builders. Trust the class that is used at runtime.
        InitialQueryBuilder<QB, M, I>
    : RowQueryBuilder<QueryBuilderType<M>, M, I>;

  type InitialQueryBuilder<QB, M extends Model, I> = QB extends { '~rebind': any }
    ? (QB['~rebind'] & { '~args': [M, I[], QueryBuilderItemState<I>] })['~rebind']
    : QB;

  interface ForClassMethod {
    <M extends Model>(modelClass: ModelConstructor<M>): RowQueryBuilder<QueryBuilderType<M>, M>;
  }

  /**
   * https://vincit.github.io/objection.js/api/types/#type-fieldexpression
   */
  type FieldExpression = string;

  type JsonObjectOrFieldExpression = object | object[] | FieldExpression;

  type Selection<QB extends AnyQueryBuilder> = ColumnRef | AnyQueryBuilder | CallbackVoid<QB>;

  interface SelectMethod<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(...columns: ModelProps<ModelType<QBP>>[]): QB;
    <QBP extends QB>(columns: ModelProps<ModelType<QBP>>[]): QB;

    <QBP extends QB>(...columns: Selection<QBP>[]): QB;
    <QBP extends QB>(columns: Selection<QBP>[]): QB;

    // Allows things like `select(1)`, not sure if we should be more specific here?
    <QBP extends QB>(...args: any[]): QB;
  }

  interface AsMethod<QB extends AnyQueryBuilder> {
    (alias: string): QB;
  }

  interface FromMethod<QB extends AnyQueryBuilder> {
    (table: TableRef<QB>): QB;
  }

  interface FromRawMethod<QB extends AnyQueryBuilder> extends RawInterface<QB> {}

  interface JsonExtraction {
    column: string | Raw | Knex.QueryBuilder;
    path: string;
    alias?: string;
    singleValue?: boolean;
  }

  interface JsonExtract<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      column: ModelProps<ModelType<QBP>>,
      path: string,
      alias?: string,
      singleValue?: boolean,
    ): QB;

    (column: ColumnRef, path: string, alias?: string, singleValue?: boolean): QB;
    (column: JsonExtraction[] | any[][], singleValue?: boolean): QB;
  }

  interface JsonSet<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      column: ModelProps<ModelType<QBP>>,
      path: string,
      value: any,
      alias?: string,
    ): QB;

    (column: ColumnRef, path: string, value: any, alias?: string): QB;
  }

  interface JsonInsert<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      column: ModelProps<ModelType<QBP>>,
      path: string,
      value: any,
      alias?: string,
    ): QB;

    (column: ColumnRef, path: string, value: any, alias?: string): QB;
  }

  interface JsonRemove<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(column: ModelProps<ModelType<QBP>>, path: string, alias?: string): QB;

    (column: ColumnRef, path: string, alias?: string): QB;
  }

  interface WhereMethod<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      col: ModelProps<ModelType<QBP>>,
      op: Operator,
      expr: Expression<PrimitiveValue>,
    ): QB;

    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, expr: Expression<PrimitiveValue>): QB;

    (col: ColumnRef, op: Operator, expr: Expression<PrimitiveValue>): QB;
    (col: ColumnRef, expr: Expression<PrimitiveValue>): QB;

    (condition: boolean): QB;
    (cb: CallbackVoid<QB>): QB;
    (raw: Raw): QB;
    <QBA extends AnyQueryBuilder>(qb: QBA): QB;

    (obj: PartialModelObject<ModelType<QB>>): QB;
    // We must allow any keys in the object. The previous type
    // is kind of useless, but maybe one day vscode and other
    // tools can autocomplete using it.
    (obj: object): QB;
  }

  interface WhereRawMethod<QB extends AnyQueryBuilder> extends RawInterface<QB> {}

  interface WhereWrappedMethod<QB extends AnyQueryBuilder> {
    (cb: CallbackVoid<QB>): QB;
  }

  interface WhereExistsMethod<QB extends AnyQueryBuilder> {
    (cb: CallbackVoid<QB>): QB;
    (raw: Raw): QB;
    <QBA extends AnyQueryBuilder>(qb: QBA): QB;
  }

  interface WhereInMethod<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, expr: Expression<PrimitiveValue>): QB;
    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, cb: CallbackVoid<QB>): QB;
    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, qb: AnyQueryBuilder): QB;

    (col: ColumnRef | ColumnRef[], expr: readonly Expression<PrimitiveValue>[]): QB;
    (col: ColumnRef | ColumnRef[], cb: CallbackVoid<QB>): QB;
    (col: ColumnRef | ColumnRef[], qb: AnyQueryBuilder): QB;
  }

  interface WhereBetweenMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef, range: [Expression<PrimitiveValue>, Expression<PrimitiveValue>]): QB;
  }

  interface WhereNullMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef): QB;
  }

  interface WhereColumnMethod<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(col1: ModelProps<ModelType<QBP>>, op: Operator, col2: ColumnRef): QB;
    <QBP extends QB>(col1: ModelProps<ModelType<QBP>>, col2: ColumnRef): QB;

    (col1: ColumnRef, op: Operator, col2: ColumnRef): QB;
    (col1: ColumnRef, col2: ColumnRef): QB;
  }

  interface WhereJsonObject<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(col: ModelProps<ModelType<QBP>>, value: any): QB;

    (col: ColumnRef, value: any): QB;
  }

  interface WhereJsonPath<QB extends AnyQueryBuilder> {
    // These must come first so that we get autocomplete.
    <QBP extends QB>(
      col: ModelProps<ModelType<QBP>>,
      jsonPath: string,
      operator: string,
      value: any,
    ): QB;

    (col: ColumnRef, jsonPath: string, operator: string, value: any): QB;
  }

  interface WhereJsonMethod<QB extends AnyQueryBuilder> {
    (
      fieldExpression: FieldExpression,
      jsonObjectOrFieldExpression: JsonObjectOrFieldExpression,
    ): QB;
  }

  interface WhereFieldExpressionMethod<QB extends AnyQueryBuilder> {
    (fieldExpression: FieldExpression): QB;
  }

  interface WhereJsonExpressionMethod<QB extends AnyQueryBuilder> {
    (fieldExpression: FieldExpression, keys: string | string[]): QB;
  }

  interface WhereJsonField<QB extends AnyQueryBuilder> {
    (
      fieldExpression: FieldExpression,
      operator: string,
      value: boolean | number | string | null,
    ): QB;
  }

  interface WhereCompositeMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef[], op: Operator, expr: readonly Expression<PrimitiveValue>[]): QB;
    (column: ColumnRef, expr: Expression<PrimitiveValue>): QB;
    (column: ColumnRef, op: Operator, expr: Expression<PrimitiveValue>): QB;
    (column: ColumnRef[], expr: readonly Expression<PrimitiveValue>[]): QB;
    (column: ColumnRef[], qb: AnyQueryBuilder): QB;
  }

  interface WhereInCompositeMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef, expr: readonly Expression<PrimitiveValue>[]): QB;
    (column: ColumnRef, qb: AnyQueryBuilder): QB;
    (column: ColumnRef[], expr: readonly Expression<PrimitiveValue>[][]): QB;
    (column: ColumnRef[], qb: AnyQueryBuilder): QB;
  }

  type QBOrCallback<QB extends AnyQueryBuilder> = AnyQueryBuilder | CallbackVoid<QB>;

  interface BaseSetOperations<QB extends AnyQueryBuilder> {
    (callbackOrBuilder: QBOrCallback<QB>, wrap?: boolean): QB;
    (callbacksOrBuilders: QBOrCallback<QB>[], wrap?: boolean): QB;
  }

  interface SetOperationsMethod<QB extends AnyQueryBuilder> extends BaseSetOperations<QB> {
    (...callbacksOrBuilders: QBOrCallback<QB>[]): QB;
  }

  interface UnionMethod<QB extends AnyQueryBuilder> extends BaseSetOperations<QB> {
    (arg1: QBOrCallback<QB>, wrap?: boolean): QB;
    (arg1: QBOrCallback<QB>, arg2: QBOrCallback<QB>, wrap?: boolean): QB;
    (arg1: QBOrCallback<QB>, arg2: QBOrCallback<QB>, arg3: QBOrCallback<QB>, wrap?: boolean): QB;
    (
      arg1: QBOrCallback<QB>,
      arg2: QBOrCallback<QB>,
      arg3: QBOrCallback<QB>,
      arg4: QBOrCallback<QB>,
      wrap?: boolean,
    ): QB;
    (
      arg1: QBOrCallback<QB>,
      arg2: QBOrCallback<QB>,
      arg3: QBOrCallback<QB>,
      arg4: QBOrCallback<QB>,
      arg5: QBOrCallback<QB>,
      wrap?: boolean,
    ): QB;
    (
      arg1: QBOrCallback<QB>,
      arg2: QBOrCallback<QB>,
      arg3: QBOrCallback<QB>,
      arg4: QBOrCallback<QB>,
      arg5: QBOrCallback<QB>,
      arg6: QBOrCallback<QB>,
      wrap?: boolean,
    ): QB;
    (
      arg1: QBOrCallback<QB>,
      arg2: QBOrCallback<QB>,
      arg3: QBOrCallback<QB>,
      arg4: QBOrCallback<QB>,
      arg5: QBOrCallback<QB>,
      arg6: QBOrCallback<QB>,
      arg7: QBOrCallback<QB>,
      wrap?: boolean,
    ): QB;
  }

  interface WithMethod<QB extends AnyQueryBuilder> {
    (alias: string, expr: CallbackVoid<QB> | AnyQueryBuilder | Raw): QB;
  }

  interface JoinRelatedOptions {
    alias?: string | boolean;
    aliases?: Record<string, string>;
  }

  interface JoinRelatedMethod<QB extends AnyQueryBuilder> {
    <const E extends RelationExpression<ModelType<QB>>>(
      expr: CheckRelationExpression<GraphModel<QB>, E>,
      opt?: JoinRelatedOptions,
    ): QB;
  }

  interface JoinMethod<QB extends AnyQueryBuilder> {
    (table: TableRef<QB>, leftCol: ColumnRef, op: Operator, rightCol: ColumnRef): QB;
    (table: TableRef<QB>, leftCol: ColumnRef, rightCol: ColumnRef): QB;
    (table: TableRef<QB>, cb: CallbackVoid<JoinBuilder>): QB;
    (table: TableRef<QB>, raw: Raw): QB;
    (raw: Raw): QB;
  }

  interface CrossJoinMethod<QB extends AnyQueryBuilder> extends JoinMethod<QB> {
    (table: TableRef<QB>): QB;
  }

  type JoinValue = PrimitiveValue | Raw | ReferenceBuilder | ValueBuilder | AnyQueryBuilder;

  interface JoinOnMethod {
    (column1: ColumnRef, column2: ColumnRef): JoinBuilder;
    (column1: ColumnRef, operator: Operator, column2: ColumnRef): JoinBuilder;
    (columns: { [column: string]: ColumnRef }): JoinBuilder;
    (callback: CallbackVoid<JoinBuilder>): JoinBuilder;
    (raw: Raw): JoinBuilder;
  }

  interface JoinOnValMethod {
    (column: ColumnRef, value: JoinValue): JoinBuilder;
    (column: ColumnRef, operator: Operator, value: JoinValue): JoinBuilder;
  }

  interface JoinOnInMethod {
    (column: ColumnRef, values: readonly JoinValue[] | Raw | AnyQueryBuilder): JoinBuilder;
  }

  interface JoinOnNullMethod {
    (column: ColumnRef): JoinBuilder;
  }

  interface JoinOnExistsMethod {
    (query: CallbackVoid<AnyQueryBuilder> | AnyQueryBuilder): JoinBuilder;
  }

  interface JoinOnBetweenMethod {
    (column: ColumnRef, range: readonly [JoinValue, JoinValue]): JoinBuilder;
  }

  interface JoinOnJsonPathEqualsMethod {
    (
      columnFirst: ColumnRef,
      jsonPathFirst: string,
      columnSecond: ColumnRef,
      jsonPathSecond: string,
    ): JoinBuilder;
  }

  /**
   * The builder passed to join callbacks. Unlike knex's `JoinClause`, every column can
   * be a `ref()` or `Model.ref()`.
   */
  export interface JoinBuilder {
    on: JoinOnMethod;
    andOn: JoinOnMethod;
    orOn: JoinOnMethod;

    onVal: JoinOnValMethod;
    andOnVal: JoinOnValMethod;
    orOnVal: JoinOnValMethod;

    onIn: JoinOnInMethod;
    andOnIn: JoinOnInMethod;
    orOnIn: JoinOnInMethod;
    onNotIn: JoinOnInMethod;
    andOnNotIn: JoinOnInMethod;
    orOnNotIn: JoinOnInMethod;

    onNull: JoinOnNullMethod;
    andOnNull: JoinOnNullMethod;
    orOnNull: JoinOnNullMethod;
    onNotNull: JoinOnNullMethod;
    andOnNotNull: JoinOnNullMethod;
    orOnNotNull: JoinOnNullMethod;

    onExists: JoinOnExistsMethod;
    andOnExists: JoinOnExistsMethod;
    orOnExists: JoinOnExistsMethod;
    onNotExists: JoinOnExistsMethod;
    andOnNotExists: JoinOnExistsMethod;
    orOnNotExists: JoinOnExistsMethod;

    onBetween: JoinOnBetweenMethod;
    andOnBetween: JoinOnBetweenMethod;
    orOnBetween: JoinOnBetweenMethod;
    onNotBetween: JoinOnBetweenMethod;
    andOnNotBetween: JoinOnBetweenMethod;
    orOnNotBetween: JoinOnBetweenMethod;

    onJsonPathEquals: JoinOnJsonPathEqualsMethod;
    andOnJsonPathEquals: JoinOnJsonPathEqualsMethod;
    orOnJsonPathEquals: JoinOnJsonPathEqualsMethod;

    using(columns: string | readonly string[] | Raw | { [key: string]: string | Raw }): JoinBuilder;
    type(type: string): JoinBuilder;
  }

  interface JoinRawMethod<QB extends AnyQueryBuilder> extends RawInterface<QB> {}

  interface IncrementDecrementMethod<QB extends AnyQueryBuilder> {
    (column: string, amount?: number): QB;
  }

  interface AggregateMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef): QB;
  }

  interface CountMethod<QB extends AnyQueryBuilder> {
    (column?: ColumnRef, options?: { as: string }): QB;
    (aliasToColumnDict: { [alias: string]: string | string[] }): QB;
    (...columns: ColumnRef[]): QB;
  }

  interface GroupByMethod<QB extends AnyQueryBuilder> {
    (...columns: ColumnRef[]): QB;
    (columns: ColumnRef[]): QB;
  }

  interface OrderByDescriptor {
    column: ColumnRef;
    order?: OrderByDirection;
    nulls?: OrderByNulls;
  }

  type ColumnRefOrOrderByDescriptor = ColumnRef | OrderByDescriptor;

  interface OrderByMethod<QB extends AnyQueryBuilder> {
    (column: ColumnRef, order?: OrderByDirection, nulls?: OrderByNulls): QB;
    (columns: ColumnRefOrOrderByDescriptor[]): QB;
  }

  interface OrderByRawMethod<QB extends AnyQueryBuilder> extends RawInterface<QB> {}

  interface FirstMethod {
    <QB extends AnyQueryBuilder>(
      this: QB,
    ): [ResultType<QB>] extends [readonly any[]] ? MaybeSingleQueryBuilder<QB> : QB;
  }

  type ForIdValue = MaybeCompositeId | AnyQueryBuilder;

  interface WithGraphMethod<QB extends AnyQueryBuilder> {
    <const E extends RelationExpression<ModelType<QB>>>(
      expr: CheckRelationExpression<GraphModel<QB>, E>,
      options?: GraphOptions,
    ): WithGraphQueryBuilder<QB, E>;
  }

  // The model whose relations the graph methods of `QB` use, or `any` if they're
  // not known.
  type GraphModel<QB extends AnyQueryBuilder> = QB['~state'] extends { cast: true }
    ? any
    : RelationsModel<ModelType<QB>>;

  // The model with the relations of `M`. Generic code like
  // `<M extends Model>(query: QueryBuilder<M, M[]>)` can infer a row type as the
  // model type, but rows still have the `QueryBuilderType` of their model.
  type RelationsModel<M> =
    IsAnyType<M> extends true
      ? any
      : M extends { QueryBuilderType: { ModelType: infer RM } }
        ? IsAnyType<RM> extends true
          ? M
          : RM
        : M;

  interface AllowGraphMethod<QB extends AnyQueryBuilder> {
    <const E extends RelationExpression<ModelType<QB>>>(
      expr: CheckRelationExpression<GraphModel<QB>, E>,
    ): QB;
  }

  interface IdentityMethod<QB extends AnyQueryBuilder> {
    (): QB;
  }

  interface OneArgMethod<T, QB extends AnyQueryBuilder> {
    (arg: T): QB;
  }

  interface StringReturningMethod {
    (): string;
  }

  interface BooleanReturningMethod {
    (): boolean;
  }

  interface HasMethod {
    (selector: string | RegExp): boolean;
  }

  interface ClearMethod<QB extends AnyQueryBuilder> {
    (selector: string | RegExp): QB;
  }

  interface ColumnInfoMethod<QB extends AnyQueryBuilder> {
    (): Promise<Knex.ColumnInfo>;
  }

  interface TableRefForMethod {
    (modelClass: ModelClass<Model> | typeof Model): string;
  }

  interface AliasForMethod<QB extends AnyQueryBuilder> {
    (modelClassOrTableName: string | AnyModelConstructor, alias: string): QB;
  }

  interface ModelClassMethod<M extends Model> {
    (): ModelClass<M>;
  }

  interface ReturningMethod {
    <QB extends AnyQueryBuilder>(
      this: QB,
      column: string | Raw | (string | Raw)[],
    ): [ResultType<QB>] extends [number] ? ArrayQueryBuilder<QB> : QB;
  }

  interface TimeoutOptions {
    cancel: boolean;
  }

  interface TimeoutMethod<QB extends AnyQueryBuilder> {
    (ms: number, options?: TimeoutOptions): QB;
  }

  export interface Page<T> {
    total: number;
    results: T[];
  }

  interface RunBeforeCallback<QB extends AnyQueryBuilder> {
    (this: QB, result: any, query: QB): any;
  }

  interface RunBeforeMethod<QB extends AnyQueryBuilder> {
    (cb: RunBeforeCallback<QB>): QB;
  }

  interface RunAfterCallback<QB extends AnyQueryBuilder, T = unknown> {
    (this: QB, result: ResultType<QB>, query: QB): T;
  }

  interface RunAfterMethod<QB extends AnyQueryBuilder> {
    // The callback's return value replaces the result of the query.
    <T>(
      cb: RunAfterCallback<QB, T>,
    ): RebindQueryBuilder<
      QB,
      ModelType<QB>,
      RunAfterResult<T>,
      QueryBuilderItemState<ResultItemOf<RunAfterResult<T>, ModelType<QB>>>
    >;
  }

  interface OnBuildMethod<QB extends AnyQueryBuilder> {
    (cb: CallbackVoid<QB>): QB;
  }

  interface OnBuildKnexCallback<QB extends AnyQueryBuilder> {
    (this: QB, knexQuery: Knex.QueryBuilder, query: QB): void;
  }

  interface OnBuildKnexMethod<QB extends AnyQueryBuilder> {
    (cb: OnBuildKnexCallback<QB>): QB;
  }

  interface OnErrorCallback<QB extends AnyQueryBuilder> {
    (this: QB, error: Error, query: QB): any;
  }

  interface OnErrorMethod<QB extends AnyQueryBuilder> {
    (cb: OnErrorCallback<QB>): QB;
  }

  export interface InsertGraphOptions {
    relate?: boolean | string[];
    allowRefs?: boolean;
  }

  // The result of a graph insert or upsert has the relations of the input graph.
  interface InsertGraphMethod<M extends Model> {
    <QB extends AnyQueryBuilder>(
      this: QB,
      graph: PartialModelGraph<M>,
      options?: InsertGraphOptions,
    ): SingleQueryBuilder<OpaqueQueryBuilder<QB>>;

    <QB extends AnyQueryBuilder>(
      this: QB,
      graph: PartialModelGraph<M>[],
      options?: InsertGraphOptions,
    ): ArrayQueryBuilder<OpaqueQueryBuilder<QB>>;
  }

  export interface UpsertGraphOptions {
    relate?: boolean | string[];
    unrelate?: boolean | string[];
    insertMissing?: boolean | string[];
    update?: boolean | string[];
    noInsert?: boolean | string[];
    noUpdate?: boolean | string[];
    noDelete?: boolean | string[];
    noRelate?: boolean | string[];
    noUnrelate?: boolean | string[];
    allowRefs?: boolean;
  }

  interface UpsertGraphMethod<M extends Model> {
    <QB extends AnyQueryBuilder>(
      this: QB,
      graph: PartialModelGraph<M>[],
      options?: UpsertGraphOptions,
    ): ArrayQueryBuilder<OpaqueQueryBuilder<QB>>;

    <QB extends AnyQueryBuilder>(
      this: QB,
      graph: PartialModelGraph<M>,
      options?: UpsertGraphOptions,
    ): SingleQueryBuilder<OpaqueQueryBuilder<QB>>;
  }

  interface GraphExpressionObjectMethod<QB extends AnyQueryBuilder> {
    (): any;
  }

  export interface GraphOptions {
    minimize?: boolean;
    separator?: string;
    aliases?: { [key: string]: string };
    joinOperation?: string;
    maxBatchSize?: number;
  }

  // The expression refers to the relations of the graph by their names, which can
  // be aliases. The modifier gets the query builder of the related model when the
  // expression is a single relation path like `'pets.toys'`.
  interface ModifyGraphMethod<QB extends AnyQueryBuilder> {
    // With the related model type given explicitly: `modifyGraph<Pet>(expr, modifier)`.
    <RM extends Model = never>(
      expr: [RM] extends [never] ? never : RelationExpression<ModelType<QB>>,
      modifier: Modifier<QueryBuilderType<RM>>,
    ): QB;
    <const E extends RelationExpression<ModelType<QB>>>(
      expr: CheckGraphPath<QB['~state']['item'], GraphModel<QB>, E>,
      modifier: Modifier<GraphPathQueryBuilder<QB['~state']['item'], GraphModel<QB>, E>>,
    ): QB;
  }

  type CheckGraphPath<I, M, E> =
    ParseRelationExpression<E> extends infer G
      ? G extends ParseError<infer Message>
        ? Message
        : G extends GraphNode
          ? GraphPathErrors<I, M, G['children'], ''> extends infer Errors
            ? [Errors] extends [never]
              ? E
              : Errors
            : never
          : E
      : never;

  type GraphPathErrors<I, M, Children, Path extends string> =
    IsUncheckedModel<M> extends true
      ? never
      : {
          [P in keyof Children & string]: Children[P] extends GraphNode
            ? GraphPathStep<I, M, P, Children[P]> extends infer Step
              ? [Step] extends [never]
                ? Path extends `${infer Parent}.`
                  ? `Unknown relation "${P}" at "${Parent}"`
                  : `Unknown relation "${P}"`
                : Step extends [infer NextI, infer RM]
                  ? GraphPathErrors<NextI, RM, Children[P]['children'], `${Path}${P}.`>
                  : never
              : never
            : never;
        }[keyof Children & string];

  // The item and the model of the relation called `P` in the graph of item `I`:
  // a relation of `M`, or an alias that was loaded.
  type GraphPathStep<I, M, P, N extends GraphNode> =
    N['rel'] extends RelationNameKeys<M>
      ? [
          [PreviousRow<I, P>] extends [never]
            ? ModelRow<RelatedModel<M, N['rel']>>
            : PreviousRow<I, P>,
          RelatedModel<M, N['rel']>,
        ]
      : P extends keyof I
        ? ElementOrSelf<NonNullable<I[P]>> extends infer Row
          ? [Row, ModelOfRow<Row>]
          : never
        : never;

  type ModelOfRow<Row> = Row extends { QueryBuilderType: { ModelType: infer RM } } ? RM : Model;

  type GraphPathQueryBuilder<I, M, E> =
    ParseRelationExpression<E> extends infer G extends GraphNode
      ? GraphPathTarget<I, M, G['children']> extends infer Target
        ? [Target] extends [never]
          ? AnyQueryBuilder
          : Target extends [any, infer RM extends Model]
            ? RowQueryBuilder<QueryBuilderType<RM>, RM>
            : AnyQueryBuilder
        : AnyQueryBuilder
      : AnyQueryBuilder;

  // The item and the model at the end of a single relation path.
  type GraphPathTarget<I, M, Children> = [keyof Children] extends [never]
    ? never
    : IsUnion<keyof Children> extends true
      ? never
      : {
          [P in keyof Children]: Children[P] extends GraphNode
            ? GraphPathStep<I, M, P, Children[P]> extends [infer NextI, infer RM]
              ? [keyof Children[P]['children']] extends [never]
                ? [NextI, RM]
                : GraphPathTarget<NextI, RM, Children[P]['children']>
              : never
            : never;
        }[keyof Children];

  type IsUnion<T, U = T> = T extends any ? ([U] extends [T] ? false : true) : never;

  interface ContextMethod<QB extends AnyQueryBuilder> {
    (context: object): QB;
    (): QueryContext;
  }

  interface ClearContextMethod<QB extends AnyQueryBuilder> {
    (): QB;
  }

  type ModifierArgs<F> = F extends (qb: any, ...args: infer A) => any ? A : unknown[];

  // A modifier function written for models of type `PM` can be used with any
  // query builder for models of type `PM` regardless of the result kind. Only
  // the model type of the query builder parameter is checked.
  type CheckModifierModel<QB extends AnyQueryBuilder, F> = F extends (
    qb: infer P,
    ...args: any[]
  ) => any
    ? P extends { ModelType: infer PM }
      ? IsAnyType<P> extends true
        ? unknown
        : QB['ModelType'] extends PM
          ? unknown
          : // Modifiers for a subtype of the model, like a row type with
            // computed columns, are allowed too.
            PM extends QB['ModelType']
            ? unknown
            : { '~error': 'The modifier is for a different model than the query' }
      : unknown
    : unknown;

  // Modifiers may load relations the types can't see, so the result may contain
  // any relation of the model.
  interface ModifyMethod<QB extends AnyQueryBuilder> {
    <Ret>(modifier: (qb: QB) => Ret): ModifiedQueryBuilder<QB, Ret>;
    <F extends (qb: any, ...args: any[]) => unknown>(
      modifier: F & CheckModifierModel<QB, F>,
      ...args: ModifierArgs<F>
    ): ModifiedQueryBuilder<QB, ReturnType<F>>;
    (
      modifier: Exclude<Modifier<QB>, ModifierFunction<any>> | Modifier<QB>[],
      ...args: unknown[]
    ): OpaqueQueryBuilder<QB>;
  }

  interface ModifiersMethod<QB extends AnyQueryBuilder> {
    (modifiers: Modifiers): QB;
    (): QB;
  }

  export interface Pojo {
    [key: string]: any;
  }

  export interface CatchablePromiseLike<R> extends PromiseLike<R> {
    catch<FR = never>(
      onrejected?: ((reason: any) => FR | PromiseLike<FR>) | undefined | null,
    ): Promise<R | FR>;
  }

  export class QueryBuilder<
    M extends Model,
    R = M[],
    S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
  > implements CatchablePromiseLike<R>
  {
    static forClass: ForClassMethod;

    /**
     * Type-only members used to compute the type of the query builder after
     * methods that change the result type, like `first()` or `patch()`.
     *
     * A custom query builder subclass only needs to redeclare `'~rebind'`:
     *
     * ```ts
     * class MyQueryBuilder<
     *   M extends Model,
     *   R = M[],
     *   S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
     * > extends QueryBuilder<M, R, S> {
     *   declare '~rebind': MyQueryBuilder<this['~M'], this['~R'], this['~S']>;
     * }
     * ```
     */
    '~args': unknown;
    '~M': this['~args'] extends [any, any, any] ? this['~args'][0] : any;
    '~R': this['~args'] extends [any, any, any] ? this['~args'][1] : any;
    '~S': this['~args'] extends [any, any, any] ? this['~args'][2] : any;
    '~rebind': QueryBuilder<this['~M'], this['~R'], this['~S']>;

    // The query builder types for each result kind. These are members (instead
    // of type aliases) so that comparing a custom query builder to its base
    // class doesn't need to expand them.
    // The members use `this` instead of the type parameters, so that they are
    // the same when TypeScript compares two query builder types.
    '~state': S;
    '~many': RebindQueryBuilder<this, this['ModelType'], this['~state']['item'][], this['~state']>;
    '~maybe': RebindQueryBuilder<
      this,
      this['ModelType'],
      this['~state']['item'] | undefined,
      this['~state']
    >;
    '~one': RebindQueryBuilder<this, this['ModelType'], this['~state']['item'], this['~state']>;
    '~count': RebindQueryBuilder<this, this['ModelType'], number, this['~state']>;
    '~page': RebindQueryBuilder<
      this,
      this['ModelType'],
      Page<this['~state']['item']>,
      this['~state']
    >;

    select: SelectMethod<this>;
    columns: SelectMethod<this>;
    column: SelectMethod<this>;
    distinct: SelectMethod<this>;
    distinctOn: SelectMethod<this>;
    as: AsMethod<this>;

    from: FromMethod<this>;
    table: FromMethod<this>;
    into: FromMethod<this>;
    fromRaw: FromRawMethod<this>;

    jsonExtract: JsonExtract<this>;
    jsonSet: JsonSet<this>;
    jsonInsert: JsonInsert<this>;
    jsonRemove: JsonRemove<this>;

    where: WhereMethod<this>;
    andWhere: WhereMethod<this>;
    orWhere: WhereMethod<this>;
    whereNot: WhereMethod<this>;
    andWhereNot: WhereMethod<this>;
    orWhereNot: WhereMethod<this>;
    whereLike: WhereMethod<this>;
    andWhereLike: WhereMethod<this>;
    orWhereLike: WhereMethod<this>;
    whereILike: WhereMethod<this>;
    andWhereILike: WhereMethod<this>;
    orWhereILike: WhereMethod<this>;

    /**
     * Makes the query match no rows: `where (1 = 0)`.
     */
    none(): this;
    whereRaw: WhereRawMethod<this>;
    orWhereRaw: WhereRawMethod<this>;
    andWhereRaw: WhereRawMethod<this>;

    whereWrapped: WhereWrappedMethod<this>;
    havingWrapped: WhereWrappedMethod<this>;

    whereExists: WhereExistsMethod<this>;
    orWhereExists: WhereExistsMethod<this>;
    whereNotExists: WhereExistsMethod<this>;
    orWhereNotExists: WhereExistsMethod<this>;

    whereIn: WhereInMethod<this>;
    orWhereIn: WhereInMethod<this>;
    whereNotIn: WhereInMethod<this>;
    orWhereNotIn: WhereInMethod<this>;

    whereBetween: WhereBetweenMethod<this>;
    orWhereBetween: WhereBetweenMethod<this>;
    andWhereBetween: WhereBetweenMethod<this>;
    whereNotBetween: WhereBetweenMethod<this>;
    orWhereNotBetween: WhereBetweenMethod<this>;
    andWhereNotBetween: WhereBetweenMethod<this>;

    whereNull: WhereNullMethod<this>;
    orWhereNull: WhereNullMethod<this>;
    whereNotNull: WhereNullMethod<this>;
    orWhereNotNull: WhereNullMethod<this>;

    whereColumn: WhereColumnMethod<this>;
    orWhereColumn: WhereColumnMethod<this>;
    andWhereColumn: WhereColumnMethod<this>;
    whereNotColumn: WhereColumnMethod<this>;
    orWhereNotColumn: WhereColumnMethod<this>;
    andWhereNotColumn: WhereColumnMethod<this>;

    whereJsonObject: WhereJsonObject<this>;
    orWhereJsonObject: WhereJsonObject<this>;
    andWhereJsonObject: WhereJsonObject<this>;
    whereNotJsonObject: WhereJsonObject<this>;
    orWhereNotJsonObject: WhereJsonObject<this>;
    andWhereNotJsonObject: WhereJsonObject<this>;

    whereJsonPath: WhereJsonPath<this>;
    orWhereJsonPath: WhereJsonPath<this>;
    andWhereJsonPath: WhereJsonPath<this>;

    whereJsonSupersetOf: WhereJsonMethod<this>;
    andWhereJsonSupersetOf: WhereJsonMethod<this>;
    orWhereJsonSupersetOf: WhereJsonMethod<this>;
    whereJsonNotSupersetOf: WhereJsonMethod<this>;
    andWhereJsonNotSupersetOf: WhereJsonMethod<this>;
    orWhereJsonNotSupersetOf: WhereJsonMethod<this>;
    whereJsonSubsetOf: WhereJsonMethod<this>;
    andWhereJsonSubsetOf: WhereJsonMethod<this>;
    orWhereJsonSubsetOf: WhereJsonMethod<this>;
    whereJsonNotSubsetOf: WhereJsonMethod<this>;
    andWhereJsonNotSubsetOf: WhereJsonMethod<this>;
    orWhereJsonNotSubsetOf: WhereJsonMethod<this>;
    whereJsonIsArray: WhereFieldExpressionMethod<this>;
    orWhereJsonIsArray: WhereFieldExpressionMethod<this>;
    whereJsonNotArray: WhereFieldExpressionMethod<this>;
    orWhereJsonNotArray: WhereFieldExpressionMethod<this>;
    whereJsonIsObject: WhereFieldExpressionMethod<this>;
    orWhereJsonIsObject: WhereFieldExpressionMethod<this>;
    whereJsonNotObject: WhereFieldExpressionMethod<this>;
    orWhereJsonNotObject: WhereFieldExpressionMethod<this>;
    /**
     * MySQL only: `JSON_OVERLAPS(field, value)`. True when two arrays share an item,
     * two objects share a key-value pair, or an array contains a scalar.
     */
    whereJsonOverlaps: WhereJsonMethod<this>;
    andWhereJsonOverlaps: WhereJsonMethod<this>;
    orWhereJsonOverlaps: WhereJsonMethod<this>;
    /**
     * MySQL only: the negation of `whereJsonOverlaps`. A NULL or missing field doesn't
     * overlap anything, so it's found.
     */
    whereJsonNotOverlaps: WhereJsonMethod<this>;
    andWhereJsonNotOverlaps: WhereJsonMethod<this>;
    orWhereJsonNotOverlaps: WhereJsonMethod<this>;
    whereJsonHasAny: WhereJsonExpressionMethod<this>;
    orWhereJsonHasAny: WhereJsonExpressionMethod<this>;
    whereJsonHasAll: WhereJsonExpressionMethod<this>;
    orWhereJsonHasAll: WhereJsonExpressionMethod<this>;

    having: WhereMethod<this>;
    andHaving: WhereMethod<this>;
    orHaving: WhereMethod<this>;

    havingRaw: WhereRawMethod<this>;
    orHavingRaw: WhereRawMethod<this>;

    havingIn: WhereInMethod<this>;
    orHavingIn: WhereInMethod<this>;
    havingNotIn: WhereInMethod<this>;
    orHavingNotIn: WhereInMethod<this>;

    havingNull: WhereNullMethod<this>;
    orHavingNull: WhereNullMethod<this>;
    havingNotNull: WhereNullMethod<this>;
    orHavingNotNull: WhereNullMethod<this>;

    havingExists: WhereExistsMethod<this>;
    orHavingExists: WhereExistsMethod<this>;
    havingNotExists: WhereExistsMethod<this>;
    orHavingNotExists: WhereExistsMethod<this>;

    havingBetween: WhereBetweenMethod<this>;
    orHavingBetween: WhereBetweenMethod<this>;
    havingNotBetween: WhereBetweenMethod<this>;
    orHavingNotBetween: WhereBetweenMethod<this>;

    whereComposite: WhereCompositeMethod<this>;
    whereInComposite: WhereInCompositeMethod<this>;
    whereNotInComposite: WhereInCompositeMethod<this>;

    union: UnionMethod<this>;
    unionAll: UnionMethod<this>;
    intersect: SetOperationsMethod<this>;
    except: SetOperationsMethod<this>;

    with: WithMethod<this>;
    withRecursive: WithMethod<this>;
    withWrapped: WithMethod<this>;
    withMaterialized: WithMethod<this>;
    withNotMaterialized: WithMethod<this>;

    joinRelated: JoinRelatedMethod<this>;
    innerJoinRelated: JoinRelatedMethod<this>;
    outerJoinRelated: JoinRelatedMethod<this>;
    leftJoinRelated: JoinRelatedMethod<this>;
    leftOuterJoinRelated: JoinRelatedMethod<this>;
    rightJoinRelated: JoinRelatedMethod<this>;
    rightOuterJoinRelated: JoinRelatedMethod<this>;
    fullOuterJoinRelated: JoinRelatedMethod<this>;

    join: JoinMethod<this>;
    joinRaw: JoinRawMethod<this>;
    innerJoin: JoinMethod<this>;
    leftJoin: JoinMethod<this>;
    leftOuterJoin: JoinMethod<this>;
    rightJoin: JoinMethod<this>;
    rightOuterJoin: JoinMethod<this>;
    outerJoin: JoinMethod<this>;
    fullOuterJoin: JoinMethod<this>;
    crossJoin: CrossJoinMethod<this>;

    count: CountMethod<this>;
    countDistinct: CountMethod<this>;
    min: AggregateMethod<this>;
    max: AggregateMethod<this>;
    sum: AggregateMethod<this>;
    sumDistinct: AggregateMethod<this>;
    avg: AggregateMethod<this>;
    avgDistinct: AggregateMethod<this>;
    increment: IncrementDecrementMethod<this>;
    decrement: IncrementDecrementMethod<this>;
    first(): IsAnyType<R> extends true ? any : [R] extends [readonly any[]] ? this['~maybe'] : this;

    orderBy: OrderByMethod<this>;
    orderByRaw: OrderByRawMethod<this>;

    groupBy: GroupByMethod<this>;
    groupByRaw: RawInterface<this>;

    findById(id: MaybeCompositeId): this['~maybe'];
    findByIds(ids: MaybeCompositeId[]): this;
    findOne: WhereMethod<this['~maybe']>;

    execute(): Promise<R>;
    // `castTo()` only changes the types. The relations of the graph methods are
    // still the relations of the original model, so they aren't checked after it.
    castTo<MC extends Model>(
      modelClass: ModelConstructor<MC>,
    ): RebindQueryBuilder<this, MC, ReplaceResultItem<R, MC>, CastItemState<MC>>;
    castTo<T>(): RebindQueryBuilder<this, M, T, QueryBuilderItemState<ResultItemOf<T, M>>>;

    // For generic code (like custom query builder methods) where the model type
    // isn't known: `this.update<{ deletedAt: Date }>({ deletedAt: new Date() })`.
    // These overloads come first so that the errors of the other overloads are
    // the ones that are reported.
    update<T extends object = never>(update: NoInfer<T>): this['~count'];
    update<U extends object>(update: U & CheckModelUpdate<M, U>): this['~count'];
    update(update: PartialModelObject<M>): this['~count'];
    update(): this['~count'];
    updateAndFetch<U extends object>(update: U & CheckModelUpdate<M, U>): this['~one'];
    updateAndFetch(update: PartialModelObject<M>): this['~one'];
    updateAndFetchById<U extends object>(
      id: MaybeCompositeId,
      update: U & CheckModelUpdate<M, U>,
    ): this['~one'];
    updateAndFetchById(id: MaybeCompositeId, update: PartialModelObject<M>): this['~one'];

    // For generic code (like custom query builder methods) where the model type
    // isn't known: `this.patch<{ deletedAt: Date }>({ deletedAt: new Date() })`.
    patch<T extends object = never>(update: NoInfer<T>): this['~count'];
    patch<U extends object>(update: U & CheckModelUpdate<M, U>): this['~count'];
    patch(update: PartialModelObject<M>): this['~count'];
    patch(): this['~count'];
    patchAndFetch<U extends object>(update: U & CheckModelUpdate<M, U>): this['~one'];
    patchAndFetch(update: PartialModelObject<M>): this['~one'];
    patchAndFetchById<U extends object>(
      id: MaybeCompositeId,
      update: U & CheckModelUpdate<M, U>,
    ): this['~one'];
    patchAndFetchById(id: MaybeCompositeId, update: PartialModelObject<M>): this['~one'];

    del(): this['~count'];
    delete(): this['~count'];
    deleteById(id: MaybeCompositeId): this['~count'];

    // For generic code where the model type isn't known.
    insert<T extends object = never>(insert: NoInfer<T>): this['~one'];
    insert<T extends object = never>(insert: NoInfer<T>[]): this['~many'];
    insert(insert: PartialModelObject<M>[]): this['~many'];
    insert(): this['~one'];
    // The error of the last overload is reported, so this one is last.
    insert(insert: PartialModelObject<M>): this['~one'];

    onConflict(column?: ColumnRef | ColumnRef[] | true): this;
    ignore(): this;
    merge<U extends object>(merge: U & CheckModelUpdate<M, U>): this;
    merge(merge?: PartialModelObject<M> | string[]): this;

    insertAndFetch(insert: PartialModelObject<M>): this['~one'];
    insertAndFetch(insert: PartialModelObject<M>[]): this['~many'];
    insertAndFetch(): this['~one'];

    relate(
      ids: MaybeCompositeId | MaybeCompositeId[] | PartialModelObject<M> | PartialModelObject<M>[],
    ): this['~count'];

    unrelate(): this['~count'];
    for(ids: ForIdValue | ForIdValue[]): this;

    withGraphFetched: WithGraphMethod<this>;
    withGraphJoined: WithGraphMethod<this>;

    truncate(): Promise<void>;
    allowGraph: AllowGraphMethod<this>;

    throwIfNotFound(arg?: any): IsSingleResult<R> extends true ? this['~one'] : this;

    returning(
      column: string | Raw | (string | Raw)[],
    ): IsAnyType<R> extends true ? any : [R] extends [number] ? this['~many'] : this;
    forUpdate: IdentityMethod<this>;
    forShare: IdentityMethod<this>;
    forNoKeyUpdate: IdentityMethod<this>;
    forKeyShare: IdentityMethod<this>;
    skipLocked: IdentityMethod<this>;
    noWait: IdentityMethod<this>;
    skipUndefined: IdentityMethod<this>;
    debug: IdentityMethod<this>;
    alias: OneArgMethod<string, this>;
    aliasFor: AliasForMethod<this>;
    withSchema: OneArgMethod<string, this>;
    modelClass: ModelClassMethod<M>;
    tableNameFor: TableRefForMethod;
    tableRefFor: TableRefForMethod;
    reject: OneArgMethod<any, this>;
    resolve: OneArgMethod<any, this>;
    transacting: OneArgMethod<TransactionOrKnex, this>;
    connection: OneArgMethod<TransactionOrKnex, this>;
    timeout: TimeoutMethod<this>;
    columnInfo: ColumnInfoMethod<this>;

    toKnexQuery<T extends {} = ModelObject<M>>(): Knex.QueryBuilder<T, T[]>;
    knex(knex?: Knex): Knex;
    clone(): this;

    page(page: number, pageSize: number): this['~page'];
    range(): this['~page'];
    range(start: number, end: number): this['~page'];
    offset(offset: number): this;
    limit(limit: number): this;
    resultSize(): Promise<number>;

    runBefore: RunBeforeMethod<this>;
    runAfter: RunAfterMethod<this>;

    onBuild: OnBuildMethod<this>;
    onBuildKnex: OnBuildKnexMethod<this>;
    onError: OnErrorMethod<this>;

    insertGraph: InsertGraphMethod<M>;
    insertGraphAndFetch: InsertGraphMethod<M>;

    upsertGraph: UpsertGraphMethod<M>;
    upsertGraphAndFetch: UpsertGraphMethod<M>;

    graphExpressionObject: GraphExpressionObjectMethod<this>;

    modifyGraph: ModifyGraphMethod<this>;

    context: ContextMethod<this>;
    clearContext: ClearContextMethod<this>;

    modify: ModifyMethod<this>;
    modifiers: ModifiersMethod<this>;

    isFind: BooleanReturningMethod;
    isExecutable: BooleanReturningMethod;
    isInsert: BooleanReturningMethod;
    isUpdate: BooleanReturningMethod;
    isDelete: BooleanReturningMethod;
    isRelate: BooleanReturningMethod;
    isUnrelate: BooleanReturningMethod;
    isInternal: BooleanReturningMethod;
    hasWheres: BooleanReturningMethod;
    hasSelects: BooleanReturningMethod;
    hasWithGraph: BooleanReturningMethod;

    has: HasMethod;
    clear: ClearMethod<this>;

    clearSelect: IdentityMethod<this>;
    clearOrder: IdentityMethod<this>;
    clearWhere: IdentityMethod<this>;
    clearWithGraph: IdentityMethod<this>;
    clearAllowGraph: IdentityMethod<this>;

    ModelType: M;
    ResultType: R;

    then<R1 = R, R2 = never>(
      onfulfilled?: ((value: R) => R1 | PromiseLike<R1>) | undefined | null,
      onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | undefined | null,
    ): Promise<R1 | R2>;

    catch<FR = never>(
      onrejected?: ((reason: any) => FR | PromiseLike<FR>) | undefined | null,
    ): Promise<R | FR>;
  }

  type X<T> = Promise<T>;

  interface FetchGraphOptions {
    transaction?: TransactionOrKnex;
    skipFetched?: boolean;
  }

  interface TraverserFunction {
    (model: Model, parentModel: Model, relationName: string): void;
  }

  type ArrayQueryBuilderThunk<M extends Model> = () => ArrayQueryBuilder<QueryBuilderType<M>>;
  type CancelQueryThunk = (result: any) => void;

  export interface StaticHookArguments<M extends Model, R = any> {
    asFindQuery: ArrayQueryBuilderThunk<M>;
    cancelQuery: CancelQueryThunk;
    context: QueryContext;
    transaction: TransactionOrKnex;
    relation?: Relation;
    modelOptions?: ModelOptions;
    items: Model[];
    inputItems: M[];
    result?: R;
  }

  export type Transaction = Knex.Transaction;
  export type TransactionOrKnex = Transaction | Knex;

  export interface RelationMappings {
    [relationName: string]: RelationMapping<any>;
  }

  export type RelationMappingsThunk = () => RelationMappings;

  type ModelClassFactory = () => AnyModelConstructor;
  type ModelClassSpecifier = ModelClassFactory | AnyModelConstructor | string;
  type RelationMappingHook<M extends Model> = (
    model: M,
    context: QueryContext,
  ) => Promise<void> | void;
  type StringOrReferenceBuilder = string | ReferenceBuilder;
  type RelationMappingColumnRef = StringOrReferenceBuilder | readonly StringOrReferenceBuilder[];

  export interface RelationMapping<M extends Model> {
    relation: RelationType;
    modelClass: ModelClassSpecifier;
    join: RelationJoin;
    modify?: Modifier<QueryBuilderType<M>>;
    filter?: Modifier<QueryBuilderType<M>>;
    beforeInsert?: RelationMappingHook<M>;
  }

  export interface RelationJoin {
    from: RelationMappingColumnRef;
    to: RelationMappingColumnRef;
    through?: RelationThrough<any>;
  }

  export interface RelationThrough<M extends Model> {
    from: RelationMappingColumnRef;
    to: RelationMappingColumnRef;
    extra?: string | readonly string[] | Readonly<Record<string, string>>;
    modelClass?: ModelClassSpecifier;
    modify?: Modifier<QueryBuilderType<M>>;
    filter?: Modifier<QueryBuilderType<M>>;
    beforeInsert?: RelationMappingHook<M>;
  }

  type RelationCardinality = 'one' | 'many';

  export interface RelationType<C extends RelationCardinality = RelationCardinality>
    extends Constructor<Relation> {
    // Type-only: whether the relation is to one model or to many models.
    '~cardinality'?: C;
  }

  /**
   * The relation mappings of model class `MC`, as written in its static
   * `relationMappings` property (an object or a function that returns one).
   * `{}` when they can't be inferred, for example when the property has the
   * type annotation `RelationMappings` or `RelationMappingsThunk`.
   */
  export type RelationMappingsOf<MC> = MC extends { relationMappings: infer R }
    ? InferredRelationMappings<R extends (...args: any[]) => infer O ? O : R>
    : {};

  type InferredRelationMappings<T> =
    IsAnyType<T> extends true ? {} : string extends keyof T ? {} : T;

  // The model class of a relation mapping's `modelClass`: a class, or a
  // function that returns one. `never` for module paths, whose class can't
  // be known.
  type RelatedModelClassOf<C> =
    IsAnyType<C> extends true
      ? never
      : C extends abstract new (...args: any[]) => Model
        ? C
        : C extends () => infer K
          ? K extends abstract new (...args: any[]) => Model
            ? K
            : never
          : never;

  type RelatedModelOf<C> = [RelatedModelClassOf<C>] extends [never]
    ? Model
    : ModelInstance<RelatedModelClassOf<C>>;

  // `join.through.extra` as an object of `{ property: column }`.
  type RelationExtraColumns<E> = E extends string
    ? { [K in E]: K }
    : E extends readonly (infer N extends string)[]
      ? { [K in N]: K }
      : E extends Readonly<Record<string, string>>
        ? E
        : {};

  type RelationExtraProps<Mapping> = Mapping extends {
    join: { through: infer Through };
  }
    ? Through extends { extra: infer E }
      ? RelationExtraColumns<E> extends infer Columns
        ? string extends keyof Columns
          ? // The names of the columns are not known, for example when they
            // were inferred as `string[]`. Use `defineRelations` to keep them.
            {}
          : {
              -readonly [P in keyof Columns]: Through extends { modelClass: infer C }
                ? Columns[P] extends keyof RelatedModelOf<C>
                  ? RelatedModelOf<C>[Columns[P]]
                  : unknown
                : unknown;
            }
        : {}
      : {}
    : {};

  type WithRelationExtraProps<M, Extra> = {} extends Extra ? M : M & Extra;

  /**
   * The type of the relation property of a relation mapping.
   */
  export type RelationPropertyType<Mapping> = Mapping extends {
    relation: infer Type;
    modelClass: infer C;
  }
    ? WithRelationExtraProps<RelatedModelOf<C>, RelationExtraProps<Mapping>> extends infer Related
      ? Type extends { '~cardinality'?: infer Cardinality }
        ? [NonNullable<Cardinality>] extends ['many']
          ? Related[]
          : [NonNullable<Cardinality>] extends ['one']
            ? Related | null
            : Related | Related[] | null
        : Related | Related[] | null
      : never
    : never;

  /**
   * The relation properties of model class `MC`, inferred from its
   * `relationMappings`. Use it to add the relation properties to the model's
   * instances without declaring each of them:
   *
   * ```ts
   * class Person extends Model {
   *   static relationMappings = () => ({ pets: { ... } });
   * }
   *
   * interface Person extends RelationsOf<typeof Person> {}
   * ```
   */
  export type RelationsOf<MC> = {
    [K in keyof RelationMappingsOf<MC>]?: RelationPropertyType<RelationMappingsOf<MC>[K]>;
  };

  type InferredRelationProps<MC, I> = {
    [K in Exclude<keyof RelationMappingsOf<MC>, keyof I>]?: RelationPropertyType<
      RelationMappingsOf<MC>[K]
    >;
  };

  /**
   * The instance type of model class `MC`, including the relation properties
   * inferred from its `relationMappings` that the class doesn't declare.
   */
  export type ModelInstance<MC> = MC extends abstract new (...args: any[]) => infer I
    ? [Exclude<keyof RelationMappingsOf<MC>, keyof I>] extends [never]
      ? I
      : I & InferredRelationProps<MC, I>
    : never;

  /**
   * The names of the relations of model class `MC` inferred from its
   * `relationMappings`.
   */
  type RelationNamesOf<MC> = keyof RelationMappingsOf<MC> & string;

  // The query builder of a relation for the static `relatedQuery()`.
  type RelationQueryBuilder<Mapping> = Mapping extends { modelClass: infer C }
    ? [RelatedModelClassOf<C>] extends [never]
      ? QueryBuilder<Model>
      : ModelClassQueryBuilder<
          RelatedModelClassOf<C>,
          Extract<
            WithRelationExtraProps<
              ModelInstance<RelatedModelClassOf<C>>,
              RelationExtraProps<Mapping>
            >,
            Model
          >,
          WithRelationExtraProps<
            ModelRow<ModelInstance<RelatedModelClassOf<C>>>,
            RelationExtraProps<Mapping>
          >
        >
    : QueryBuilder<Model>;

  // Shown in the error message when a relation name isn't known.
  type UnknownRelationName = {
    '~error': 'Unknown relation. Pass the related model type explicitly for relation names that can not be checked: relatedQuery<Pet>(name)';
  };

  type RelationMappingsDefinition = { readonly [relationName: string]: RelationMapping<any> };

  export interface DefineRelationsFunction {
    /**
     * Returns the relation mappings as is. Use it to define `relationMappings`
     * so that the types of the relations can be inferred exactly:
     *
     * ```ts
     * static relationMappings = defineRelations(() => ({
     *   movies: {
     *     relation: Model.ManyToManyRelation,
     *     modelClass: Movie,
     *     join: {
     *       from: 'persons.id',
     *       through: { from: 'persons_movies.personId', to: 'persons_movies.movieId', extra: ['role'] },
     *       to: 'movies.id',
     *     },
     *   },
     * }));
     * ```
     */
    <const T extends RelationMappingsDefinition>(relationMappings: () => T): () => T;
    <const T extends RelationMappingsDefinition>(relationMappings: T): T;
  }

  export interface Relation {
    name: string;
    ownerModelClass: typeof Model;
    relatedModelClass: typeof Model;
    ownerProp: RelationProperty;
    relatedProp: RelationProperty;
    joinModelClass: typeof Model;
    joinTable: string;
    joinTableOwnerProp: RelationProperty;
    joinTableRelatedProp: RelationProperty;
  }

  export interface RelationProperty {
    size: number;
    modelClass: typeof Model;
    props: string[];
    cols: string[];
  }

  export interface Relations {
    [name: string]: Relation;
  }

  export interface QueryContext {
    transaction: Transaction;
    [key: string]: any;
  }

  export interface ModelOptions {
    patch?: boolean;
    skipValidation?: boolean;
    old?: object;
  }

  export interface CloneOptions {
    shallow?: boolean;
  }

  export interface ToJsonOptions extends CloneOptions {
    virtuals?: boolean | string[];
  }

  export interface ValidatorContext {
    [key: string]: any;
  }

  export interface ValidatorArgs {
    ctx: ValidatorContext;
    model: Model;
    json: Pojo;
    options: ModelOptions;
  }

  export class Validator {
    beforeValidate(args: ValidatorArgs): void;
    validate(args: ValidatorArgs): Pojo;
    afterValidate(args: ValidatorArgs): void;
  }

  export interface AjvConfig {
    onCreateAjv(ajv: Ajv): void;
    options?: AjvOptions;
  }

  export class AjvValidator extends Validator {
    constructor(config: AjvConfig);
  }

  export interface SnakeCaseMappersOptions {
    upperCase?: boolean;
    underscoreBeforeDigits?: boolean;
    underscoreBetweenUppercaseLetters?: boolean;
  }

  export interface ColumnNameMappers {
    parse(json: Pojo): Pojo;
    format(json: Pojo): Pojo;
  }

  export interface SnakeCaseMappersFactory {
    (options?: SnakeCaseMappersOptions): ColumnNameMappers;
  }

  export interface KnexMappers {
    wrapIdentifier(identifier: string, origWrap: Identity<string>): string;
    postProcessResponse(response: any): any;
  }

  export interface KnexSnakeCaseMappersFactory {
    (options?: SnakeCaseMappersOptions): KnexMappers;
  }

  export type ValidationErrorType =
    | 'ModelValidation'
    | 'RelationExpression'
    | 'UnallowedRelation'
    | 'InvalidGraph';

  export class ValidationError extends Error {
    constructor(args: CreateValidationErrorArgs & { modelClass?: ModelClass<Model> });

    statusCode: number;
    message: string;
    data?: ErrorHash | any;
    type: ValidationErrorType | string;
    modelClass: ModelClass<Model>;
  }

  export interface ValidationErrorItem {
    message: string;
    keyword: string;
    params: Pojo;
  }

  export interface ErrorHash {
    [columnName: string]: ValidationErrorItem[];
  }

  export interface CreateValidationErrorArgs {
    statusCode?: number;
    message?: string;
    data?: ErrorHash | any;
    // This can be any string for custom errors. ValidationErrorType is there
    // only to document the default values objection uses internally.
    type: ValidationErrorType | string;
  }

  export class NotFoundError extends Error {
    constructor(args: CreateNotFoundErrorArgs & { modelClass?: ModelClass<Model> });

    statusCode: number;
    data?: any;
    type: 'NotFound';
    modelClass: ModelClass<Model>;
  }

  export interface CreateNotFoundErrorArgs {
    statusCode?: number;
    message?: string;
    data?: any;
    [key: string]: any;
  }

  export interface TableMetadata {
    columns: Array<string>;
  }

  export interface TableMetadataOptions {
    table: string;
  }

  export interface FetchTableMetadataOptions {
    knex?: Knex;
    force?: boolean;
    table?: string;
  }

  export interface Constructor<T> {
    new (): T;
  }

  interface PrototypeType<T> extends Function {
    prototype: T;
  }

  interface ConstructorFunctionType<T = any> extends PrototypeType<T> {
    new (...args: any[]): T;
  }

  // for internal use on generic static this deduction, copied from https://github.com/microsoft/TypeScript/issues/5863#issuecomment-1483978415
  type ConstructorType<T = unknown, Static extends Record<string, any> = PrototypeType<T>> = (
    | ConstructorFunctionType<T>
    | PrototypeType<T>
  ) & {
    [Key in keyof Static]: Static[Key];
  };

  export interface ModelConstructor<M extends Model> extends Constructor<M> {}

  export interface ModelClass<M extends Model> extends ModelConstructor<M> {
    QueryBuilder: typeof QueryBuilder;

    tableName: string;
    idColumn: string | string[];
    jsonSchema: JSONSchema;
    relationMappings: RelationMappings | RelationMappingsThunk;
    modelPaths: string[];
    jsonAttributes: string[];
    virtualAttributes: string[];
    uidProp: string;
    uidRefProp: string;
    dbRefProp: string;
    propRefRegex: RegExp;
    pickJsonSchemaProperties: boolean;
    relatedFindQueryMutates: boolean;
    relatedInsertQueryMutates: boolean;
    useLimitInFirst: boolean;
    modifiers: Modifiers;
    columnNameMappers: ColumnNameMappers;

    raw: RawFunction;
    ref: ReferenceFunction;
    fn: FunctionFunction;

    BelongsToOneRelation: RelationType<'one'>;
    HasOneRelation: RelationType<'one'>;
    HasManyRelation: RelationType<'many'>;
    ManyToManyRelation: RelationType<'many'>;
    HasOneThroughRelation: RelationType<'one'>;

    defaultGraphOptions?: GraphOptions;

    query(this: Constructor<M>, trxOrKnex?: TransactionOrKnex): QueryBuilderType<M>;

    relatedQuery<K extends keyof M>(
      relationName: K,
      trxOrKnex?: TransactionOrKnex,
    ): NoInfer<ArrayRelatedQueryBuilder<M[K]>>;

    // For relation names that can't be checked. The model type of the
    // relation must be given explicitly: `relatedQuery<Pet>(relationName)`.
    relatedQuery<RM extends Model = never>(
      relationName: [RM] extends [never] ? UnknownRelationName : string,
      trxOrKnex?: TransactionOrKnex,
    ): RowQueryBuilder<QueryBuilderType<RM>, RM>;

    fromJson(json: object, opt?: ModelOptions): M;
    fromDatabaseJson(json: object): M;

    columnNameToPropertyName(columnName: string): string;
    propertyNameToColumnName(propertyName: string): string;

    createValidator(): Validator;
    createValidationError(args: CreateValidationErrorArgs): Error;
    createNotFoundError(queryContext: QueryContext, args: CreateNotFoundErrorArgs): Error;

    tableMetadata(opt?: TableMetadataOptions): TableMetadata;
    fetchTableMetadata(opt?: FetchTableMetadataOptions): Promise<TableMetadata>;

    knex(knex?: Knex): Knex;
    knexQuery(): Knex.QueryBuilder;
    startTransaction(knexOrTransaction?: TransactionOrKnex): Promise<Transaction>;

    transaction<T>(callback: (trx: Transaction) => Promise<T>): Promise<T>;
    transaction<T>(
      trxOrKnex: TransactionOrKnex,
      callback: (trx: Transaction) => Promise<T>,
    ): Promise<T>;

    bindKnex(trxOrKnex: TransactionOrKnex): this;
    bindTransaction(trxOrKnex: TransactionOrKnex): this;

    fetchGraph<T extends PartialModelObject<M>, const E extends RelationExpression<M>>(
      modelOrObject: T,
      expression: CheckRelationExpression<M, E>,
      options?: FetchGraphOptions,
    ): FetchGraphQueryBuilder<QueryBuilderType<M>, M, T, E, 'one'>;

    fetchGraph<T extends PartialModelObject<M>, const E extends RelationExpression<M>>(
      modelOrObject: T[],
      expression: CheckRelationExpression<M, E>,
      options?: FetchGraphOptions,
    ): FetchGraphQueryBuilder<QueryBuilderType<M>, M, T, E, 'many'>;

    getRelations(): Relations;
    getRelation(name: string): Relation;

    traverse(models: Model | Model[], traverser: TraverserFunction): void;
    traverse(
      filterConstructor: ModelConstructor<Model>,
      models: Model | Model[],
      traverser: TraverserFunction,
    ): void;
    traverseAsync(models: Model | Model[], traverser: TraverserFunction): Promise<void>;
    traverseAsync(
      filterConstructor: ModelConstructor<Model>,
      models: Model | Model[],
      traverser: TraverserFunction,
    ): Promise<void>;

    beforeFind(args: StaticHookArguments<any>): any;
    afterFind(args: StaticHookArguments<any>): any;
    beforeInsert(args: StaticHookArguments<any>): any;
    afterInsert(args: StaticHookArguments<any>): any;
    beforeUpdate(args: StaticHookArguments<any>): any;
    afterUpdate(args: StaticHookArguments<any>): any;
    beforeDelete(args: StaticHookArguments<any>): any;
    afterDelete(args: StaticHookArguments<any>): any;
  }

  export class Model {
    // This allows model classes to be used as the base class of mixins.
    constructor(...args: any[]);

    static QueryBuilder: typeof QueryBuilder;

    static tableName: string;
    static idColumn: string | string[];
    static jsonSchema: JSONSchema;
    static relationMappings: RelationMappings | RelationMappingsThunk;
    static modelPaths: string[];
    static jsonAttributes: string[];
    static virtualAttributes: string[];
    static uidProp: string;
    static uidRefProp: string;
    static dbRefProp: string;
    static propRefRegex: RegExp;
    static pickJsonSchemaProperties: boolean;
    static relatedFindQueryMutates: boolean;
    static relatedInsertQueryMutates: boolean;
    static useLimitInFirst: boolean;
    static modifiers: Modifiers;
    static columnNameMappers: ColumnNameMappers;

    static raw: RawFunction;
    /**
     * A reference to a column of this model, qualified with the table (or the alias
     * of the table) in the query. The column must be a property of the model. Pass the
     * expression as a type argument for columns the model doesn't declare:
     * `Person.ref<'legacy_column'>('legacy_column')`.
     */
    static ref<E extends string = never>(
      expression: [E] extends [never] ? never : NoInfer<E>,
    ): ReferenceBuilder;
    static ref<MC extends AnyModelConstructor, E extends RefExpression<ModelInstance<MC>>>(
      this: MC,
      expression: E,
    ): ReferenceBuilder<RefValue<ModelInstance<MC>, E>>;
    static fn: FunctionFunction;

    static BelongsToOneRelation: RelationType<'one'>;
    static HasOneRelation: RelationType<'one'>;
    static HasManyRelation: RelationType<'many'>;
    static ManyToManyRelation: RelationType<'many'>;
    static HasOneThroughRelation: RelationType<'one'>;

    static defaultGraphOptions?: GraphOptions;

    static query<MC extends Constructor<Model>>(
      this: MC,
      trxOrKnex?: TransactionOrKnex,
    ): ModelClassQueryBuilder<MC, Extract<ModelInstance<MC>, Model>>;

    static relatedQuery<MC extends Constructor<Model>, K extends RelationNamesOf<MC>>(
      this: MC,
      relationName: K,
      trxOrKnex?: TransactionOrKnex,
    ): RelationQueryBuilder<RelationMappingsOf<MC>[K]>;

    static relatedQuery<M extends Model, K extends keyof M>(
      this: ConstructorType<M>,
      relationName: K,
      trxOrKnex?: TransactionOrKnex,
    ): NoInfer<ArrayRelatedQueryBuilder<M[K]>>;

    // For relation names that can't be checked. The model type of the
    // relation must be given explicitly: `relatedQuery<Pet>(relationName)`.
    static relatedQuery<RM extends Model = never>(
      relationName: [RM] extends [never] ? UnknownRelationName : string,
      trxOrKnex?: TransactionOrKnex,
    ): RowQueryBuilder<QueryBuilderType<RM>, RM>;

    static fromJson<MC extends Constructor<Model>>(
      this: MC,
      json: object,
      opt?: ModelOptions,
    ): ModelInstance<MC>;
    static fromJson<M extends Model>(this: Constructor<M>, json: object, opt?: ModelOptions): M;
    static fromDatabaseJson<MC extends Constructor<Model>>(
      this: MC,
      json: object,
    ): ModelInstance<MC>;
    static fromDatabaseJson<M extends Model>(this: Constructor<M>, json: object): M;

    static columnNameToPropertyName(columnName: string): string;
    static propertyNameToColumnName(propertyName: string): string;

    static createValidator(): Validator;
    static createValidationError(args: CreateValidationErrorArgs): Error;
    static createNotFoundError(queryContext: QueryContext, args: CreateNotFoundErrorArgs): Error;

    static tableMetadata(opt?: TableMetadataOptions): TableMetadata;
    static fetchTableMetadata(opt?: FetchTableMetadataOptions): Promise<TableMetadata>;

    static knex(knex?: Knex): Knex;
    static knexQuery(): Knex.QueryBuilder;
    static startTransaction(knexOrTransaction?: TransactionOrKnex): Promise<Transaction>;

    static transaction<T>(callback: (trx: Transaction) => Promise<T>): Promise<T>;
    static transaction<T>(
      trxOrKnex: TransactionOrKnex | undefined,
      callback: (trx: Transaction) => Promise<T>,
    ): Promise<T>;

    static bindKnex<M>(this: M, trxOrKnex: TransactionOrKnex): M;
    static bindTransaction<M>(this: M, trxOrKnex: TransactionOrKnex): M;

    static fetchGraph: StaticFetchGraphMethod;

    static getRelations(): Relations;
    static getRelation(name: string): Relation;

    static traverse(models: Model | Model[], traverser: TraverserFunction): void;
    static traverse(
      filterConstructor: typeof Model,
      models: Model | Model[],
      traverser: TraverserFunction,
    ): void;
    static traverseAsync(models: Model | Model[], traverser: TraverserFunction): Promise<void>;
    static traverseAsync(
      filterConstructor: typeof Model,
      models: Model | Model[],
      traverser: TraverserFunction,
    ): Promise<void>;

    static beforeFind(args: StaticHookArguments<any>): any;
    static afterFind(args: StaticHookArguments<any>): any;
    static beforeInsert(args: StaticHookArguments<any>): any;
    static afterInsert(args: StaticHookArguments<any>): any;
    static beforeUpdate(args: StaticHookArguments<any>): any;
    static afterUpdate(args: StaticHookArguments<any>): any;
    static beforeDelete(args: StaticHookArguments<any>): any;
    static afterDelete(args: StaticHookArguments<any>): any;

    $modelClass: ModelClass<this>;

    $relatedQuery<K extends keyof this>(
      relationName: K,
      trxOrKnex?: TransactionOrKnex,
    ): NoInfer<RelatedQueryBuilder<this[K]>>;

    // For relation names that can't be checked. The model type of the
    // relation must be given explicitly: `$relatedQuery<Pet>(relationName)`.
    $relatedQuery<RM extends Model = never>(
      relationName: [RM] extends [never] ? UnknownRelationName : string,
      trxOrKnex?: TransactionOrKnex,
    ): RowQueryBuilder<QueryBuilderType<RM>, RM>;

    $query(trxOrKnex?: TransactionOrKnex): SingleQueryBuilder<QueryBuilderType<this>>;

    $id(id: any): void;
    $id(): any;

    // `this` is a type parameter so that the signature is the same for every model,
    // which makes comparing models much faster.
    $fetchGraph<T extends Model, const E extends RelationExpression<Model>>(
      this: T,
      expression: CheckRelationExpression<ModelOfRow<T>, E>,
      options?: FetchGraphOptions,
    ): FetchGraphQueryBuilder<QueryBuilderType<T>, ModelOfRow<T>, T, E, 'one'>;

    $formatDatabaseJson(json: Pojo): Pojo;
    $parseDatabaseJson(json: Pojo): Pojo;

    $formatJson(json: Pojo): Pojo;
    $parseJson(json: Pojo, opt?: ModelOptions): Pojo;

    $beforeValidate(jsonSchema: JSONSchema, json: Pojo, opt: ModelOptions): JSONSchema;
    $validate(json?: Pojo, opt?: ModelOptions): Pojo; // may throw ValidationError if validation fails
    $afterValidate(json: Pojo, opt: ModelOptions): void; // may throw ValidationError if validation fails

    $beforeInsert(queryContext: QueryContext): Promise<any> | void;
    $afterInsert(queryContext: QueryContext): Promise<any> | void;
    $afterUpdate(opt: ModelOptions, queryContext: QueryContext): Promise<any> | void;
    $beforeUpdate(opt: ModelOptions, queryContext: QueryContext): Promise<any> | void;
    $afterFind(queryContext: QueryContext): Promise<any> | void;
    $beforeDelete(queryContext: QueryContext): Promise<any> | void;
    $afterDelete(queryContext: QueryContext): Promise<any> | void;

    $toDatabaseJson(): Pojo;
    $toJson(opt?: ToJsonOptions): ModelObject<this>;
    toJSON(opt?: ToJsonOptions): ModelObject<this>;

    $setJson(json: object, opt?: ModelOptions): this;
    $setDatabaseJson(json: object): this;

    $setRelated<RM extends Model>(
      relation: String | Relation,
      related: RM | RM[] | null | undefined,
    ): this;

    $appendRelated<RM extends Model>(
      relation: String | Relation,
      related: RM | RM[] | null | undefined,
    ): this;

    $set(obj: Pojo): this;
    $clone(opt?: CloneOptions): this;
    $traverse(filterConstructor: typeof Model, traverser: TraverserFunction): this;
    $traverse(traverser: TraverserFunction): this;
    $traverseAsync(filterConstructor: typeof Model, traverser: TraverserFunction): Promise<this>;
    $traverseAsync(traverser: TraverserFunction): Promise<this>;
    $omitFromJson(keys: string | string[] | { [key: string]: boolean }): this;
    $omitFromDatabaseJson(keys: string | string[] | { [key: string]: boolean }): this;

    $knex(): Knex;
    $transaction(): Knex;

    QueryBuilderType: QueryBuilder<this, this[], QueryBuilderItemState<this>>;
  }

  /**
   * Overloading is required here until the following issues (at least) are resolved:
   *
   * - https://github.com/microsoft/TypeScript/issues/1360
   * - https://github.com/Microsoft/TypeScript/issues/5453
   *
   * @tutorial https://vincit.github.io/objection.js/guide/transactions.html#creating-a-transaction
   */
  export interface transaction {
    start(knexOrModel: Knex | AnyModelConstructor): Promise<Transaction>;

    <MC1 extends AnyModelConstructor, ReturnValue>(
      modelClass1: MC1,
      callback: (boundModelClass: MC1, trx?: Transaction) => Promise<ReturnValue>,
    ): Promise<ReturnValue>;

    <MC1 extends AnyModelConstructor, MC2 extends AnyModelConstructor, ReturnValue>(
      modelClass1: MC1,
      modelClass2: MC2,
      callback: (
        boundModelClass1: MC1,
        boundModelClass2: MC2,
        trx?: Transaction,
      ) => Promise<ReturnValue>,
    ): Promise<ReturnValue>;

    <
      MC1 extends AnyModelConstructor,
      MC2 extends AnyModelConstructor,
      MC3 extends AnyModelConstructor,
      ReturnValue,
    >(
      modelClass1: MC1,
      modelClass2: MC2,
      modelClass3: MC3,
      callback: (
        boundModelClass1: MC1,
        boundModelClass2: MC2,
        boundModelClass3: MC3,
        trx?: Transaction,
      ) => Promise<ReturnValue>,
    ): Promise<ReturnValue>;

    <
      MC1 extends AnyModelConstructor,
      MC2 extends AnyModelConstructor,
      MC3 extends AnyModelConstructor,
      MC4 extends AnyModelConstructor,
      ReturnValue,
    >(
      modelClass1: MC1,
      modelClass2: MC2,
      modelClass3: MC3,
      modelClass4: MC4,
      callback: (
        boundModelClass1: MC1,
        boundModelClass2: MC2,
        boundModelClass3: MC3,
        boundModelClass4: MC4,
        trx?: Transaction,
      ) => Promise<ReturnValue>,
    ): Promise<ReturnValue>;

    <
      MC1 extends AnyModelConstructor,
      MC2 extends AnyModelConstructor,
      MC3 extends AnyModelConstructor,
      MC4 extends AnyModelConstructor,
      MC5 extends AnyModelConstructor,
      ReturnValue,
    >(
      modelClass1: MC1,
      modelClass2: MC2,
      modelClass3: MC3,
      modelClass4: MC4,
      modelClass5: MC5,
      callback: (
        boundModelClass1: MC1,
        boundModelClass2: MC2,
        boundModelClass3: MC3,
        boundModelClass4: MC4,
        boundModelClass5: MC5,
        trx?: Transaction,
      ) => Promise<ReturnValue>,
    ): Promise<ReturnValue>;

    <ReturnValue>(
      knex: Knex,
      callback: (trx: Transaction) => Promise<ReturnValue>,
    ): Promise<ReturnValue>;
  }

  interface initialize {
    (knex: Knex, modelClasses: AnyModelConstructor[]): Promise<void>;
    (modelClasses: AnyModelConstructor[]): Promise<void>;
  }

  /**
   * JSON Schema 7
   * Draft 07
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01
   *
   * These definitions were written by
   *
   * Boris Cherny https://github.com/bcherny,
   * Cyrille Tuzi https://github.com/cyrilletuzi,
   * Lucian Buzzo https://github.com/lucianbuzzo,
   * Roland Groza https://github.com/rolandjitsu.
   *
   * https://www.npmjs.com/package/@types/json-schema
   */

  /**
   * Primitive type
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.1.1
   */
  export type JSONSchemaTypeName =
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'object'
    | 'array'
    | 'null'
    | string;

  export type JSONSchemaType = JSONSchemaArray[] | boolean | number | null | object | string;

  // Workaround for infinite type recursion
  // https://github.com/Microsoft/TypeScript/issues/3496#issuecomment-128553540
  export interface JSONSchemaArray extends Array<JSONSchemaType> {}

  /**
   * Meta schema
   *
   * Recommended values:
   * - 'http://json-schema.org/schema#'
   * - 'http://json-schema.org/hyper-schema#'
   * - 'http://json-schema.org/draft-07/schema#'
   * - 'http://json-schema.org/draft-07/hyper-schema#'
   *
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-5
   */
  export type JSONSchemaVersion = string;

  /**
   * JSON Schema v7
   * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01
   */
  export type JSONSchemaDefinition = JSONSchema | boolean;
  export interface JSONSchema {
    $id?: string;
    $ref?: string;
    $schema?: JSONSchemaVersion;
    $comment?: string;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.1
     */
    type?: JSONSchemaTypeName | JSONSchemaTypeName[];
    enum?: JSONSchemaType[];
    const?: JSONSchemaType;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.2
     */
    multipleOf?: number;
    maximum?: number;
    exclusiveMaximum?: number;
    minimum?: number;
    exclusiveMinimum?: number;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.3
     */
    maxLength?: number;
    minLength?: number;
    pattern?: string;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.4
     */
    items?: JSONSchemaDefinition | JSONSchemaDefinition[];
    additionalItems?: JSONSchemaDefinition;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    contains?: JSONSchema;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.5
     */
    maxProperties?: number;
    minProperties?: number;
    required?: string[];
    properties?: {
      [key: string]: JSONSchemaDefinition;
    };
    patternProperties?: {
      [key: string]: JSONSchemaDefinition;
    };
    additionalProperties?: JSONSchemaDefinition;
    dependencies?: {
      [key: string]: JSONSchemaDefinition | string[];
    };
    propertyNames?: JSONSchemaDefinition;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.6
     */
    if?: JSONSchemaDefinition;
    then?: JSONSchemaDefinition;
    else?: JSONSchemaDefinition;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-6.7
     */
    allOf?: JSONSchemaDefinition[];
    anyOf?: JSONSchemaDefinition[];
    oneOf?: JSONSchemaDefinition[];
    not?: JSONSchemaDefinition;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-7
     */
    format?: string;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-8
     */
    contentMediaType?: string;
    contentEncoding?: string;

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-9
     */
    definitions?: {
      [key: string]: JSONSchemaDefinition;
    };

    /**
     * @see https://tools.ietf.org/html/draft-handrews-json-schema-validation-01#section-10
     */
    title?: string;
    description?: string;
    default?: JSONSchemaType;
    readOnly?: boolean;
    writeOnly?: boolean;
    examples?: JSONSchemaType;
  }
}
