// Internal types for the query builder operations.
//
// The model classes are still JavaScript, so these interfaces only describe
// the parts of them that the operations use. The query builder and the
// relations are TypeScript, and their types are used here. The public types
// are the hand-written ones in `typings/`.

import type { Knex } from 'knex';
import type { QueryBuilderOperation } from './QueryBuilderOperation';
import type { Relation } from '../../relations/Relation';
import type { Model as RealModel } from '../../model/Model';
import type { QueryBuilder } from '../QueryBuilder';

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
  defaultGraphOptions?: GraphOptions | null;
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

// A model instance and a model class.
export type Model = RealModel;
export type ModelClass = typeof RealModel;

export interface QueryBuilderClass {
  forClass(modelClass: ModelClass): QueryBuilder;
}

// The objection query builder. Operations added by a `JoinBuilder` get the join
// builder instead, but only through the builder's dynamic hook calls.
export type { QueryBuilder };
