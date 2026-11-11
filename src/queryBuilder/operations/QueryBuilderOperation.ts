import type { KnexBuilder, OperationClass, OperationOptions, QueryBuilder } from './types';

export type HookName =
  | 'onAdd'
  | 'onBefore1'
  | 'onBefore2'
  | 'onBefore3'
  | 'onBuild'
  | 'onBuildKnex'
  | 'onRawResult'
  | 'queryExecutor'
  | 'onAfter1'
  | 'onAfter2'
  | 'onAfter3'
  | 'onError';

const hookNameToHasMethodName = {
  onAdd: 'hasOnAdd',
  onBefore1: 'hasOnBefore1',
  onBefore2: 'hasOnBefore2',
  onBefore3: 'hasOnBefore3',
  onBuild: 'hasOnBuild',
  onBuildKnex: 'hasOnBuildKnex',
  onRawResult: 'hasOnRawResult',
  queryExecutor: 'hasQueryExecutor',
  onAfter1: 'hasOnAfter1',
  onAfter2: 'hasOnAfter2',
  onAfter3: 'hasOnAfter3',
  onError: 'hasOnError',
} as const;

// An abstract base class for all query builder operations. QueryBuilderOperations almost always
// correspond to a single query builder method call. For example SelectOperation could be added when
// a `select` method is called.
//
// A bit for each hook that a query runs in phases, see `hookMask()`.
const HookBits = {
  onBefore1: 1,
  onBefore2: 2,
  onBefore3: 4,
  onBuild: 8,
  onBuildKnex: 16,
  onRawResult: 32,
  queryExecutor: 64,
  onAfter1: 128,
  onAfter2: 256,
  onAfter3: 512,
  onError: 1024,
} as const;

export type PhaseHookName = keyof typeof HookBits;

// QueryBuilderOperation is just a bunch of query execution lifecycle hooks that subclasses
// can (but don't have to) implement.
//
// Basically a query builder is nothing but an array of QueryBuilderOperations. When the query is
// executed the hooks are called in the order explained below. The hooks are called so that a
// certain hook is called for _all_ operations before the next hook is called. For example if
// a builder has 5 operations, onBefore1 hook is called for each of them (and their results are awaited)
// before onBefore2 hook is called for any of the operations.
class QueryBuilderOperation {
  declare name: string | null;
  declare opt: OperationOptions;
  declare adderHookName: string | null;
  declare parentOperation: QueryBuilderOperation | null;
  declare childOperations: QueryBuilderOperation[];
  declare whereScope: unknown;
  declare _hookMask: number;
  declare _kindMask: number;

  constructor(name: string | null = null, opt: OperationOptions = {}) {
    this.name = name;
    this.opt = opt;

    // The hooks this operation has, see `hookMask()`.
    this._hookMask = -1;

    // The kinds of operation this is, cached by the query builder. A clone
    // has the same class, so it keeps them.
    this._kindMask = -1;

    // From which hook was this operation added as a child
    // operation.
    this.adderHookName = null;

    // The parent operation that added this operation.
    this.parentOperation = null;

    // Operations this operation added in any of its hooks.
    this.childOperations = [];

    // The where scope (see `whereScopes.ts`) this operation was added in.
    this.whereScope = null;
  }

  is(OperationClass: OperationClass): boolean {
    return this instanceof OperationClass;
  }

  hasHook(hookName: HookName): boolean {
    return this[hookNameToHasMethodName[hookName]]();
  }

  // The `HookBits` of the hooks this operation has. Worked out on the first
  // call: an operation's hooks are set when it is created or cloned, before it
  // takes part in a query.
  hookMask(): number {
    let mask = this._hookMask;

    if (mask === -1) {
      mask = computeHookMask(this);
      this._hookMask = mask;
    }

    return mask;
  }

  // This is called immediately when a query builder method is called.
  //
  // This method must be synchronous.
  // This method should never call any methods that add operations to the builder.
  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    return true;
  }
  hasOnAdd(): boolean {
    return true;
  }

  // The hooks below that do nothing return `void`. That allows the overrides to
  // return anything.

  // This is called as the first thing when the query is executed but before
  // the actual database operation (knex query) is executed.
  //
  // This method can be asynchronous.
  // You may call methods that add operations to to the builder.
  onBefore1(builder: QueryBuilder, result: unknown): void {}
  hasOnBefore1(): boolean {
    return this.onBefore1 !== QueryBuilderOperation.prototype.onBefore1;
  }

  // This is called as the second thing when the query is executed but before
  // the actual database operation (knex query) is executed.
  //
  // This method can be asynchronous.
  // You may call methods that add operations to to the builder.
  onBefore2(builder: QueryBuilder, result: unknown): void {}
  hasOnBefore2(): boolean {
    return this.onBefore2 !== QueryBuilderOperation.prototype.onBefore2;
  }

  // This is called as the third thing when the query is executed but before
  // the actual database operation (knex query) is executed.
  //
  // This method can be asynchronous.
  // You may call methods that add operations to to the builder.
  onBefore3(builder: QueryBuilder, result: unknown): void {}
  hasOnBefore3(): boolean {
    return this.onBefore3 !== QueryBuilderOperation.prototype.onBefore3;
  }

  // This is called as the last thing when the query is executed but before
  // the actual database operation (knex query) is executed. If your operation
  // needs to call other query building operations (methods that add QueryBuilderOperations)
  // this is the best and last place to do it.
  //
  // This method must be synchronous.
  // You may call methods that add operations to to the builder.
  onBuild(builder: QueryBuilder): void {}
  hasOnBuild(): boolean {
    return this.onBuild !== QueryBuilderOperation.prototype.onBuild;
  }

  // This is called when the knex query is built. Here you should only call knex
  // methods. You may call getters and other immutable methods of the `builder`
  // but you should never call methods that add QueryBuilderOperations.
  //
  // This method must be synchronous.
  // This method should never call any methods that add operations to the builder.
  // This method should always return the knex query builder.
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    return knexBuilder;
  }
  hasOnBuildKnex(): boolean {
    return this.onBuildKnex !== QueryBuilderOperation.prototype.onBuildKnex;
  }

  // The raw knex result is passed to this method right after the database query
  // has finished. This method may modify it and return the modified rows. The
  // rows are automatically converted to models (if possible) after this hook
  // is called.
  //
  // This method can be asynchronous.
  onRawResult(builder: QueryBuilder, rows: unknown): unknown {
    return rows;
  }
  hasOnRawResult(): boolean {
    return this.onRawResult !== QueryBuilderOperation.prototype.onRawResult;
  }

  // This is called as the first thing after the query has been executed and
  // rows have been converted to model instances.
  //
  // This method can be asynchronous.
  onAfter1(builder: QueryBuilder, result: unknown): unknown {
    return result;
  }
  hasOnAfter1(): boolean {
    return this.onAfter1 !== QueryBuilderOperation.prototype.onAfter1;
  }

  // This is called as the second thing after the query has been executed and
  // rows have been converted to model instances.
  //
  // This method can be asynchronous.
  onAfter2(builder: QueryBuilder, result: unknown): unknown {
    return result;
  }
  hasOnAfter2(): boolean {
    return this.onAfter2 !== QueryBuilderOperation.prototype.onAfter2;
  }

  // This is called as the third thing after the query has been executed and
  // rows have been converted to model instances.
  //
  // This method can be asynchronous.
  onAfter3(builder: QueryBuilder, result: unknown): unknown {
    return result;
  }
  hasOnAfter3(): boolean {
    return this.onAfter3 !== QueryBuilderOperation.prototype.onAfter3;
  }

  // This method can be implemented to return another operation that will replace
  // this one. This method is called after all `onBeforeX` and `onBuildX` hooks
  // but before the database query is executed.
  //
  // This method must return a QueryBuilder instance.
  queryExecutor(builder: QueryBuilder): void {}
  hasQueryExecutor(): boolean {
    return this.queryExecutor !== QueryBuilderOperation.prototype.queryExecutor;
  }

  // This is called if an error occurs in the query execution.
  //
  // This method must return a QueryBuilder instance.
  onError(builder: QueryBuilder, error: unknown): void {}
  hasOnError(): boolean {
    return this.onError !== QueryBuilderOperation.prototype.onError;
  }

  // Returns the "find" equivalent of this operation.
  //
  // For example an operation that finds an item and updates it
  // should return an operation that simply finds the item but
  // doesn't update anything. An insert operation should return
  // null since there is no find equivalent for it etc.
  toFindOperation(builder: QueryBuilder): QueryBuilderOperation | null {
    return this;
  }
  hasToFindOperation(): boolean {
    return this.toFindOperation !== QueryBuilderOperation.prototype.toFindOperation;
  }

  // Given a set of operations, returns true if any of this operation's
  // ancestor operations are included in the set.
  isAncestorInSet(operationSet: Set<QueryBuilderOperation>): boolean {
    let ancestor = this.parentOperation;

    while (ancestor) {
      if (operationSet.has(ancestor)) {
        return true;
      }

      ancestor = ancestor.parentOperation;
    }

    return false;
  }

  // Takes a deep clone of this operation.
  clone(): this {
    const clone = new (
      this.constructor as new (
        name: string | null,
        opt: OperationOptions,
      ) => this
    )(this.name, this.opt);

    clone._kindMask = this._kindMask;
    clone.adderHookName = this.adderHookName;
    clone.parentOperation = this.parentOperation;
    clone.whereScope = this.whereScope;

    // The constructor gave the clone an empty array.
    if (this.childOperations.length !== 0) {
      clone.childOperations = this.childOperations.map((childOp) => {
        const childOpClone = childOp.clone();

        childOpClone.parentOperation = clone;
        return childOpClone;
      });
    }

    return clone;
  }

  // Add an operation as a child operation. `hookName` must be the
  // name of the parent operation's hook that called this method.
  addChildOperation(hookName: string, operation: QueryBuilderOperation): void {
    operation.adderHookName = hookName;
    operation.parentOperation = this;

    this.childOperations.push(operation);
  }

  // Removes a single child operation.
  removeChildOperation(operation: QueryBuilderOperation): void {
    const index = this.childOperations.indexOf(operation);

    if (index !== -1) {
      operation.parentOperation = null;
      this.childOperations.splice(index, 1);
    }
  }

  // Replaces a single child operation.
  replaceChildOperation(
    operation: QueryBuilderOperation,
    newOperation: QueryBuilderOperation,
  ): void {
    const index = this.childOperations.indexOf(operation);

    if (index !== -1) {
      newOperation.adderHookName = operation.adderHookName;
      newOperation.parentOperation = this;
      operation.parentOperation = null;
      this.childOperations[index] = newOperation;
    }
  }

  // Removes all child operations that were added from the `hookName` hook.
  removeChildOperationsByHookName(hookName: string): void {
    // Called before every hook. Most operations have no children.
    if (this.childOperations.length !== 0) {
      this.childOperations = this.childOperations.filter((op) => op.adderHookName !== hookName);
    }
  }

  // Iterates through all descendant operations recursively.
  forEachDescendantOperation(callback: (operation: QueryBuilderOperation) => unknown): boolean {
    for (const operation of this.childOperations) {
      if (callback(operation) === false) {
        return false;
      }

      if (operation.forEachDescendantOperation(callback) === false) {
        return false;
      }
    }

    return true;
  }
}

Object.defineProperties(QueryBuilderOperation, {
  isObjectionQueryBuilderOperationClass: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

const PHASE_HOOK_NAMES = Object.keys(HookBits) as PhaseHookName[];
const BASE = QueryBuilderOperation.prototype;

// The hooks are compared with the base class directly, unless the operation's
// class decides itself whether it has a hook, like `DelegateOperation`.
function computeHookMask(op: QueryBuilderOperation): number {
  if (
    op.hasOnBefore1 !== BASE.hasOnBefore1 ||
    op.hasOnBefore2 !== BASE.hasOnBefore2 ||
    op.hasOnBefore3 !== BASE.hasOnBefore3 ||
    op.hasOnBuild !== BASE.hasOnBuild ||
    op.hasOnBuildKnex !== BASE.hasOnBuildKnex ||
    op.hasOnRawResult !== BASE.hasOnRawResult ||
    op.hasQueryExecutor !== BASE.hasQueryExecutor ||
    op.hasOnAfter1 !== BASE.hasOnAfter1 ||
    op.hasOnAfter2 !== BASE.hasOnAfter2 ||
    op.hasOnAfter3 !== BASE.hasOnAfter3 ||
    op.hasOnError !== BASE.hasOnError ||
    op.hasHook !== BASE.hasHook
  ) {
    let mask = 0;

    for (const hookName of PHASE_HOOK_NAMES) {
      if (op.hasHook(hookName)) {
        mask |= HookBits[hookName];
      }
    }

    return mask;
  }

  return (
    (op.onBefore1 !== BASE.onBefore1 ? HookBits.onBefore1 : 0) |
    (op.onBefore2 !== BASE.onBefore2 ? HookBits.onBefore2 : 0) |
    (op.onBefore3 !== BASE.onBefore3 ? HookBits.onBefore3 : 0) |
    (op.onBuild !== BASE.onBuild ? HookBits.onBuild : 0) |
    (op.onBuildKnex !== BASE.onBuildKnex ? HookBits.onBuildKnex : 0) |
    (op.onRawResult !== BASE.onRawResult ? HookBits.onRawResult : 0) |
    (op.queryExecutor !== BASE.queryExecutor ? HookBits.queryExecutor : 0) |
    (op.onAfter1 !== BASE.onAfter1 ? HookBits.onAfter1 : 0) |
    (op.onAfter2 !== BASE.onAfter2 ? HookBits.onAfter2 : 0) |
    (op.onAfter3 !== BASE.onAfter3 ? HookBits.onAfter3 : 0) |
    (op.onError !== BASE.onError ? HookBits.onError : 0)
  );
}

export { HookBits };
export { QueryBuilderOperation };
