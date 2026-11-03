import { isString, isFunction, isRegExp, mergeMaps, last } from '../utils/objectUtils';
import { QueryBuilderContextBase } from './QueryBuilderContextBase';
import { QueryBuilderUserContext } from './QueryBuilderUserContext';
import { deprecate } from '../utils/deprecate';
import { isPromise } from '../utils/promiseUtils/isPromise';
import { effectiveWhereScope, createWhereGrouping } from './whereScopes';
import type { WhereScope } from './whereScopes';
import type { QueryBuilderOperation, HookName } from './operations/QueryBuilderOperation';
import type { QueryBuilder } from './QueryBuilder';
import type {
  KnexBuilder,
  KnexInstance,
  ModelClass as OperationModelClass,
  OperationClass,
} from './operations/types';

// A knex query builder (or join clause). Operations call whatever knex method
// they are named after, so knex builders are used dynamically.
type KnexLike = KnexBuilder;

// A model class. The model classes are user-defined subclasses of `Model`,
// with static members of their own, which are dynamic.
interface ModelClass extends OperationModelClass {
  [key: string]: any;
}

// A query builder operation.
type Operation = QueryBuilderOperation;

// A model class or a table name. Only the table name of a model class is used.
type TableSource = { getTableName(): string } | string;

// An operation hook, called with the arguments the builder passes.
type HookMethod = (...args: unknown[]) => unknown;

// `true` (every operation), a regex or a string that is matched against the
// operation name, an operation class, or a predicate.
type OperationSelector = true | RegExp | string | OperationClass | ((op: Operation) => unknown);

// Returning false stops the walk.
type OperationCallback = (op: Operation) => boolean | void;

interface ActiveOperation {
  operation: Operation;
  hookName: HookName;
}

const AllSelector = () => true;
const SelectSelector =
  /^(select|columns|column|distinct|count|countDistinct|min|max|sum|sumDistinct|avg|avgDistinct)$/;
const WhereSelector = /^(where|orWhere|andWhere|find\w+)/;
const OnSelector = /^(on|orOn|andOn)/;
const OrderBySelector = /orderBy/;
const JoinSelector = /(join|joinRaw|joinRelated)$/i;
const FromSelector = /^(from|fromRaw|into|table)$/;

class QueryBuilderOperationSupport {
  declare _modelClass: ModelClass;
  declare _operations: Operation[];
  declare _context: QueryBuilderContextBase;
  declare _parentQuery: QueryBuilderOperationSupport | null;
  declare _isPartialQuery: boolean;
  declare _activeOperations: ActiveOperation[];
  declare _whereScope: WhereScope | null;

  constructor(...args: [modelClass: ModelClass]) {
    (this.constructor as typeof QueryBuilderOperationSupport).init(this, ...args);
  }

  static init(self: QueryBuilderOperationSupport, modelClass: ModelClass): void {
    self._modelClass = modelClass;
    self._operations = [];
    self._context = new this.QueryBuilderContext(self);
    self._parentQuery = null;
    self._isPartialQuery = false;
    self._activeOperations = [];
    self._whereScope = null;
  }

  static forClass<T>(this: new (modelClass: ModelClass) => T, modelClass: ModelClass): T {
    return new this(modelClass);
  }

  static get AllSelector(): () => boolean {
    return AllSelector;
  }

  static get QueryBuilderContext(): typeof QueryBuilderContextBase {
    return QueryBuilderContextBase;
  }

  static get QueryBuilderUserContext(): typeof QueryBuilderUserContext {
    return QueryBuilderUserContext;
  }

  static get SelectSelector(): RegExp {
    return SelectSelector;
  }

  static get WhereSelector(): RegExp {
    return WhereSelector;
  }

  static get OnSelector(): RegExp {
    return OnSelector;
  }

  static get JoinSelector(): RegExp {
    return JoinSelector;
  }

  static get FromSelector(): RegExp {
    return FromSelector;
  }

  static get OrderBySelector(): RegExp {
    return OrderBySelector;
  }

  modelClass(): ModelClass {
    return this._modelClass;
  }

  context(): QueryBuilderUserContext;
  context(obj: object): this;
  context(obj?: object): QueryBuilderUserContext | this {
    const ctx = this._context;

    if (arguments.length === 0) {
      return ctx.userContext;
    } else {
      ctx.userContext = ctx.userContext.newMerge(this, obj!);
      return this;
    }
  }

  clearContext(): this {
    const ctx = this._context;
    ctx.userContext = new (
      this.constructor as typeof QueryBuilderOperationSupport
    ).QueryBuilderUserContext(this);
    return this;
  }

  internalContext(): this['_context'];
  internalContext(ctx: QueryBuilderContextBase): this;
  internalContext(ctx?: QueryBuilderContextBase): QueryBuilderContextBase | this {
    if (arguments.length === 0) {
      return this._context;
    } else {
      this._context = ctx!;
      return this;
    }
  }

  internalOptions(): this['_context']['options'];
  internalOptions(opt: Partial<QueryBuilderContextBase['options']>): this;
  internalOptions(
    opt?: Partial<QueryBuilderContextBase['options']>,
  ): QueryBuilderContextBase['options'] | this {
    if (arguments.length === 0) {
      return this._context.options;
    } else {
      const oldOpt = this._context.options;
      this._context.options = Object.assign(oldOpt, opt);
      return this;
    }
  }

  isPartial(): boolean;
  isPartial(isPartial: boolean): this;
  isPartial(isPartial?: boolean): boolean | this {
    if (arguments.length === 0) {
      return this._isPartialQuery;
    } else {
      this._isPartialQuery = isPartial!;
      return this;
    }
  }

  isInternal(): boolean {
    return this.internalOptions().isInternalQuery;
  }

  tableNameFor(modelClassOrTableName: TableSource): string;
  tableNameFor(modelClassOrTableName: TableSource, newTableName: string): this;
  tableNameFor(modelClassOrTableName: TableSource, newTableName?: string): string | this;
  tableNameFor(modelClassOrTableName: TableSource, newTableName?: string): string | this {
    const tableName = getTableName(modelClassOrTableName);
    const ctx = this.internalContext();
    const tableMap = ctx.tableMap;

    if (isString(newTableName)) {
      ctx.tableMap = tableMap || new Map();
      ctx.tableMap.set(tableName, newTableName!);
      return this;
    } else {
      return (tableMap && tableMap.get(tableName)) || tableName;
    }
  }

  aliasFor(modelClassOrTableName: TableSource): string | null;
  aliasFor(modelClassOrTableName: TableSource, alias: string): this;
  aliasFor(modelClassOrTableName: TableSource, alias?: string): string | null | this;
  aliasFor(modelClassOrTableName: TableSource, alias?: string): string | null | this {
    const tableName = getTableName(modelClassOrTableName);
    const ctx = this.internalContext();
    const aliasMap = ctx.aliasMap;

    if (isString(alias)) {
      ctx.aliasMap = aliasMap || new Map();
      ctx.aliasMap.set(tableName, alias!);
      return this;
    } else {
      return (aliasMap && aliasMap.get(tableName)) || null;
    }
  }

  tableRefFor(modelClassOrTableName: TableSource): string {
    return this.aliasFor(modelClassOrTableName) || this.tableNameFor(modelClassOrTableName);
  }

  childQueryOf(
    query: QueryBuilderOperationSupport | null | undefined,
    { fork, isInternalQuery }: { fork?: boolean; isInternalQuery?: boolean } = {},
  ): this {
    if (query) {
      const currentCtx = this.context();
      let ctx = query.internalContext();

      if (fork) {
        ctx = ctx.clone();
      }

      if (isInternalQuery) {
        ctx.options.isInternalQuery = true;
      }

      this._parentQuery = query;
      this.internalContext(ctx);
      this.context(currentCtx);

      // Use the parent's knex if there was no knex in `ctx`.
      if (this.unsafeKnex() === null) {
        this.knex(query.unsafeKnex());
      }
    }

    return this;
  }

  subqueryOf(query: QueryBuilderOperationSupport | null | undefined): this {
    if (query) {
      if (this._isPartialQuery) {
        // Merge alias and table name maps for "partial" subqueries.
        const ctx = this.internalContext();

        ctx.aliasMap = mergeMaps(query.internalContext().aliasMap, ctx.aliasMap);
        ctx.tableMap = mergeMaps(query.internalContext().tableMap, ctx.tableMap);
      }

      this._parentQuery = query;

      if (this.unsafeKnex() === null) {
        this.knex(query.unsafeKnex());
      }
    }

    return this;
  }

  parentQuery(): QueryBuilderOperationSupport | null {
    return this._parentQuery;
  }

  knex(): KnexInstance;
  knex(knex: KnexInstance | null | undefined): this;
  knex(...args: [knex?: KnexInstance | null]): KnexInstance | this {
    if (args.length === 0) {
      const knex = this.unsafeKnex();

      if (!knex) {
        throw new Error(
          `no database connection available for a query. You need to bind the model class or the query to a knex instance.`,
        );
      }

      return knex;
    } else {
      this._context.knex = args[0];
      return this;
    }
  }

  unsafeKnex(): KnexInstance | null {
    return this._context.knex || this._modelClass.knex() || null;
  }

  clear(operationSelector: OperationSelector): this {
    const operationsToRemove = new Set<Operation>();

    this.forEachOperation(operationSelector, (op) => {
      // If an ancestor operation has already been removed,
      // there's no need to remove the children anymore.
      if (!op.isAncestorInSet(operationsToRemove)) {
        operationsToRemove.add(op);
      }
    });

    for (const op of operationsToRemove) {
      this.removeOperation(op);
    }

    return this;
  }

  toFindQuery(): this {
    const findQuery = this.clone();
    const operationsToReplace: Array<{ op: Operation; findOp: Operation }> = [];
    const operationsToRemove: Operation[] = [];

    findQuery.forEachOperation(
      (op) => op.hasToFindOperation(),
      (op) => {
        // Only `QueryBuilder`s are turned into find queries.
        const findOp = op.toFindOperation(findQuery as unknown as QueryBuilder);

        if (!findOp) {
          operationsToRemove.push(op);
        } else {
          operationsToReplace.push({ op, findOp });
        }
      },
    );

    for (const op of operationsToRemove) {
      findQuery.removeOperation(op);
    }

    for (const { op, findOp } of operationsToReplace) {
      findQuery.replaceOperation(op, findOp);
    }

    return findQuery;
  }

  clearSelect(): this {
    return this.clear(SelectSelector);
  }

  clearWhere(): this {
    return this.clear(WhereSelector);
  }

  clearOrder(): this {
    return this.clear(OrderBySelector);
  }

  copyFrom(queryBuilder: QueryBuilderOperationSupport, operationSelector: OperationSelector): this {
    const operationsToAdd = new Set<Operation>();

    queryBuilder.forEachOperation(operationSelector, (op) => {
      // If an ancestor operation has already been added,
      // there is no need to add
      if (!op.isAncestorInSet(operationsToAdd)) {
        operationsToAdd.add(op);
      }
    });

    for (const op of operationsToAdd) {
      const opClone = op.clone();

      // The scope may come from a parent operation that is not copied.
      opClone.whereScope = effectiveWhereScope(op);

      // We may be moving nested operations to the root. Clear
      // any links to the parent operations.
      opClone.parentOperation = null;
      opClone.adderHookName = null;

      // We don't use `addOperation` here because we don't what to
      // call `onAdd` or add these operations as child operations.
      this._operations.push(opClone);
    }

    return this;
  }

  has(operationSelector: OperationSelector): boolean {
    return !!this.findOperation(operationSelector);
  }

  forEachOperation(
    operationSelector: OperationSelector,
    callback: OperationCallback,
    match = true,
  ): this {
    visitOperations(
      this._operations,
      selectorKind(operationSelector),
      operationSelector,
      callback,
      match,
    );

    return this;
  }

  findOperation<T extends Operation>(
    operationSelector: abstract new (...args: any[]) => T,
  ): T | null;
  findOperation(operationSelector: OperationSelector): Operation | null;
  findOperation(operationSelector: OperationSelector): Operation | null {
    let op: Operation | null = null;

    this.forEachOperation(operationSelector, (it) => {
      op = it;
      return false;
    });

    return op;
  }

  findLastOperation<T extends Operation>(
    operationSelector: abstract new (...args: any[]) => T,
  ): T | null;
  findLastOperation(operationSelector: OperationSelector): Operation | null;
  findLastOperation(operationSelector: OperationSelector): Operation | null {
    let op: Operation | null = null;

    this.forEachOperation(operationSelector, (it) => {
      op = it;
    });

    return op;
  }

  everyOperation(operationSelector: OperationSelector): boolean {
    let every = true;

    this.forEachOperation(
      operationSelector,
      () => {
        every = false;
        return false;
      },
      false,
    );

    return every;
  }

  // Returns whatever the hook returns.
  callOperationMethod(operation: Operation, hookName: HookName, args: unknown[]): unknown {
    try {
      operation.removeChildOperationsByHookName(hookName);

      this._activeOperations.push({
        operation,
        hookName,
      });

      return (operation[hookName] as HookMethod)(...args);
    } finally {
      this._activeOperations.pop();
    }
  }

  // Calls a hook that may or may not be async. Returns the hook's value as is
  // when it isn't a promise, so sync hooks cost no promise or microtask. The
  // operation stays active until a returned promise settles, as with
  // `callAsyncOperationMethod()`.
  callMaybeAsyncOperationMethod(
    operation: Operation,
    hookName: HookName,
    args: unknown[],
  ): unknown {
    operation.removeChildOperationsByHookName(hookName);

    const activeOperations = this._activeOperations;
    activeOperations.push({
      operation,
      hookName,
    });

    let result: unknown;

    try {
      result = (operation[hookName] as HookMethod)(...args);
    } catch (err) {
      activeOperations.pop();
      throw err;
    }

    if (isPromise(result)) {
      return Promise.resolve(result).then(
        (value) => {
          activeOperations.pop();
          return value;
        },
        (err: unknown) => {
          activeOperations.pop();
          throw err;
        },
      );
    }

    activeOperations.pop();
    return result;
  }

  // Returns whatever the hook returns.
  async callAsyncOperationMethod(
    operation: Operation,
    hookName: HookName,
    args: unknown[],
  ): Promise<unknown> {
    operation.removeChildOperationsByHookName(hookName);

    this._activeOperations.push({
      operation,
      hookName,
    });

    try {
      return await (operation[hookName] as HookMethod)(...args);
    } finally {
      this._activeOperations.pop();
    }
  }

  addOperation(operation: Operation, args?: unknown[]): this {
    const ret = this.addOperationUsingMethod('push', operation, args);
    return ret;
  }

  addOperationToFront(operation: Operation, args?: unknown[]): this {
    return this.addOperationUsingMethod('unshift', operation, args);
  }

  addOperationUsingMethod(
    arrayMethod: 'push' | 'unshift',
    operation: Operation,
    args?: unknown[],
  ): this {
    const shouldAdd = this.callOperationMethod(operation, 'onAdd', [this, args]);

    if (shouldAdd) {
      if (this._whereScope !== null && operation.whereScope === null) {
        operation.whereScope = this._whereScope;
      }

      if (this._activeOperations.length) {
        const { operation: parentOperation, hookName } = last(this._activeOperations);
        parentOperation.addChildOperation(hookName, operation);
      } else {
        this._operations[arrayMethod](operation);
      }
    }

    return this;
  }

  removeOperation(operation: Operation): this {
    if (operation.parentOperation) {
      operation.parentOperation.removeChildOperation(operation);
    } else {
      const index = this._operations.indexOf(operation);

      if (index !== -1) {
        this._operations.splice(index, 1);
      }
    }

    return this;
  }

  replaceOperation(operation: Operation, newOperation: Operation): this {
    if (operation.parentOperation) {
      operation.parentOperation.replaceChildOperation(operation, newOperation);
    } else {
      const index = this._operations.indexOf(operation);

      if (index !== -1) {
        this._operations[index] = newOperation;
      }
    }

    return this;
  }

  clone(): this {
    return this.baseCloneInto(
      new (this.constructor as new (knex: KnexInstance | null) => this)(this.unsafeKnex()),
    );
  }

  baseCloneInto<T extends QueryBuilderOperationSupport>(builder: T): T {
    builder._modelClass = this._modelClass;
    builder._operations = this._operations.map((it) => it.clone());
    builder._context = this._context.clone();
    builder._parentQuery = this._parentQuery;
    builder._isPartialQuery = this._isPartialQuery;

    // Don't copy the active operation stack. We never continue (nor can we)
    // a query from the exact mid-hook-call state.
    builder._activeOperations = [];

    return builder;
  }

  toKnexQuery(knexBuilder: KnexLike = this.knex().queryBuilder()): KnexLike {
    this.executeOnBuild();
    return this.executeOnBuildKnex(knexBuilder);
  }

  executeOnBuild(): void {
    this.forEachOperation(true, (op) => {
      if (op.hasOnBuild()) {
        this.callOperationMethod(op, 'onBuild', [this]);
      }
    });
  }

  executeOnBuildKnex(knexBuilder: KnexLike): KnexLike {
    const whereGrouping = createWhereGrouping(this);

    this.forEachOperation(true, (op) => {
      if (whereGrouping !== null && whereGrouping.isGrouped(op)) {
        knexBuilder = whereGrouping.build(op, knexBuilder);
      } else if (op.hasOnBuildKnex()) {
        const newKnexBuilder = this.callOperationMethod(op, 'onBuildKnex', [knexBuilder, this]);
        // Default to the input knex builder for backwards compatibility
        // with QueryBuilder.onBuildKnex hooks.
        knexBuilder = newKnexBuilder || knexBuilder;
      }
    });

    return knexBuilder;
  }

  toString(): string {
    return this.toKnexQuery().toString();
  }

  toSql(): string {
    return this.toString();
  }

  skipUndefined(): this {
    deprecate('skipUndefined() is deprecated and will be removed in a future major version');
    this.internalOptions().skipUndefined = true;
    return this;
  }
}

// Operation selectors are `true` (every operation), a regex or a string that
// is matched against the operation name, an operation class, or a predicate.
// Queries walk their operations many times, so the selector is classified
// once per walk instead of being wrapped in a new function.
const SELECT_ALL = 0;
const SELECT_REGEX = 1;
const SELECT_NAME = 2;
const SELECT_CLASS = 3;
const SELECT_PREDICATE = 4;
const SELECT_NONE = 5;

type SelectorKind =
  | typeof SELECT_ALL
  | typeof SELECT_REGEX
  | typeof SELECT_NAME
  | typeof SELECT_CLASS
  | typeof SELECT_PREDICATE
  | typeof SELECT_NONE;

function selectorKind(operationSelector: OperationSelector): SelectorKind {
  if (operationSelector === true) {
    return SELECT_ALL;
  } else if (isRegExp(operationSelector)) {
    return SELECT_REGEX;
  } else if (isString(operationSelector)) {
    return SELECT_NAME;
  } else if (
    isFunction(operationSelector) &&
    (operationSelector as { isObjectionQueryBuilderOperationClass?: unknown })
      .isObjectionQueryBuilderOperationClass
  ) {
    return SELECT_CLASS;
  } else if (isFunction(operationSelector)) {
    return SELECT_PREDICATE;
  } else {
    return SELECT_NONE;
  }
}

function matchesSelector(
  op: Operation,
  kind: SelectorKind,
  operationSelector: OperationSelector,
): unknown {
  switch (kind) {
    case SELECT_ALL:
      return true;
    case SELECT_REGEX:
      // A null name is tested as 'null', as `test()` converts it to a string.
      return (operationSelector as RegExp).test(op.name as string);
    case SELECT_NAME:
      return op.name === operationSelector;
    case SELECT_CLASS:
      return op.is(operationSelector as OperationClass);
    case SELECT_PREDICATE:
      return (operationSelector as (op: Operation) => unknown)(op);
    default:
      return false;
  }
}

// Visits the operations and their descendants depth first, each operation
// before its children. Returns false if the callback stopped the walk by
// returning false. The arrays are read as the walk goes, so operations that
// the callback adds are visited too, as before.
function visitOperations(
  operations: Operation[],
  kind: SelectorKind,
  operationSelector: OperationSelector,
  callback: OperationCallback,
  match: boolean,
): boolean {
  for (const op of operations) {
    if (matchesSelector(op, kind, operationSelector) === match && callback(op) === false) {
      return false;
    }

    if (
      op.childOperations.length !== 0 &&
      visitOperations(op.childOperations, kind, operationSelector, callback, match) === false
    ) {
      return false;
    }
  }

  return true;
}

function getTableName(modelClassOrTableName: TableSource): string {
  if (isString(modelClassOrTableName)) {
    return modelClassOrTableName as string;
  } else {
    return (modelClassOrTableName as ModelClass).getTableName();
  }
}

export { QueryBuilderOperationSupport };
export type {
  TableSource,
  KnexLike,
  ModelClass,
  Operation,
  OperationClass,
  OperationSelector,
  OperationCallback,
};
