import { withWhereScope } from './whereScopes';
import { wrapError } from 'db-errors';

import { raw } from './RawBuilder';
import { createModifier } from '../utils/createModifier';
import { ValidationErrorType } from '../model/ValidationError';
import { isObject, isFunction, last } from '../utils/objectUtils';
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

import type { KnexLike, ModelClass, Operation } from './QueryBuilderOperationSupport';
import type { FindOptions } from './operations/types';
import type { HookName } from './operations/QueryBuilderOperation';
import type { InstanceUpdateOperation } from './operations/InstanceUpdateOperation';
import type { RelationOperationOptions } from '../relations/Relation';

// A modifier: a function, the name of a modifier, an object of `where`
// conditions or an array of those. `any[]`: the modifier gets the arguments
// of `modify()` as they are.
type Modifier<B> = ((builder: B, ...args: any[]) => unknown) | string | object | null | undefined;

// Creates the operation that a write method (or a find query) adds.
type OperationFactory = (builder: QueryBuilder) => Operation;

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
    super.init(self, modelClass);

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
    return !!(this._explicitRejectValue || this._explicitResolveValue);
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
      // The same as below in one walk of the operations instead of five.
      return !this.has(isWriteOperation);
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
    return this.has(InsertOperation);
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
    return this.has(QueryBuilderBase.SelectSelector);
  }

  hasWithGraph(): boolean {
    const eagerOp = this.findOperation(EagerOperation);
    return !!eagerOp && !eagerOp.expression.isEmpty;
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
    const builder = this.emptyInstance();

    // Call the super class's clone implementation.
    this.baseCloneInto(builder);

    builder._resultModelClass = this._resultModelClass;

    builder._explicitRejectValue = this._explicitRejectValue;
    builder._explicitResolveValue = this._explicitResolveValue;
    builder._modifiers = { ...this._modifiers };

    builder._allowedGraphExpression = this._allowedGraphExpression;
    builder._findOperationOptions = this._findOperationOptions;
    builder._relatedQueryFor = this._relatedQueryFor;

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
      // The hooks run synchronously one after another, and a phase only waits
      // when a hook returns a promise. Most queries have no async hook, so this
      // saves a promise and a microtask per hook and phase.
      const runBefore = beforeExecute(builder);
      // As before, no hook runs inside the caller's call to `execute()`.
      await undefined;

      let result = runBefore();
      if (isPromise(result)) result = await result;

      result = doExecute(builder);
      if (isPromise(result)) result = await result;

      result = afterExecute(builder, result);
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
    const columnInfoQuery: KnexLike = knex(last(tableParts)).columnInfo();
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
    ensureJoinRelatedOperation(this, 'innerJoin').addCall({
      expression,
      options,
    });

    return this;
  }

  innerJoinRelated(expression: unknown, options?: object): this {
    ensureJoinRelatedOperation(this, 'innerJoin').addCall({
      expression,
      options,
    });

    return this;
  }

  outerJoinRelated(expression: unknown, options?: object): this {
    ensureJoinRelatedOperation(this, 'outerJoin').addCall({
      expression,
      options,
    });

    return this;
  }

  fullOuterJoinRelated(expression: unknown, options?: object): this {
    ensureJoinRelatedOperation(this, 'fullOuterJoin').addCall({
      expression,
      options,
    });

    return this;
  }

  leftJoinRelated(expression: unknown, options?: object): this {
    ensureJoinRelatedOperation(this, 'leftJoin').addCall({
      expression,
      options,
    });

    return this;
  }

  leftOuterJoinRelated(expression: unknown, options?: object): this {
    ensureJoinRelatedOperation(this, 'leftOuterJoin').addCall({
      expression,
      options,
    });

    return this;
  }

  rightJoinRelated(expression: unknown, options?: object): this {
    ensureJoinRelatedOperation(this, 'rightJoin').addCall({
      expression,
      options,
    });

    return this;
  }

  rightOuterJoinRelated(expression: unknown, options?: object): this {
    ensureJoinRelatedOperation(this, 'rightOuterJoin').addCall({
      expression,
      options,
    });

    return this;
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
  return builder.findOperation((op: Operation) => op.hasQueryExecutor());
}

function checkForUsage(builder: QueryBuilder): void {
  if (builder._forError !== null) {
    throw builder._forError;
  }
}

// Checks the query and adds the implicit operations, synchronously. Returns a
// function that runs the before hooks, which returns a promise only when a hook
// does. The `runBefore` hooks are read here, as when they were chained here.
function beforeExecute(builder: QueryBuilder): () => unknown {
  // This needs to be checked before any hooks are called.
  checkForUsage(builder);

  builder = addImplicitOperations(builder);

  const userRunBefore = builder.context().runBefore;
  const internalRunBefore = builder.internalContext().runBefore;

  return () =>
    then(runOperationHooks(builder, 'onBefore1', undefined), (result) =>
      then(runOperationHooks(builder, 'onBefore2', result), (result) =>
        then(runHooks(builder, userRunBefore, result), (result) =>
          then(runHooks(builder, internalRunBefore, result), (result) =>
            runOperationHooks(builder, 'onBefore3', result),
          ),
        ),
      ),
    );
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
    // The knex query builder is a thenable: resolving it runs the query.
    return Promise.resolve(buildKnexQuery(builder)).then((result) =>
      then(runOperationHooks(builder, 'onRawResult', result), (result) =>
        createModels(result, builder),
      ),
    );
  }
}

function afterExecute(builder: QueryBuilder, result: unknown): unknown {
  return then(runOperationHooks(builder, 'onAfter1', result), (result) =>
    then(runOperationHooks(builder, 'onAfter2', result), (result) => {
      const userRunAfter = builder.context().runAfter;
      const internalRunAfter = builder.internalContext().runAfter;

      return then(runHooks(builder, userRunAfter, result), (result) =>
        then(runHooks(builder, internalRunAfter, result), (result) =>
          runOperationHooks(builder, 'onAfter3', result),
        ),
      );
    }),
  );
}

// Calls `cb` with `value`, or with what it resolves to when it's a promise
// (or another thenable, like a query builder).
function then(value: unknown, cb: (value: unknown) => unknown): unknown {
  return isPromise(value) ? Promise.resolve(value).then(cb) : cb(value);
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
function runOperationHooks(builder: QueryBuilder, hookName: HookName, result: unknown): unknown {
  let operations: Operation[] | null = null;

  builder.forEachOperation(true, (op) => {
    if (op.hasHook(hookName)) {
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
  if (!builder.has(FindOperation)) {
    const operation = builder._findOperationFactory(builder);
    builder.addOperationToFront(operation, []);
  }
}

function moveEagerOperationToEnd(builder: QueryBuilder): void {
  const eagerOp = builder.findOperation(EagerOperation);

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

  const fromOperation = builder.findLastOperation(QueryBuilderBase.FromSelector);

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
    if (result.length && shouldBeConvertedToModel(result[0], modelClass)) {
      for (let i = 0, l = result.length; i < l; ++i) {
        result[i] = modelClass.fromDatabaseJson(result[i]);
      }
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
