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

  export interface RawFunction extends RawInterface<RawBuilder> {}
  export interface RawInterface<R> {
    (sql: string, ...bindings: any[]): R;
  }

  export interface ValueBuilder extends Castable {}
  export interface ValueFunction {
    (
      value: PrimitiveValue | PrimitiveValue[] | PrimitiveValueObject | PrimitiveValueObject[],
    ): ValueBuilder;
  }

  export interface ReferenceBuilder extends Castable {
    from(tableReference: string): this;
  }
  export interface ReferenceFunction {
    (expression: string): ReferenceBuilder;
  }

  export interface FunctionBuilder extends Castable {}
  export interface SqlFunctionShortcut {
    (...args: any[]): FunctionBuilder;
  }
  export interface FunctionFunction {
    (functionName: string, ...arguments: any[]): FunctionBuilder;

    now(precision: number): FunctionBuilder;
    now(): FunctionBuilder;

    coalesce: SqlFunctionShortcut;
    concat: SqlFunctionShortcut;
    sum: SqlFunctionShortcut;
    avg: SqlFunctionShortcut;
    min: SqlFunctionShortcut;
    max: SqlFunctionShortcut;
    count: SqlFunctionShortcut;
    upper: SqlFunctionShortcut;
    lower: SqlFunctionShortcut;
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
      [K in keyof T]?: NonNullable<T[K]> extends Model
        ? never
        : NonNullable<T[K]> extends Array<infer I>
          ? I extends Model
            ? never
            : K
          : T[K] extends Function
            ? never
            : K;
    }[keyof T],
    undefined | 'QueryBuilderType'
  >;

  /**
   * Extracts the relation names of the a model class.
   */
  type ModelRelations<T extends Model> = Defined<
    {
      [K in keyof T]?: NonNullable<T[K]> extends Model
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
      MaybeSingleQueryBuilder<QueryBuilderType<T>>
    : T extends Array<infer I>
      ? I extends Model
        ? QueryBuilderType<I>
        : never
      : never;

  /**
   * Just like RelatedQueryBuilder but always returns an array
   * query builder even if the property type is a model and not
   * an array of models.
   */
  type ArrayRelatedQueryBuilder<T> = T extends Model
    ? QueryBuilderType<T>
    : T extends Array<infer I>
      ? I extends Model
        ? QueryBuilderType<I>
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
  }

  type QueryBuilderItemState<T> = { item: T };

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
    IsAnyType<R> extends true
      ? any
      : [R] extends [number]
        ? number
        : [R] extends [readonly any[]]
          ? I[]
          : [R] extends [Page<any>]
            ? Page<I>
            : undefined extends R
              ? I | undefined
              : I;

  /**
   * The query builder type of the static `query()` method of model class `MC`.
   * This is based on the static `QueryBuilder` property, which decides the
   * query builder class at runtime.
   */
  type ModelClassQueryBuilder<MC, M extends Model> = MC extends {
    QueryBuilder: { prototype: infer QB };
  }
    ? keyof QueryBuilderType<M> extends keyof QB
      ? // The static `QueryBuilder` creates query builders of the declared
        // `QueryBuilderType` (only the keys are compared, which is much faster).
        QueryBuilderType<M>
      : // `QueryBuilderType` was declared, but the static `QueryBuilder` creates
        // some other query builders. Trust the class that is used at runtime.
        InitialQueryBuilder<QB, M>
    : QueryBuilderType<M>;

  type InitialQueryBuilder<QB, M extends Model> = QB extends { '~rebind': any }
    ? (QB['~rebind'] & { '~args': [M, M[], { item: M }] })['~rebind']
    : QB;

  interface ForClassMethod {
    <M extends Model>(modelClass: ModelConstructor<M>): QueryBuilderType<M>;
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
    (expr: RelationExpression<ModelType<QB>>, opt?: JoinRelatedOptions): QB;
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

  interface AllowGraphMethod<QB extends AnyQueryBuilder> {
    (expr: RelationExpression<ModelType<QB>>): QB;
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
      { item: ResultItemOf<RunAfterResult<T>, ModelType<QB>> }
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

  interface InsertGraphMethod<M extends Model> {
    <QB extends AnyQueryBuilder>(
      this: QB,
      graph: PartialModelGraph<M>,
      options?: InsertGraphOptions,
    ): SingleQueryBuilder<QB>;

    <QB extends AnyQueryBuilder>(
      this: QB,
      graph: PartialModelGraph<M>[],
      options?: InsertGraphOptions,
    ): ArrayQueryBuilder<QB>;
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
    ): ArrayQueryBuilder<QB>;

    <QB extends AnyQueryBuilder>(
      this: QB,
      graph: PartialModelGraph<M>,
      options?: UpsertGraphOptions,
    ): SingleQueryBuilder<QB>;
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

  interface ModifyGraphMethod<QB extends AnyQueryBuilder> {
    <M extends Model>(
      expr: RelationExpression<ModelType<QB>>,
      modifier: Modifier<QueryBuilderType<M>>,
    ): QB;
  }

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

  interface ModifyMethod<QB extends AnyQueryBuilder> {
    (modifier: (qb: QB) => unknown): QB;
    <F extends (qb: any, ...args: any[]) => unknown>(
      modifier: F & CheckModifierModel<QB, F>,
      ...args: ModifierArgs<F>
    ): QB;
    (
      modifier: Exclude<Modifier<QB>, ModifierFunction<any>> | Modifier<QB>[],
      ...args: unknown[]
    ): QB;
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
    castTo<MC extends Model>(
      modelClass: ModelConstructor<MC>,
    ): RebindQueryBuilder<this, MC, ReplaceResultItem<R, MC>, { item: MC }>;
    castTo<T>(): RebindQueryBuilder<this, M, T, { item: ResultItemOf<T, M> }>;

    // For generic code (like custom query builder methods) where the model type
    // isn't known: `this.update<{ deletedAt: Date }>({ deletedAt: new Date() })`.
    // These overloads come first so that the errors of the other overloads are
    // the ones that are reported.
    update<T extends object = never>(update: NoInfer<T>): this['~count'];
    update(update: PartialModelObject<M>): this['~count'];
    update(): this['~count'];
    updateAndFetch(update: PartialModelObject<M>): this['~one'];
    updateAndFetchById(id: MaybeCompositeId, update: PartialModelObject<M>): this['~one'];

    // For generic code (like custom query builder methods) where the model type
    // isn't known: `this.patch<{ deletedAt: Date }>({ deletedAt: new Date() })`.
    patch<T extends object = never>(update: NoInfer<T>): this['~count'];
    patch(update: PartialModelObject<M>): this['~count'];
    patch(): this['~count'];
    patchAndFetch(update: PartialModelObject<M>): this['~one'];
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
    merge(merge?: PartialModelObject<M> | string[]): this;

    insertAndFetch(insert: PartialModelObject<M>): this['~one'];
    insertAndFetch(insert: PartialModelObject<M>[]): this['~many'];
    insertAndFetch(): this['~one'];

    relate(
      ids: MaybeCompositeId | MaybeCompositeId[] | PartialModelObject<M> | PartialModelObject<M>[],
    ): this['~count'];

    unrelate(): this['~count'];
    for(ids: ForIdValue | ForIdValue[]): this;

    withGraphFetched(expr: RelationExpression<M>, options?: GraphOptions): this;
    withGraphJoined(expr: RelationExpression<M>, options?: GraphOptions): this;

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
    ): ArrayRelatedQueryBuilder<M[K]>;

    // For relation names that can't be checked. The model type of the
    // relation must be given explicitly: `relatedQuery<Pet>(relationName)`.
    relatedQuery<RM extends Model = never>(
      relationName: [RM] extends [never] ? UnknownRelationName : string,
      trxOrKnex?: TransactionOrKnex,
    ): QueryBuilderType<RM>;

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

    fetchGraph(
      modelOrObject: PartialModelObject<M>,
      expression: RelationExpression<M>,
      options?: FetchGraphOptions,
    ): SingleQueryBuilder<QueryBuilderType<M>>;

    fetchGraph(
      modelOrObject: PartialModelObject<M>[],
      expression: RelationExpression<M>,
      options?: FetchGraphOptions,
    ): QueryBuilderType<M>;

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
    static ref: ReferenceFunction;
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
    ): ArrayRelatedQueryBuilder<M[K]>;

    // For relation names that can't be checked. The model type of the
    // relation must be given explicitly: `relatedQuery<Pet>(relationName)`.
    static relatedQuery<RM extends Model = never>(
      relationName: [RM] extends [never] ? UnknownRelationName : string,
      trxOrKnex?: TransactionOrKnex,
    ): QueryBuilderType<RM>;

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

    static fetchGraph<M extends Model>(
      this: Constructor<M>,
      modelOrObject: PartialModelObject<M>,
      expression: RelationExpression<M>,
      options?: FetchGraphOptions,
    ): SingleQueryBuilder<QueryBuilderType<M>>;

    static fetchGraph<M extends Model>(
      this: Constructor<M>,
      modelOrObject: PartialModelObject<M>[],
      expression: RelationExpression<M>,
      options?: FetchGraphOptions,
    ): QueryBuilderType<M>;

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
    ): RelatedQueryBuilder<this[K]>;

    // For relation names that can't be checked. The model type of the
    // relation must be given explicitly: `$relatedQuery<Pet>(relationName)`.
    $relatedQuery<RM extends Model = never>(
      relationName: [RM] extends [never] ? UnknownRelationName : string,
      trxOrKnex?: TransactionOrKnex,
    ): QueryBuilderType<RM>;

    $query(trxOrKnex?: TransactionOrKnex): SingleQueryBuilder<QueryBuilderType<this>>;

    $id(id: any): void;
    $id(): any;

    $fetchGraph(
      expression: RelationExpression<this>,
      options?: FetchGraphOptions,
    ): SingleQueryBuilder<QueryBuilderType<this>>;

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
