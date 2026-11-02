// Internal types for the query builder operations.
//
// The query builder and the model classes are still JavaScript, so these
// interfaces only describe the parts of them that the operations use. The
// relations are TypeScript, and their types are used here. The public types
// are the hand-written ones in `typings/`.

import type { Knex } from 'knex';
import type { QueryBuilderOperation } from './QueryBuilderOperation';
import type { Relation, RelationModel, RelationModelClass } from '../../relations/Relation';

export type { Relation };

// A knex query builder or join clause. The operations call knex methods on it
// by name (`knexBuilder[this.name]`) and pass it through user callbacks, so it
// is untyped by design.
export type KnexBuilder = any;

export type KnexInstance = Knex;

export type RawBinding = Knex.RawBinding;

// An operation class, for `is()`, `has()` etc.
// `any[]`: an operation class takes any constructor arguments.
export type OperationClass = abstract new (...args: any[]) => QueryBuilderOperation;

// The options the operations read from `opt`. Each operation uses only some of
// them. The relation operations pass `RelationOperationOptions`.
export interface OperationOptions {
  delegate?: QueryBuilderOperation;
  instance?: Model;
  relation?: Relation;
  owner?: unknown;
  id?: unknown;
  modelOptions?: ModelOptions;
  upsertOptions?: Record<string, unknown>;
  opt?: Record<string, unknown>;
  defaultGraphOptions?: GraphOptions;
  joinOperation?: string;
  prefix?: string | null;
  not?: boolean;
  rawMethod?: string;
  operator?: string;
  bool?: string;
  compareValue?: unknown;
}

export interface ModelOptions {
  patch?: boolean;
  old?: Model;
  [key: string]: unknown;
}

export interface GraphOptions {
  maxBatchSize?: number;
  skipFetched?: boolean;
  [key: string]: unknown;
}

export interface FindOptions {
  dontCallFindHooks?: boolean;
  callAfterFindDeeply?: boolean;
}

export interface InternalOptions {
  skipUndefined: boolean;
  keepImplicitJoinProps: boolean;
}

// A modifier function or the name of a named modifier.
export type Modifiers = Record<string, unknown>;

// A model instance. `RelationModel` has its properties (the columns and
// relations of a row) and the methods the relations use.
export interface Model extends RelationModel {
  constructor: ModelClass;
  $set(obj: unknown): this;
  $setDatabaseJson(json: unknown): this;
  $toDatabaseJson(builder?: QueryBuilder): Record<string, unknown>;
  $beforeInsert(context: unknown): unknown;
  $afterInsert(context: unknown): unknown;
  $beforeUpdate(modelOptions: ModelOptions, context: unknown): unknown;
  $afterUpdate(modelOptions: ModelOptions, context: unknown): unknown;
  $beforeDelete(context: unknown): unknown;
  $afterDelete(context: unknown): unknown;
  $afterFind(context: unknown): unknown;
  $isObjectionModel: boolean;
  $objectionModelClass: ModelClass;
}

// A model class. `RelationModelClass` has the static members the relations
// use. `Relation` types its model classes as `RelationModelClass`.
export interface ModelClass extends RelationModelClass {
  prototype: Model;
  useLimitInFirst: boolean;
  query(): QueryBuilder;
  getIdColumnArray(): string[];
  getIdPropertyArray(): string[];
  getRelation(name: string): Relation;
  ensureModel(json: unknown, modelOptions: ModelOptions): Model | null;
  ensureModelArray(json: unknown, modelOptions: ModelOptions): Model[];
  createValidationError(props: { type: string; message: string }): Error;
  beforeFind(args: unknown): unknown;
  afterFind(args: unknown): unknown;
  beforeInsert(args: unknown): unknown;
  afterInsert(args: unknown): unknown;
  beforeUpdate(args: unknown): unknown;
  afterUpdate(args: unknown): unknown;
  beforeDelete(args: unknown): unknown;
  afterDelete(args: unknown): unknown;
}

export interface QueryBuilderClass {
  forClass(modelClass: ModelClass): QueryBuilder;
}

// An objection query builder (or join builder). Awaiting one executes it, and
// the result depends on the query, hence `PromiseLike<any>`.
export interface QueryBuilder extends PromiseLike<any> {
  constructor: QueryBuilderClass;
  modelClass(): ModelClass;
  resultModelClass(): ModelClass;
  knex(): KnexInstance;
  unsafeKnex(): KnexInstance | null;
  context(): unknown;
  internalOptions(): InternalOptions;
  findOptions(): FindOptions;
  findOptions(opt: FindOptions): this;
  modifiers(): Modifiers;
  modifiers(modifiers: Modifiers): this;
  isFind(): boolean;
  has(selector: string | RegExp | OperationClass): boolean;
  hasSelectionAs(selection: string, alias: string): boolean;
  tableRef(): string;
  tableRefFor(modelClass: RelationModelClass): string;
  tableName(tableName: string): this;
  aliasFor(tableName: string, alias: string): this;
  fullIdColumn(): string | string[];
  isPartial(isPartial: boolean): this;
  subqueryOf(builder: QueryBuilder): this;
  childQueryOf(builder: QueryBuilder): this;
  toKnexQuery(knexBuilder?: KnexBuilder): KnexBuilder;
  clone(): this;
  emptyInstance(): this;
  resolve(value: unknown): this;
  addOperation(operation: QueryBuilderOperation, args: unknown[]): this;
  castTo(modelClass: ModelClass): this;
  modify(modifier: (builder: this) => void): this;
  resultSize(): Promise<number>;
  limit(limit: number): this;
  offset(offset: number): this;
  select(...selections: unknown[]): this;
  where(...args: unknown[]): this;
  findById(id: unknown): this;
  findByIds(ids: unknown): this;
  whereComposite(columns: unknown, values: unknown): this;
  whereInComposite(columns: unknown, values: unknown): this;
  withGraphFetched(expression: unknown, options?: GraphOptions): this;
}
