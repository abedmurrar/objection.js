import { withWhereScope, effectiveWhereScope, hasWhereAncestor } from './whereScopes';
import { wrapError } from 'db-errors';

import { raw } from './RawBuilder';
import { createModifier } from '../utils/createModifier';
import { ValidationErrorType } from '../model/ValidationError';
import { isObject, isFunction } from '../utils/objectUtils';
import { isPromise } from '../utils/promiseUtils/isPromise';
import { RelationExpression, DuplicateRelationError } from './RelationExpression';
import { assertIdNotUndefined } from '../utils/assert';

import { Selection } from './operations/select/Selection';

import { QueryBuilderContext } from './QueryBuilderContext';
import { QueryBuilderBase } from './QueryBuilderBase';

import { FindOperation } from './operations/FindOperation';
import { DeleteOperation } from './operations/DeleteOperation';
import { UpdateOperation } from './operations/UpdateOperation';
import { InsertOperation } from './operations/InsertOperation';
import { RelateOperation } from './operations/RelateOperation';
import { UnrelateOperation } from './operations/UnrelateOperation';

import { JoinEagerOperation } from './operations/eager/JoinEagerOperation';
import { NaiveEagerOperation } from './operations/eager/NaiveEagerOperation';
import { WhereInEagerOperation } from './operations/eager/WhereInEagerOperation';

import { InsertGraphAndFetchOperation } from './operations/InsertGraphAndFetchOperation';
import { UpsertGraphAndFetchOperation } from './operations/UpsertGraphAndFetchOperation';
import { InsertAndFetchOperation } from './operations/InsertAndFetchOperation';
import { UpdateAndFetchOperation } from './operations/UpdateAndFetchOperation';
import { JoinRelatedOperation } from './operations/JoinRelatedOperation';
import { OnBuildKnexOperation } from './operations/OnBuildKnexOperation';
import { InsertGraphOperation } from './operations/InsertGraphOperation';
import { UpsertGraphOperation } from './operations/UpsertGraphOperation';
import { RunBeforeOperation } from './operations/RunBeforeOperation';
import { RunAfterOperation } from './operations/RunAfterOperation';
import { FindByIdOperation } from './operations/FindByIdOperation';
import { FindByIdsOperation } from './operations/FindByIdsOperation';
import { OnBuildOperation } from './operations/OnBuildOperation';
import { OnErrorOperation } from './operations/OnErrorOperation';
import { SelectOperation } from './operations/select/SelectOperation';
import { EagerOperation } from './operations/eager/EagerOperation';
import { RangeOperation } from './operations/RangeOperation';
import { FirstOperation } from './operations/FirstOperation';
import { FromOperation } from './operations/FromOperation';
import { KnexOperation } from './operations/KnexOperation';

import { createModelsFromDatabaseRows } from '../model/modelDatabaseRows';
import type { KnexLike, ModelClass, Operation } from './QueryBuilderOperationSupport';
import type { FindOptions } from './operations/types';
import { HookBits, QueryBuilderOperation } from './operations/QueryBuilderOperation';
import type { HookName, PhaseHookName } from './operations/QueryBuilderOperation';
import type { OperationsSummary } from './QueryBuilderOperationSupport';
import type { InstanceUpdateOperation } from './operations/InstanceUpdateOperation';
import type { RelationOperationOptions } from '../relations/Relation';

// A modifier: a function, the name of a modifier, an object of `where`
// conditions or an array of those. `any[]`: the modifier gets the arguments
// of `modify()` as they are.
type Modifier<B> = ((builder: B, ...args: any[]) => unknown) | string | object | null | undefined;

// Creates the operation that a write method (or a find query) adds.
type OperationFactory = (builder: QueryBuilder) => Operation;

// The summary of a query's operations, see `summarizeOperations()`.
interface QueryOperationsSummary extends OperationsSummary {
  hasWriteOperation: boolean;
  hasInsertOperation: boolean;
  hasFindOperation: boolean;
  eagerOperation: EagerOperation | null;
  // The last operation that sets the table, see `buildKnexQuery()`.
  lastFromOperation: Operation | null;
  hasSelectOperation: boolean;
  // Whether a where operation has a where scope, see `whereScopes.ts`.
  hasScopedWhereOperation: boolean;
  // The number of where operations that aren't inside another where
  // operation. The where scopes are those of these operations.
  whereOperationCount: number;
}

// Whether the next builder created is a clone, see `clone()`.
let skipNextContext = false;

function takeSkipNextContext(): boolean {
  const skip = skipNextContext;
  skipNextContext = false;
  return skip;
}

class QueryBuilder extends QueryBuilderBase {
  // Types `this.constructor` (and `builder.constructor.forClass()` in the operations).
  // biome-ignore lint/complexity/useLiteralKeys: a field can't be named `constructor` without the brackets.
  declare ['constructor']: typeof QueryBuilder;
  declare _context: QueryBuilderContext;

  declare _resultModelClass: ModelClass | null;
  declare _explicitRejectValue: unknown;
  declare _explicitResolveValue: unknown;
  declare _modifiers: Record<string, unknown>;

  declare _allowedGraphExpression: RelationExpression | null;
  declare _findOperationOptions: FindOptions;
  declare _relatedQueryFor: unknown;
  declare _isRelatedQuery: boolean;
  declare _forError: Error | null;

  declare _findOperationFactory: OperationFactory;
  declare _insertOperationFactory: OperationFactory;
  declare _updateOperationFactory: OperationFactory;
  declare _patchOperationFactory: OperationFactory;
  declare _relateOperationFactory: OperationFactory;
  declare _unrelateOperationFactory: OperationFactory;
  declare _deleteOperationFactory: OperationFactory;

  static init(self: QueryBuilder, modelClass: ModelClass): void {
    super.init(self, modelClass, takeSkipNextContext());

    self._resultModelClass = null;
    self._explicitRejectValue = null;
    self._explicitResolveValue = null;
    self._modifiers = {};

    self._allowedGraphExpression = null;
    self._findOperationOptions = modelClass.defaultFindOptions;
    self._relatedQueryFor = null;
    self._isRelatedQuery = false;
    self._forError = null;

    self._findOperationFactory = findOperationFactory;
    self._insertOperationFactory = insertOperationFactory;
    self._updateOperationFactory = updateOperationFactory;
    self._patchOperationFactory = patchOperationFactory;
    self._relateOperationFactory = relateOperationFactory;
    self._unrelateOperationFactory = unrelateOperationFactory;
    self._deleteOperationFactory = deleteOperationFactory;
  }

  static get QueryBuilderContext(): typeof QueryBuilderContext {
    return QueryBuilderContext;
  }

  static parseRelationExpression(expr: unknown): unknown {
    return RelationExpression.create(expr).toPojo();
  }

  tableName(): string;
  tableName(newTableName: string): this;
  tableName(newTableName?: string): string | this {
    return this.tableNameFor(this.modelClass().getTableName(), newTableName);
  }

  tableRef(): string {
    return this.tableRefFor(this.modelClass().getTableName());
  }

  alias(): string | null;
  alias(alias: string): this;
  alias(alias?: string): string | null | this {
    return this.aliasFor(this.modelClass().getTableName(), alias);
  }

  fullIdColumnFor(modelClass: ModelClass): string | string[] {
    const tableName = this.tableRefFor(modelClass);
    const idColumn = modelClass.getIdColumn();

    if (Array.isArray(idColumn)) {
      return idColumn.map((col: string) => `${tableName}.${col}`);
    } else {
      return `${tableName}.${idColumn}`;
    }
  }

  fullIdColumn(): string | string[] {
    return this.fullIdColumnFor(this.modelClass());
  }

  modifiers(): Record<string, unknown>;
  modifiers(modifiers: Record<string, unknown>): this;
  modifiers(modifiers?: Record<string, unknown>): Record<string, unknown> | this {
    if (arguments.length === 0) {
      return { ...this._modifiers };
    } else {
      this._modifiers = { ...this._modifiers, ...modifiers };
      return this;
    }
  }

  modify(modifier: Modifier<this>, ...args: unknown[]): this {
    if (!modifier) {
      return this;
    }

    modifier = createModifier({
      modifier,
      modelClass: this.modelClass(),
      modifiers: this._modifiers,
    });

    (modifier as (builder: this, ...args: unknown[]) => void)(this, ...args);
    return this;
  }

  reject(error: unknown): this {
    this._explicitRejectValue = error;
    return this;
  }

  resolve(value: unknown): this {
    this._explicitResolveValue = value;
    return this;
  }

  isExplicitlyResolvedOrRejected(): boolean {
    // `resolve(0)` and `resolve(false)` resolve the query too.
    return this._explicitRejectValue !== null || this._explicitResolveValue !== null;
  }

  isExecutable(): boolean {
    return !this.isExplicitlyResolvedOrRejected() && !findQueryExecutorOperation(this);
  }

  findOperationFactory(factory: OperationFactory): this {
    this._findOperationFactory = factory;
    return this;
  }

  insertOperationFactory(factory: OperationFactory): this {
    this._insertOperationFactory = factory;
    return this;
  }

  updateOperationFactory(factory: OperationFactory): this {
    this._updateOperationFactory = factory;
    return this;
  }

  patchOperationFactory(factory: OperationFactory): this {
    this._patchOperationFactory = factory;
    return this;
  }

  deleteOperationFactory(factory: OperationFactory): this {
    this._deleteOperationFactory = factory;
    return this;
  }

  relateOperationFactory(factory: OperationFactory): this {
    this._relateOperationFactory = factory;
    return this;
  }

  unrelateOperationFactory(factory: OperationFactory): this {
    this._unrelateOperationFactory = factory;
    return this;
  }

  withGraphFetched(exp: unknown, options: object = {}): this {
    return this._withGraph(exp, options, getWhereInEagerAlgorithm(this));
  }

  withGraphJoined(exp: unknown, options: object = {}): this {
    return this._withGraph(exp, options, getJoinEagerAlgorithm(this));
  }

  _withGraph(exp: unknown, options: object, algorithm: unknown): this {
    const eagerOp = ensureEagerOperation(this, algorithm);
    const parsedExp = parseRelationExpression(this.modelClass(), exp);

    eagerOp.expression = eagerOp.expression.merge(parsedExp);
    eagerOp.graphOptions = { ...eagerOp.graphOptions, ...options };

    checkEager(this);
    return this;
  }

  allowGraph(exp: unknown): this {
    const currentExpr = this._allowedGraphExpression || RelationExpression.create();

    this._allowedGraphExpression = currentExpr.merge(
      parseRelationExpression(this.modelClass(), exp),
    );

    checkEager(this);
    return this;
  }

  allowedGraphExpression(): RelationExpression | null {
    return this._allowedGraphExpression;
  }

  graphExpressionObject(): unknown {
    const eagerOp = this.findOperation(EagerOperation);

    if (eagerOp && !eagerOp.expression.isEmpty) {
      return eagerOp.expression.toPojo();
    } else {
      return null;
    }
  }

  graphModifiersAtPath(): object[] {
    const eagerOp = this.findOperation(EagerOperation);

    if (eagerOp && !eagerOp.expression.isEmpty) {
      return eagerOp.modifiersAtPath.map((it: object) => Object.assign({}, it));
    } else {
      return [];
    }
  }

  modifyGraph(path: unknown, modifier: unknown): this {
    const eagerOp = ensureEagerOperation(this);
    eagerOp.modifiersAtPath.push({ path, modifier });
    return this;
  }

  findOptions(): FindOptions;
  findOptions(opt: FindOptions): this;
  findOptions(opt?: FindOptions): FindOptions | this {
    if (arguments.length !== 0) {
      this._findOperationOptions = Object.assign({}, this._findOperationOptions, opt);
      return this;
    } else {
      return this._findOperationOptions;
    }
  }

  resultModelClass(): ModelClass {
    return this._resultModelClass || this.modelClass();
  }

  isFind(): boolean {
    if (
      this.isInsert === QueryBuilder.prototype.isInsert &&
      this.isUpdate === QueryBuilder.prototype.isUpdate &&
      this.isDelete === QueryBuilder.prototype.isDelete &&
      this.isRelate === QueryBuilder.prototype.isRelate &&
      this.isUnrelate === QueryBuilder.prototype.isUnrelate
    ) {
      // The same as below without a walk of the operations.
      return !this.operationsSummary().hasWriteOperation;
    }

    return !(
      this.isInsert() ||
      this.isUpdate() ||
      this.isDelete() ||
      this.isRelate() ||
      this.isUnrelate()
    );
  }

  isInsert(): boolean {
    return this.operationsSummary().hasInsertOperation;
  }

  isUpdate(): boolean {
    return this.has(UpdateOperation);
  }

  isDelete(): boolean {
    return this.has(DeleteOperation);
  }

  isRelate(): boolean {
    return this.has(RelateOperation);
  }

  isUnrelate(): boolean {
    return this.has(UnrelateOperation);
  }

  hasWheres(): boolean {
    const queryWithoutGraph = this.clone().clearWithGraph();
    return prebuildQuery(queryWithoutGraph).has(QueryBuilderBase.WhereSelector);
  }

  hasSelects(): boolean {
    return this.operationsSummary().hasSelectOperation;
  }

  // Where clauses are only grouped when some have a where scope, and it takes
  // two where operations to have two scopes.
  needsWhereGrouping(): boolean {
    const summary = this.operationsSummary();
    return summary.hasScopedWhereOperation && summary.whereOperationCount > 1;
  }

  hasWithGraph(): boolean {
    const eagerOp = this.operationsSummary().eagerOperation;
    return eagerOp !== null && !eagerOp.expression.isEmpty;
  }

  operationsSummary(): QueryOperationsSummary {
    return super.operationsSummary() as QueryOperationsSummary;
  }

  createOperationsSummary(): QueryOperationsSummary {
    return {
      version: this._operationsVersion,
      hooks: 0,
      hasWriteOperation: false,
      hasInsertOperation: false,
      hasFindOperation: false,
      eagerOperation: null,
      lastFromOperation: null,
      hasSelectOperation: false,
      hasScopedWhereOperation: false,
      whereOperationCount: 0,
    };
  }

  // One walk answers what a query asks about its operations while it is
  // built and executed.
  summarizeOperation(summary: QueryOperationsSummary, op: Operation, isAdded: boolean): boolean {
    const kind = operationKind(op);
    summary.hooks |= op.hookMask();

    if ((kind & KIND_WRITE) !== 0) {
      summary.hasWriteOperation = true;
    }

    if ((kind & KIND_INSERT) !== 0) {
      summary.hasInsertOperation = true;
    }

    if ((kind & KIND_FIND) !== 0) {
      summary.hasFindOperation = true;
    }

    // The first eager operation and the last from operation count, so with
    // more than one, it matters where an added one is.
    if ((kind & KIND_EAGER) !== 0) {
      if (summary.eagerOperation === null) {
        summary.eagerOperation = op as EagerOperation;
      } else if (isAdded) {
        return false;
      }
    }

    if ((kind & KIND_FROM) !== 0) {
      if (isAdded && summary.lastFromOperation !== null) {
        return false;
      }

      summary.lastFromOperation = op;
    }

    if ((kind & KIND_SELECT) !== 0) {
      summary.hasSelectOperation = true;
    }

    if ((kind & KIND_WHERE) !== 0) {
      if (!hasWhereAncestor(op)) {
        summary.whereOperationCount += 1;
      }

      if (effectiveWhereScope(op) !== null) {
        summary.hasScopedWhereOperation = true;
      }
    }

    return true;
  }

  isSelectAll(): boolean {
    if (this._operations.length === 0) {
      return true;
    }

    const tableRef = this.tableRef();
    const tableName = this.tableName();

    return this.everyOperation((op) => {
      // TypeScript narrows `op` to `never` when its constructor is compared with
      // a subclass, hence `as unknown` and the casts in the branches.
      if ((op.constructor as unknown) === SelectOperation) {
        // SelectOperations with zero selections are the ones that only have
        // raw items or other non-trivial selections.
        return (
          (op as SelectOperation).selections.length > 0 &&
          (op as SelectOperation).selections.every((select) => {
            return (!select.table || select.table === tableRef) && select.column === '*';
          })
        );
      } else if ((op.constructor as unknown) === FromOperation) {
        return (op as FromOperation).table === tableName;
      } else if (op.name === 'as' || op.is(FindOperation) || op.is(OnErrorOperation)) {
        return true;
      } else {
        return false;
      }
    });
  }

  toString(): string {
    return '[object QueryBuilder]';
  }

  clone(): this {
    // `baseCloneInto()` replaces the context that a new builder would get.
    // Only for this class: a subclass's constructor may use its context.
    skipNextContext = this.constructor === QueryBuilder;
    const builder = this.emptyInstance();

    // Call the super class's clone implementation.
    this.baseCloneInto(builder);

    builder._resultModelClass = this._resultModelClass;

    builder._explicitRejectValue = this._explicitRejectValue;
    builder._explicitResolveValue = this._explicitResolveValue;
    // Shared: `modifiers()` replaces the object instead of changing it.
    builder._modifiers = this._modifiers;

    builder._allowedGraphExpression = this._allowedGraphExpression;
    builder._findOperationOptions = this._findOperationOptions;

    return builder;
  }

  emptyInstance(): this {
    const builder = new this.constructor(this.modelClass()) as this;

    builder._findOperationFactory = this._findOperationFactory;
    builder._insertOperationFactory = this._insertOperationFactory;
    builder._updateOperationFactory = this._updateOperationFactory;
    builder._patchOperationFactory = this._patchOperationFactory;
    builder._relateOperationFactory = this._relateOperationFactory;
    builder._unrelateOperationFactory = this._unrelateOperationFactory;
    builder._deleteOperationFactory = this._deleteOperationFactory;
    builder._relatedQueryFor = this._relatedQueryFor;
    builder._isRelatedQuery = this._isRelatedQuery;
    builder._forError = this._forError;

    return builder;
  }

  clearWithGraph(): this {
    this.clear(EagerOperation);
    return this;
  }

  clearWithGraphFetched(): this {
    this.clear(WhereInEagerOperation);
    return this;
  }

  clearAllowGraph(): this {
    this._allowedGraphExpression = null;
    return this;
  }

  clearModifiers(): this {
    this._modifiers = {};
    return this;
  }

  clearReject(): this {
    this._explicitRejectValue = null;
    return this;
  }

  clearResolve(): this {
    this._explicitResolveValue = null;
    return this;
  }

  castTo(modelClass: ModelClass | null | undefined): this {
    this._resultModelClass = modelClass || null;
    return this;
  }

  then(...args: Parameters<Promise<any>['then']>): Promise<unknown> {
    const promise = this.execute();
    return promise.then(...args);
  }

  catch(...args: Parameters<Promise<any>['catch']>): Promise<unknown> {
    const promise = this.execute();
    return promise.catch(...args);
  }

  finally(...args: Parameters<Promise<any>['finally']>): Promise<unknown> {
    const promise = this.execute();
    return promise.finally(...args);
  }

  async resultSize(): Promise<number> {
    const knex = this.knex();
    const builder = this.clone().clear(/orderBy|offset|limit/);

    // knex's types don't accept this `from()` callback or `debug()` without an argument.
    const countQuery: KnexLike = (knex as KnexLike)
      .count('* as count')
      .from((knexBuilder: KnexLike) => {
        builder.toKnexQuery(knexBuilder).as('temp');
      });

    if (this.internalOptions().debug) {
      countQuery.debug();
    }

    const result = await countQuery;
    return result[0] && result[0].count ? parseInt(result[0].count, 10) : 0;
  }

  toKnexQuery(knexBuilder: KnexLike = this.knex().queryBuilder()): KnexLike {
    const prebuiltQuery = prebuildQuery(this.clone());
    return buildKnexQuery(prebuiltQuery, knexBuilder);
  }

  // Resolves to whatever the operations produce: models, rows, counts...
  async execute(): Promise<any> {
    // Take a clone so that we don't modify this instance during execution.
    const builder = this.clone();

    try {
      // The phases run one after another in this function, and a phase only
      // waits when a hook returns a promise. Most queries have no async hook,
      // so this saves a promise and a microtask per hook and phase, and the
      // functions that would chain the phases.

      // This needs to be checked before any hooks are called.
      checkForUsage(builder);
      addImplicitOperations(builder);

      // The `runBefore` hooks are read before the hooks run.
      const userRunBefore = builder.context().runBefore;
      const internalRunBefore = builder.internalContext().runBefore;

      // As before, no hook runs inside the caller's call to `execute()`.
      await undefined;

      let result: unknown = runOperationHooks(builder, 'onBefore1', undefined);
      if (isPromise(result)) result = await result;
      result = runOperationHooks(builder, 'onBefore2', result);
      if (isPromise(result)) result = await result;
      result = runHooks(builder, userRunBefore, result);
      if (isPromise(result)) result = await result;
      result = runHooks(builder, internalRunBefore, result);
      if (isPromise(result)) result = await result;
      result = runOperationHooks(builder, 'onBefore3', result);
      if (isPromise(result)) result = await result;

      result = doExecute(builder);
      if (isPromise(result)) result = await result;

      result = runOperationHooks(builder, 'onAfter1', result);
      if (isPromise(result)) result = await result;
      result = runOperationHooks(builder, 'onAfter2', result);
      if (isPromise(result)) result = await result;

      // The `runAfter` hooks are read after `onAfter2`.
      const userRunAfter = builder.context().runAfter;
      const internalRunAfter = builder.internalContext().runAfter;

      result = runHooks(builder, userRunAfter, result);
      if (isPromise(result)) result = await result;
      result = runHooks(builder, internalRunAfter, result);
      if (isPromise(result)) result = await result;
      result = runOperationHooks(builder, 'onAfter3', result);
      if (isPromise(result)) result = await result;

      return result;
    } catch (error) {
      return await handleExecuteError(builder, error);
    }
  }

  throwIfNotFound(data: object = {}): this {
    return this.runAfter((result: unknown) => {
      if (
        (Array.isArray(result) && result.length === 0) ||
        result === null ||
        result === undefined ||
        result === 0
      ) {
        throw this.modelClass().createNotFoundError(this.context(), data);
      } else {
        return result;
      }
    });
  }

  findSelection(selection: unknown, explicit = false): Selection | null {
    let noSelectStatements = true;
    let selectionInstance: Selection | null = null;

    this.forEachOperation(true, (op): boolean | void => {
      // See `isSelectAll()` for the casts.
      if ((op.constructor as unknown) === SelectOperation) {
        selectionInstance = (op as SelectOperation).findSelection(this, selection);
        noSelectStatements = false;

        if (selectionInstance) {
          return false;
        }
      }
    });

    if (selectionInstance) {
      return selectionInstance;
    }

    if (noSelectStatements && !explicit) {
      const selectAll = new Selection(this.tableRef(), '*');

      if (Selection.doesSelect(this, selectAll, selection)) {
        return selectAll;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  findAllSelections(): Selection[] {
    let allSelections: Selection[] = [];

    this.forEachOperation(true, (op) => {
      // See `isSelectAll()` for the casts.
      if ((op.constructor as unknown) === SelectOperation) {
        allSelections = allSelections.concat((op as SelectOperation).selections);
      }
    });

    return allSelections;
  }

  hasSelection(selection: unknown, explicit?: boolean): boolean {
    return this.findSelection(selection, explicit) !== null;
  }

  hasSelectionAs(selection: unknown, alias: string, explicit?: boolean): boolean {
    selection = Selection.create(selection);
    const foundSelection = this.findSelection(selection, explicit);

    if (foundSelection === null) {
      return false;
    } else {
      if (foundSelection.column === '*') {
        // * selects the columns with their column names as aliases.
        return (selection as Selection).column === alias;
      } else {
        return foundSelection.name === alias;
      }
    }
  }

  traverse(modelClass: unknown, traverser?: unknown): this {
    if (typeof traverser === 'undefined') {
      traverser = modelClass;
      modelClass = null;
    }

    return this.runAfter((result: unknown) => {
      this.resultModelClass().traverse(modelClass, result, traverser);
      return result;
    });
  }

  page(page: number, pageSize: number): this {
    return this.range(+page * +pageSize, (+page + 1) * +pageSize - 1);
  }

  columnInfo({ table = null }: { table?: string | null } = {}): KnexLike {
    table = table || this.tableName();

    const knex = this.knex();
    const tableParts = table.split('.');
    // knex's types make `columnInfo()` a promise, but it's the query builder.
    const columnInfoQuery: KnexLike = knex(tableParts.at(-1)!).columnInfo();
    const schema = this.internalOptions().schema;

    if (schema) {
      columnInfoQuery.withSchema(schema);
    } else if (tableParts.length > 1) {
      columnInfoQuery.withSchema(tableParts[0]);
    }

    if (this.internalOptions().debug) {
      columnInfoQuery.debug();
    }

    return columnInfoQuery;
  }

  withSchema(schema: string): this {
    this.internalOptions().schema = schema;
    this.internalContext().onBuild.push((builder) => {
      if (!builder.has(/withSchema/)) {
        // Need to push this operation to the front because knex doesn't use the
        // schema for operations called before `withSchema`.
        builder.addOperationToFront(new KnexOperation('withSchema'), [schema]);
      }
    });

    return this;
  }

  debug /* istanbul ignore next */(): this {
    this.internalOptions().debug = true;
    this.internalContext().onBuild.push((builder) => {
      builder.addOperation(new KnexOperation('debug'), []);
    });

    return this;
  }

  insert(modelsOrObjects: unknown): this {
    return writeOperation(this, () => {
      const insertOperation = this._insertOperationFactory(this);

      this.addOperation(insertOperation, [modelsOrObjects]);
    });
  }

  insertAndFetch(modelsOrObjects: unknown): this {
    return writeOperation(this, () => {
      const insertOperation = this._insertOperationFactory(this);

      const insertAndFetchOperation = new InsertAndFetchOperation('insertAndFetch', {
        delegate: insertOperation,
      });

      this.addOperation(insertAndFetchOperation, [modelsOrObjects]);
    });
  }

  insertGraph(modelsOrObjects: unknown, opt?: Record<string, unknown>): this {
    return writeOperation(this, () => {
      const insertOperation = this._insertOperationFactory(this);

      const insertGraphOperation = new InsertGraphOperation('insertGraph', {
        delegate: insertOperation,
        opt,
      });

      this.addOperation(insertGraphOperation, [modelsOrObjects]);
    });
  }

  insertGraphAndFetch(modelsOrObjects: unknown, opt?: Record<string, unknown>): this {
    return writeOperation(this, () => {
      const insertOperation = this._insertOperationFactory(this);

      const insertGraphOperation = new InsertGraphOperation('insertGraph', {
        delegate: insertOperation,
        opt,
      });

      const insertGraphAndFetchOperation = new InsertGraphAndFetchOperation('insertGraphAndFetch', {
        delegate: insertGraphOperation,
      });

      return this.addOperation(insertGraphAndFetchOperation, [modelsOrObjects]);
    });
  }

  update(modelOrObject: unknown): this {
    return writeOperation(this, () => {
      const updateOperation = this._updateOperationFactory(this);

      this.addOperation(updateOperation, [modelOrObject]);
    });
  }

  updateAndFetch(modelOrObject: unknown): this {
    return writeOperation(this, () => {
      const updateOperation = this._updateOperationFactory(this);

      // Only instance operations have `instance`, and this throws for the others.
      if (!((updateOperation as InstanceUpdateOperation).instance instanceof this.modelClass())) {
        throw new Error('updateAndFetch can only be called for instance operations');
      }

      const updateAndFetch = new UpdateAndFetchOperation('updateAndFetch', {
        delegate: updateOperation,
      });

      // patchOperation is an instance update operation that already adds the
      // required "where id = $" clause.
      updateAndFetch.skipIdWhere = true;

      this.addOperation(updateAndFetch, [
        (updateOperation as InstanceUpdateOperation).instance.$id(),
        modelOrObject,
      ]);
    });
  }

  updateAndFetchById(id: unknown, modelOrObject: unknown): this {
    return writeOperation(this, () => {
      const updateOperation = this._updateOperationFactory(this);

      const updateAndFetch = new UpdateAndFetchOperation('updateAndFetch', {
        delegate: updateOperation,
      });

      this.addOperation(updateAndFetch, [id, modelOrObject]);
    });
  }

  upsertGraph(modelsOrObjects: unknown, upsertOptions?: Record<string, unknown>): this {
    return writeOperation(this, () => {
      const upsertGraphOperation = new UpsertGraphOperation('upsertGraph', {
        upsertOptions,
      });

      this.addOperation(upsertGraphOperation, [modelsOrObjects]);
    });
  }

  upsertGraphAndFetch(modelsOrObjects: unknown, upsertOptions?: Record<string, unknown>): this {
    return writeOperation(this, () => {
      const upsertGraphOperation = new UpsertGraphOperation('upsertGraph', {
        upsertOptions,
      });

      const upsertGraphAndFetchOperation = new UpsertGraphAndFetchOperation('upsertGraphAndFetch', {
        delegate: upsertGraphOperation,
      });

      return this.addOperation(upsertGraphAndFetchOperation, [modelsOrObjects]);
    });
  }

  patch(modelOrObject: unknown): this {
    return writeOperation(this, () => {
      const patchOperation = this._patchOperationFactory(this);

      this.addOperation(patchOperation, [modelOrObject]);
    });
  }

  patchAndFetch(modelOrObject: unknown): this {
    return writeOperation(this, () => {
      const patchOperation = this._patchOperationFactory(this);

      // Only instance operations have `instance`, and this throws for the others.
      if (!((patchOperation as InstanceUpdateOperation).instance instanceof this.modelClass())) {
        throw new Error('patchAndFetch can only be called for instance operations');
      }

      const patchAndFetch = new UpdateAndFetchOperation('patchAndFetch', {
        delegate: patchOperation,
      });

      // patchOperation is an instance update operation that already adds the
      // required "where id = $" clause.
      patchAndFetch.skipIdWhere = true;

      this.addOperation(patchAndFetch, [
        (patchOperation as InstanceUpdateOperation).instance.$id(),
        modelOrObject,
      ]);
    });
  }

  patchAndFetchById(id: unknown, modelOrObject: unknown): this {
    return writeOperation(this, () => {
      const patchOperation = this._patchOperationFactory(this);

      const patchAndFetch = new UpdateAndFetchOperation('patchAndFetch', {
        delegate: patchOperation,
      });

      this.addOperation(patchAndFetch, [id, modelOrObject]);
    });
  }

  delete(...args: unknown[]): this {
    return writeOperation(this, () => {
      if (args.length) {
        throw new Error(
          `Don't pass arguments to delete(). You should use it like this: delete().where('foo', 'bar').andWhere(...)`,
        );
      }

      const deleteOperation = this._deleteOperationFactory(this);
      this.addOperation(deleteOperation, args);
    });
  }

  del(...args: unknown[]): this {
    return this.delete(...args);
  }

  relate(...args: unknown[]): this {
    return writeOperation(this, () => {
      const relateOperation = this._relateOperationFactory(this);

      this.addOperation(relateOperation, args);
    });
  }

  unrelate(...args: unknown[]): this {
    return writeOperation(this, () => {
      if (args.length) {
        throw new Error(
          `Don't pass arguments to unrelate(). You should use it like this: unrelate().where('foo', 'bar').andWhere(...)`,
        );
      }

      const unrelateOperation = this._unrelateOperationFactory(this);
      this.addOperation(unrelateOperation, args);
    });
  }

  increment(propertyName: string, howMuch: number): this {
    const columnName = this.modelClass().propertyNameToColumnName(propertyName);

    return this.patch({
      [columnName]: raw('?? + ?', [columnName, howMuch]),
    });
  }

  decrement(propertyName: string, howMuch: number): this {
    const columnName = this.modelClass().propertyNameToColumnName(propertyName);

    return this.patch({
      [columnName]: raw('?? - ?', [columnName, howMuch]),
    });
  }

  findOne(...args: unknown[]): this {
    return this.where.apply(this, args).first();
  }

  range(...args: unknown[]): this {
    return this.clear(RangeOperation).addOperation(new RangeOperation('range'), args);
  }

  first(...args: unknown[]): this {
    return this.addOperation(new FirstOperation('first'), args);
  }

  joinRelated(expression: unknown, options?: object): this {
    return addJoinRelated(this, 'innerJoin', expression, options);
  }

  innerJoinRelated(expression: unknown, options?: object): this {
    return addJoinRelated(this, 'innerJoin', expression, options);
  }

  outerJoinRelated(expression: unknown, options?: object): this {
    return addJoinRelated(this, 'outerJoin', expression, options);
  }

  fullOuterJoinRelated(expression: unknown, options?: object): this {
    return addJoinRelated(this, 'fullOuterJoin', expression, options);
  }

  leftJoinRelated(expression: unknown, options?: object): this {
    return addJoinRelated(this, 'leftJoin', expression, options);
  }

  leftOuterJoinRelated(expression: unknown, options?: object): this {
    return addJoinRelated(this, 'leftOuterJoin', expression, options);
  }

  rightJoinRelated(expression: unknown, options?: object): this {
    return addJoinRelated(this, 'rightJoin', expression, options);
  }

  rightOuterJoinRelated(expression: unknown, options?: object): this {
    return addJoinRelated(this, 'rightOuterJoin', expression, options);
  }

  deleteById(id: unknown): this {
    return withWhereScope(this, () => this.findById(id))
      .delete()
      .runBefore((_: unknown, builder: QueryBuilder) => {
        if (!builder.internalOptions().skipUndefined) {
          assertIdNotUndefined(id, `undefined was passed to deleteById`);
        }
      });
  }

  findById(...args: unknown[]): this {
    return this.addOperation(new FindByIdOperation('findById'), args).first();
  }

  findByIds(...args: unknown[]): this {
    return this.addOperation(new FindByIdsOperation('findByIds'), args);
  }

  runBefore(...args: unknown[]): this {
    return this.addOperation(new RunBeforeOperation('runBefore'), args);
  }

  onBuild(...args: unknown[]): this {
    return this.addOperation(new OnBuildOperation('onBuild'), args);
  }

  onBuildKnex(...args: unknown[]): this {
    return this.addOperation(new OnBuildKnexOperation('onBuildKnex'), args);
  }

  runAfter(...args: unknown[]): this {
    return this.addOperation(new RunAfterOperation('runAfter'), args);
  }

  onError(...args: unknown[]): this {
    return this.addOperation(new OnErrorOperation('onError'), args);
  }

  from(...args: unknown[]): this {
    return this.addOperation(new FromOperation('from'), args);
  }

  updateFrom(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('updateFrom'), args);
  }

  table(...args: unknown[]): this {
    return this.addOperation(new FromOperation('table'), args);
  }

  for(): unknown;
  for(relatedQueryFor: unknown): this;
  for(relatedQueryFor?: unknown): unknown {
    if (arguments.length === 0) {
      return this._relatedQueryFor;
    }

    if (this._forError !== null) {
      // Keep the first error.
    } else if (!this._isRelatedQuery) {
      // Without this check `Model.query().for(1).delete()` would delete all rows.
      this._forError = new Error(
        'for() can only be used with queries created using the static relatedQuery() method',
      );
    } else if (!this.isFind()) {
      // The owner has already been passed to the write operation.
      this._forError = new Error(
        'for() must be called before the write methods ' +
          '(insert, update, patch, delete, relate, unrelate, increment, decrement)',
      );
    }

    this._relatedQueryFor = relatedQueryFor;
    return this;
  }
}

Object.defineProperties(QueryBuilder.prototype, {
  isObjectionQueryBuilder: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

const KIND_WRITE = 1;
const KIND_INSERT = 2;
const KIND_FIND = 4;
const KIND_EAGER = 8;
const KIND_FROM = 16;
const KIND_SELECT = 32;
const KIND_WHERE = 64;
const baseIs = QueryBuilderOperation.prototype.is;

// The kinds of an operation that the summary of a query needs, worked out
// once for an operation and its clones.
function operationKind(op: Operation): number {
  let kind = op._kindMask;

  if (kind === -1) {
    if (op.is === baseIs) {
      kind =
        (op instanceof InsertOperation ||
        op instanceof UpdateOperation ||
        op instanceof DeleteOperation ||
        op instanceof RelateOperation ||
        op instanceof UnrelateOperation
          ? KIND_WRITE
          : 0) |
        (op instanceof InsertOperation ? KIND_INSERT : 0) |
        (op instanceof FindOperation ? KIND_FIND : 0) |
        (op instanceof EagerOperation ? KIND_EAGER : 0) |
        nameKind(op);
    } else {
      // A class like `DelegateOperation` answers `is()` itself.
      kind =
        (isWriteOperation(op) ? KIND_WRITE : 0) |
        (op.is(InsertOperation) ? KIND_INSERT : 0) |
        (op.is(FindOperation) ? KIND_FIND : 0) |
        (op.is(EagerOperation) ? KIND_EAGER : 0) |
        nameKind(op);
    }

    op._kindMask = kind;
  }

  return kind;
}

// The kinds that the selectors of `buildKnexQuery()`, `hasSelects()` and the
// where grouping find by the name of an operation.
// The names are those of the query builder methods, so they are few.
function nameKind(op: Operation): number {
  let kind = nameKinds.get(op.name);

  if (kind === undefined) {
    // A null name is tested as 'null', as `test()` converts it to a string.
    const name = op.name as string;

    kind =
      (QueryBuilderBase.FromSelector.test(name) ? KIND_FROM : 0) |
      (QueryBuilderBase.SelectSelector.test(name) ? KIND_SELECT : 0) |
      (QueryBuilderBase.WhereSelector.test(name) ? KIND_WHERE : 0);

    nameKinds.set(op.name, kind);
  }

  return kind;
}

const nameKinds = new Map<string | null, number>();

function isWriteOperation(op: Operation): boolean {
  return (
    op.is(InsertOperation) ||
    op.is(UpdateOperation) ||
    op.is(DeleteOperation) ||
    op.is(RelateOperation) ||
    op.is(UnrelateOperation)
  );
}

// Returns the eager operation, whose class depends on the algorithm.
function ensureEagerOperation(builder: QueryBuilder, algorithm: unknown = null): EagerOperation {
  const modelClass = builder.modelClass();
  const defaultGraphOptions = modelClass.getDefaultGraphOptions();
  const eagerOp = builder.findOperation(EagerOperation);

  if (algorithm) {
    const EagerOperationClass = getOperationClassForEagerAlgorithm(builder, algorithm);

    if (eagerOp instanceof EagerOperationClass) {
      return eagerOp;
    } else {
      const newEagerOp = new EagerOperationClass('eager', {
        defaultGraphOptions,
      });

      if (eagerOp) {
        newEagerOp.cloneFrom(eagerOp);
      }

      builder.clear(EagerOperation);
      builder.addOperation(newEagerOp);

      return newEagerOp;
    }
  } else {
    if (eagerOp) {
      return eagerOp;
    } else {
      const EagerOperationClass = getOperationClassForEagerAlgorithm(
        builder,
        getWhereInEagerAlgorithm(builder),
      );

      const newEagerOp = new EagerOperationClass('eager', {
        defaultGraphOptions,
      });

      builder.addOperation(newEagerOp);

      return newEagerOp;
    }
  }
}

function getWhereInEagerAlgorithm(builder: QueryBuilder): unknown {
  return builder.modelClass().WhereInEagerAlgorithm;
}

function getJoinEagerAlgorithm(builder: QueryBuilder): unknown {
  return builder.modelClass().JoinEagerAlgorithm;
}

function getNaiveEagerAlgorithm(builder: QueryBuilder): unknown {
  return builder.modelClass().NaiveEagerAlgorithm;
}

function getOperationClassForEagerAlgorithm(
  builder: QueryBuilder,
  algorithm: unknown,
): typeof JoinEagerOperation | typeof NaiveEagerOperation | typeof WhereInEagerOperation {
  if (algorithm === getJoinEagerAlgorithm(builder)) {
    return JoinEagerOperation;
  } else if (algorithm === getNaiveEagerAlgorithm(builder)) {
    return NaiveEagerOperation;
  } else {
    return WhereInEagerOperation;
  }
}

function parseRelationExpression(modelClass: ModelClass, exp: unknown): RelationExpression {
  try {
    return RelationExpression.create(exp);
  } catch (err) {
    if (err instanceof DuplicateRelationError) {
      throw modelClass.createValidationError({
        type: ValidationErrorType.RelationExpression,
        message: `Duplicate relation name "${err.relationName}" in relation expression "${exp}". For example, use "${err.relationName}.[foo, bar]" instead of "[${err.relationName}.foo, ${err.relationName}.bar]".`,
      });
    } else {
      throw modelClass.createValidationError({
        type: ValidationErrorType.RelationExpression,
        message: `Invalid relation expression "${exp}"`,
      });
    }
  }
}

function checkEager(builder: QueryBuilder): void {
  const eagerOp = builder.findOperation(EagerOperation);

  if (!eagerOp) {
    return;
  }

  const expr = eagerOp.expression;
  const allowedExpr = builder.allowedGraphExpression();

  if (expr.numChildren > 0 && allowedExpr && !allowedExpr.isSubExpression(expr)) {
    const modelClass = builder.modelClass();

    builder.reject(
      modelClass.createValidationError({
        type: ValidationErrorType.UnallowedRelation,
        message: 'eager expression not allowed',
      }),
    );
  }
}

function findQueryExecutorOperation(builder: QueryBuilder): Operation | null {
  if ((builder.operationsSummary().hooks & HookBits.queryExecutor) === 0) {
    return null;
  }

  return builder.findOperation((op: Operation) => (op.hookMask() & HookBits.queryExecutor) !== 0);
}

function checkForUsage(builder: QueryBuilder): void {
  if (builder._forError !== null) {
    throw builder._forError;
  }
}

function doExecute(builder: QueryBuilder): unknown {
  builder = callOnBuildHooks(builder);
  const queryExecutorOperation = findQueryExecutorOperation(builder);

  const explicitRejectValue = builder._explicitRejectValue;
  const explicitResolveValue = builder._explicitResolveValue;

  if (explicitRejectValue !== null) {
    return Promise.reject(explicitRejectValue);
  } else if (explicitResolveValue !== null) {
    return explicitResolveValue;
  } else if (queryExecutorOperation !== null) {
    return queryExecutorOperation.queryExecutor(builder);
  } else {
    return runKnexQuery(builder);
  }
}

async function runKnexQuery(builder: QueryBuilder): Promise<unknown> {
  // The knex query builder is a thenable: awaiting it runs the query.
  let result: unknown = await buildKnexQuery(builder);

  result = runOperationHooks(builder, 'onRawResult', result);
  if (isPromise(result)) result = await result;

  return createModels(result, builder);
}

class ReturnImmediatelyException {
  declare value: unknown;

  constructor(value: unknown) {
    this.value = value;
  }
}

function handleReturnImmediatelyValue(builder: QueryBuilder): void {
  const { returnImmediatelyValue } = builder.internalOptions();
  if (returnImmediatelyValue !== undefined) {
    throw new ReturnImmediatelyException(returnImmediatelyValue);
  }
}

function handleExecuteError(builder: QueryBuilder, err: unknown): Promise<unknown> {
  if (err instanceof ReturnImmediatelyException) {
    return Promise.resolve(err.value);
  }

  let promise: Promise<unknown> = Promise.reject(wrapError(err as Error));

  builder.forEachOperation(true, (op) => {
    if (op.hasOnError()) {
      promise = promise.catch((err) =>
        builder.callAsyncOperationMethod(op, 'onError', [builder, err]),
      );
    }
  });

  return promise;
}

// Calls the `hookName` hook of every operation that has one, in order, each
// with the result of the previous one. The operations are collected when the
// phase starts, so ones that hooks add only take part in later phases.
function runOperationHooks(
  builder: QueryBuilder,
  hookName: PhaseHookName,
  result: unknown,
): unknown {
  const bit = HookBits[hookName];

  if ((builder.operationsSummary().hooks & bit) === 0) {
    return result;
  }

  let operations: Operation[] | null = null;

  builder.forEachOperation(true, (op) => {
    if ((op.hookMask() & bit) !== 0) {
      if (operations === null) {
        operations = [op];
      } else {
        operations.push(op);
      }
    }
  });

  if (operations === null) {
    return result;
  }

  return runOperationHooksFrom(builder, operations, 0, hookName, result);
}

function runOperationHooksFrom(
  builder: QueryBuilder,
  operations: Operation[],
  start: number,
  hookName: HookName,
  result: unknown,
): unknown {
  for (let i = start; i < operations.length; ++i) {
    const res = builder.callMaybeAsyncOperationMethod(operations[i], hookName, [builder, result]);
    handleReturnImmediatelyValue(builder);

    if (isPromise(res)) {
      return Promise.resolve(res).then((res) =>
        runOperationHooksFrom(builder, operations, i + 1, hookName, res),
      );
    }

    result = res;
  }

  return result;
}

function addJoinRelated<T extends QueryBuilder>(
  builder: T,
  joinOperation: string,
  expression: unknown,
  options: object | undefined,
): T {
  ensureJoinRelatedOperation(builder, joinOperation).addCall({ expression, options });
  return builder;
}

function ensureJoinRelatedOperation(
  builder: QueryBuilder,
  joinOperation: string,
): JoinRelatedOperation {
  const opName = joinOperation + 'Relation';
  // The operation named `opName` is the join related operation added below.
  let op = builder.findOperation(opName) as JoinRelatedOperation | null;

  if (!op) {
    op = new JoinRelatedOperation(opName, { joinOperation });
    builder.addOperation(op);
  }

  return op;
}

function prebuildQuery(builder: QueryBuilder): QueryBuilder {
  checkForUsage(builder);

  builder = addImplicitOperations(builder);
  builder = callOnBuildHooks(builder);

  const queryExecutorOperation = findQueryExecutorOperation(builder);

  if (queryExecutorOperation) {
    // The base hook returns nothing, but a query executor returns the query to run.
    return prebuildQuery(queryExecutorOperation.queryExecutor(builder) as unknown as QueryBuilder);
  } else {
    return builder;
  }
}

function addImplicitOperations(builder: QueryBuilder): QueryBuilder {
  if (builder.isFind()) {
    // If no write operations have been called at this point this query is a
    // find query and we need to call the custom find implementation.
    addFindOperation(builder);
  }

  if (builder.hasWithGraph()) {
    moveEagerOperationToEnd(builder);
  }

  return builder;
}

function addFindOperation(builder: QueryBuilder): void {
  if (!builder.operationsSummary().hasFindOperation) {
    const operation = builder._findOperationFactory(builder);
    builder.addOperationToFront(operation, []);
  }
}

function moveEagerOperationToEnd(builder: QueryBuilder): void {
  const eagerOp = builder.operationsSummary().eagerOperation;

  builder.clear(EagerOperation);
  builder.addOperation(eagerOp!);
}

function callOnBuildHooks(builder: QueryBuilder): QueryBuilder {
  callOnBuildFuncs(builder, builder.context().onBuild);
  callOnBuildFuncs(builder, builder.internalContext().onBuild);

  builder.executeOnBuild();
  return builder;
}

// `func` is a function or an array of functions and arrays.
function callOnBuildFuncs(builder: QueryBuilder, func: unknown): void {
  if (isFunction(func)) {
    (func as (this: QueryBuilder, builder: QueryBuilder) => void).call(builder, builder);
  } else if (Array.isArray(func)) {
    func.forEach((func) => callOnBuildFuncs(builder, func));
  }
}

function buildKnexQuery(
  builder: QueryBuilder,
  knexBuilder: KnexLike = builder.knex().queryBuilder(),
): KnexLike {
  knexBuilder = builder.executeOnBuildKnex(knexBuilder);

  const fromOperation = builder.operationsSummary().lastFromOperation;

  if (!builder.isPartial()) {
    // Set the table only if it hasn't been explicitly set yet.
    if (!fromOperation) {
      knexBuilder = setDefaultTable(builder, knexBuilder);
    }

    // Only add `table.*` select if there are no explicit selects
    // and `from` is a table name and not a subquery.
    // `fromRaw()` and `into()` aren't `FromOperation`s and have no `table`.
    if (
      !builder.hasSelects() &&
      (!fromOperation || (fromOperation as Partial<FromOperation>).table)
    ) {
      knexBuilder = setDefaultSelect(builder, knexBuilder);
    }
  }

  return knexBuilder;
}

function setDefaultTable(builder: QueryBuilder, knexBuilder: KnexLike): KnexLike {
  const table = builder.tableName();
  const tableRef = builder.tableRef();

  if (table === tableRef) {
    return knexBuilder.table(table);
  } else {
    return knexBuilder.table(`${table} as ${tableRef}`);
  }
}

function setDefaultSelect(builder: QueryBuilder, knexBuilder: KnexLike): KnexLike {
  const tableRef = builder.tableRef();

  return knexBuilder.select(`${tableRef}.*`);
}

// `func` is a function or an array of functions and arrays.
// `func` is a hook function or an array of functions and arrays. The arrays are
// read when they're reached, up to the length they have then.
function runHooks(builder: QueryBuilder, func: unknown, result: unknown): unknown {
  if (isFunction(func)) {
    const res = (
      func as (this: QueryBuilder, result: unknown, builder: QueryBuilder) => unknown
    ).call(builder, result, builder);
    handleReturnImmediatelyValue(builder);
    return res;
  } else if (Array.isArray(func) && func.length > 0) {
    return runHooksFrom(builder, func, 0, func.length, result);
  } else {
    return result;
  }
}

function runHooksFrom(
  builder: QueryBuilder,
  funcs: unknown[],
  start: number,
  end: number,
  result: unknown,
): unknown {
  for (let i = start; i < end; ++i) {
    const res = runHooks(builder, funcs[i], result);

    if (isPromise(res)) {
      return Promise.resolve(res).then((res) => runHooksFrom(builder, funcs, i + 1, end, res));
    }

    result = res;
  }

  return result;
}

function createModels(result: unknown, builder: QueryBuilder): unknown {
  if (result === null || result === undefined) {
    return null;
  }

  if (builder.isInsert()) {
    // results are applied to input models in `InsertOperation.onAfter1` instead.
    return result;
  }

  const modelClass = builder.resultModelClass();

  if (Array.isArray(result)) {
    if (result.length > 1 && shouldBeConvertedToModel(result[0], modelClass)) {
      createModelsFromDatabaseRows(modelClass, result);
    } else if (result.length === 1 && shouldBeConvertedToModel(result[0], modelClass)) {
      // One row costs less through `fromDatabaseJson()` than the lookup of
      // the writer of its class.
      result[0] = modelClass.fromDatabaseJson(result[0]);
    }
  } else if (shouldBeConvertedToModel(result, modelClass)) {
    result = modelClass.fromDatabaseJson(result);
  }

  return result;
}

function shouldBeConvertedToModel(obj: unknown, modelClass: ModelClass): boolean {
  return isObject(obj) && !(obj instanceof modelClass);
}

function writeOperation<T extends QueryBuilder>(builder: T, cb: () => unknown): T {
  if (!builder.isFind()) {
    return builder.reject(
      new Error(
        'Double call to a write method. ' +
          'You can only call one of the write methods ' +
          '(insert, update, patch, delete, relate, unrelate, increment, decrement) ' +
          'and only once per query builder.',
      ),
    );
  }

  try {
    cb();
    return builder;
  } catch (err) {
    return builder.reject(err);
  }
}

function findOperationFactory(): Operation {
  return new FindOperation('find');
}

function insertOperationFactory(): Operation {
  return new InsertOperation('insert');
}

function updateOperationFactory(): Operation {
  return new UpdateOperation('update');
}

function patchOperationFactory(): Operation {
  return new UpdateOperation('patch', {
    modelOptions: { patch: true },
  });
}

function relateOperationFactory(): Operation {
  // A plain query has no relation: the relation queries replace this factory.
  return new RelateOperation('relate', {} as RelationOperationOptions);
}

function unrelateOperationFactory(): Operation {
  // A plain query has no relation: the relation queries replace this factory.
  return new UnrelateOperation('unrelate', {} as RelationOperationOptions);
}

function deleteOperationFactory(): Operation {
  return new DeleteOperation('delete');
}

export { QueryBuilder };
