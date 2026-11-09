import { clone } from './modelClone';
import { bindKnex } from './modelBindKnex';
import { validate } from './modelValidate';
import { isMsSql } from '../utils/knexUtils';
import { visitModels } from './modelVisitor';
import { hasId, getSetId } from './modelId';
import { toJson, toDatabaseJson } from './modelToJson';
import { values, propKey, hasProps } from './modelValues';
import { defineNonEnumerableProperty } from './modelUtils';
import { parseRelationsIntoModelInstances } from './modelParseRelations';
import { fetchTableMetadata, tableMetadata } from './modelTableMetadata';
import { asArray, isFunction, isString, asSingle } from '../utils/objectUtils';
import { setJson, setFast, setRelated, appendRelated, setDatabaseJson } from './modelSet';
import {
  getJsonAttributes,
  parseJsonAttributes,
  formatJsonAttributes,
} from './modelJsonAttributes';
import { columnNameToPropertyName, propertyNameToColumnName } from './modelColPropMap';

import { raw } from '../queryBuilder/RawBuilder';
import { ref } from '../queryBuilder/ReferenceBuilder';
import { fn } from '../queryBuilder/FunctionBuilder';

import { AjvValidator } from './AjvValidator';
import { QueryBuilder } from '../queryBuilder/QueryBuilder';
import { markDefaultStaticHook } from '../queryBuilder/StaticHookArguments';
import { NotFoundError } from './NotFoundError';
import { ValidationError } from './ValidationError';
import { ModifierNotFoundError } from './ModifierNotFoundError';
import { RelationProperty } from '../relations/RelationProperty';
import { RelationOwner } from '../relations/RelationOwner';

import { HasOneRelation } from '../relations/hasOne/HasOneRelation';
import { HasManyRelation } from '../relations/hasMany/HasManyRelation';
import { ManyToManyRelation } from '../relations/manyToMany/ManyToManyRelation';
import { BelongsToOneRelation } from '../relations/belongsToOne/BelongsToOneRelation';
import { HasOneThroughRelation } from '../relations/hasOneThrough/HasOneThroughRelation';

import { InstanceFindOperation } from '../queryBuilder/operations/InstanceFindOperation';
import { InstanceInsertOperation } from '../queryBuilder/operations/InstanceInsertOperation';
import { InstanceUpdateOperation } from '../queryBuilder/operations/InstanceUpdateOperation';
import { InstanceDeleteOperation } from '../queryBuilder/operations/InstanceDeleteOperation';

import type { Knex } from 'knex';
import type * as TransactionModule from '../transaction';
import type { Relation } from '../relations/Relation';
import type { QueryBuilderOperation } from '../queryBuilder/operations/QueryBuilderOperation';
import type { Validator } from './Validator';
import type { ValidationErrorArgs } from './ValidationError';
import type {
  TableMetadata,
  FetchTableMetadataOptions,
  TableMetadataOptions,
} from './modelTableMetadata';

// The JSON (or database row) a model is created from or converted into. Its
// properties are the user's columns and relations, which hold anything.
type ModelJson = Record<string, any>;

// A JSON schema. The keywords and their values are the user's, so they are
// `any`: the schema is read and rebuilt dynamically.
type JsonSchema = Record<string, any>;

// The options of `fromJson`, `$setJson`, `$validate` and the like.
interface ModelOptions {
  patch?: boolean;
  mutable?: boolean;
  skipValidation?: boolean;
  skipParseRelations?: boolean;
  dataPath?: string;
  cache?: Map<unknown, Model>;
  [option: string]: unknown;
}

interface ToJsonOptions {
  virtuals?: boolean | string[];
  shallow?: boolean;
}

interface ColumnNameMappers {
  parse(json: ModelJson): ModelJson;
  format(json: ModelJson): ModelJson;
}

// An operation of a related query, with the options `relatedQuery()` sets.
type Operation = QueryBuilderOperation & {
  assignResultToOwner?: boolean;
  alwaysReturnArray?: boolean;
  alias?: string | null;
};

type RelationClass = new (relationName: string, ownerModelClass: ModelClass) => Relation;

interface RelationMapping {
  relation: RelationClass;
  [key: string]: unknown;
}

type RelationMappings = Record<string, RelationMapping>;

// Any value, possibly a promise: what a static hook returns (`afterFind` can
// return a new result). It is `unknown` written as a union with `void`, so
// that the default hooks can have empty bodies.
type StaticHookResult = {} | null | void;

type TransactionCallback = (trx: Knex.Transaction) => void | Promise<unknown>;

type TraverseFilter = ModelClass | null;
type Traverser = (model: Model, parent: Model | null, relationName: string | null) => unknown;
type TraverseModels = Model | Model[] | null | undefined;

interface TraverseArgs {
  traverser: Traverser;
  models: TraverseModels;
  filterConstructor: TraverseFilter;
}

// What a model can be given in `$omitFromJson` and `$omitFromDatabaseJson`:
// property names, an array of them, or an object whose truthy keys are the names.
type OmitProps = (string | string[] | Record<string, unknown>)[];

// `this.constructor` of a model is its model class. A class can't declare a
// property named `constructor`, so it's declared here and merged into `Model`.
interface Model {
  constructor: ModelClass;
}

class Model {
  // The properties of a model instance are its columns and relations, which
  // hold anything the user puts there.
  [property: string]: any;

  declare readonly $isObjectionModel: boolean;
  declare readonly $objectionModelClass: typeof Model;
  declare $$omitFromJson?: string[];
  declare $$omitFromDatabaseJson?: string[];
  declare $$queryProps?: ModelJson;

  declare static readonly isObjectionModelClass: boolean;

  declare static QueryBuilder: typeof QueryBuilder;

  declare static HasOneRelation: typeof HasOneRelation;
  declare static HasManyRelation: typeof HasManyRelation;
  declare static ManyToManyRelation: typeof ManyToManyRelation;
  declare static BelongsToOneRelation: typeof BelongsToOneRelation;
  declare static HasOneThroughRelation: typeof HasOneThroughRelation;

  declare static JoinEagerAlgorithm: string;
  declare static NaiveEagerAlgorithm: string;
  declare static WhereInEagerAlgorithm: string;

  declare static ValidationError: typeof ValidationError;
  declare static NotFoundError: typeof NotFoundError;
  declare static ModifierNotFoundError: typeof ModifierNotFoundError;

  declare static tableName: string | (() => string) | null;
  declare static jsonSchema: JsonSchema | null;
  declare static idColumn: string | string[] | (() => string | string[]) | null;
  declare static uidProp: string;
  declare static uidRefProp: string;
  declare static dbRefProp: string;
  declare static propRefRegex: RegExp;
  declare static jsonAttributes: string[] | null;
  declare static cloneObjectAttributes: boolean;
  declare static virtualAttributes: string[] | null;
  declare static relationMappings: RelationMappings | (() => RelationMappings) | null;
  declare static modelPaths: string[];
  declare static pickJsonSchemaProperties: boolean;
  declare static defaultGraphOptions: Record<string, unknown> | null;
  declare static defaultFindOptions: Readonly<Record<string, unknown>>;
  declare static modifiers: Record<string, unknown> | null;
  declare static useLimitInFirst: boolean;
  // Calls the static `afterFind()` hook of the class for the models that
  // `withGraphJoined()` fetches, and assigns what the hook returns in
  // `withGraphJoined()` and `withGraphFetched()`. Off by default in 4.x.
  declare static useAfterFindInGraphs: boolean;
  declare static columnNameMappers: ColumnNameMappers | null;
  declare static relatedFindQueryMutates: boolean;
  declare static relatedInsertQueryMutates: boolean;
  declare static concurrency: number | (() => number) | null;

  // The hidden (non-enumerable) properties the static methods memoize per class.
  // See `staticHiddenProps` in modelUtils.
  declare static $$knex: Knex | undefined;
  declare static $$validator: Validator;
  declare static $$jsonSchema: JsonSchema | null;
  declare static $$colToProp: Map<string, string>;
  declare static $$propToCol: Map<string, string>;
  declare static $$relationMappings: RelationMappings;
  declare static $$relations: Record<string, Relation>;
  declare static $$relationArray: Relation[];
  declare static $$relationNames: string[];
  declare static $$jsonAttributes: string[];
  declare static $$columnNameMappers: ColumnNameMappers | null;
  declare static $$tableMetadata: Map<string, TableMetadata | Promise<TableMetadata>>;
  declare static $$readOnlyAttributes: string[];
  declare static $$idRelationProperty: RelationProperty;
  declare static $$virtualAttributes: string[];

  get $modelClass(): ModelClass {
    return this.constructor as ModelClass;
  }

  $id(maybeId?: unknown): unknown {
    return getSetId(this, maybeId);
  }

  $hasId(): boolean {
    return hasId(this);
  }

  $hasProps(props: readonly string[]): boolean {
    return hasProps(this, props);
  }

  $query(trx?: Knex): QueryBuilder {
    return instanceQuery({
      instance: this,
      transaction: trx,
    });
  }

  $relatedQuery(relationName: string, trx?: Knex): QueryBuilder {
    return relatedQuery({
      modelClass: this.constructor as ModelClass,
      relationName,
      transaction: trx,
      alwaysReturnArray: false,
    }).for(this);
  }

  $fetchGraph(relationExpression: unknown, options?: Record<string, unknown>): QueryBuilder {
    return (this.constructor as ModelClass).fetchGraph(this, relationExpression, options);
  }

  $beforeValidate(
    jsonSchema: JsonSchema | null,
    json: ModelJson,
    options: ModelOptions,
  ): JsonSchema | null | undefined {
    /* istanbul ignore next */
    return jsonSchema;
  }

  $validate(json?: ModelJson | null, options?: ModelOptions): ModelJson {
    return validate(this, json, options);
  }

  $afterValidate(json: ModelJson, options: ModelOptions): void {
    // Do nothing by default.
  }

  $parseDatabaseJson(json: ModelJson): ModelJson {
    const columnNameMappers = (this.constructor as ModelClass).getColumnNameMappers();

    if (columnNameMappers) {
      json = columnNameMappers.parse(json);
    }

    return parseJsonAttributes(json, this.constructor as ModelClass);
  }

  $formatDatabaseJson(json: ModelJson): ModelJson {
    const columnNameMappers = (this.constructor as ModelClass).getColumnNameMappers();

    json = formatJsonAttributes(json, this.constructor as ModelClass);

    if (columnNameMappers) {
      json = columnNameMappers.format(json);
    }

    return json;
  }

  $parseJson(json: ModelJson, options?: ModelOptions): ModelJson {
    return json;
  }

  $formatJson(json: ModelJson): ModelJson {
    return json;
  }

  $setJson(json: ModelJson, options?: ModelOptions): this {
    return setJson(this, json, options as ModelOptions);
  }

  $setDatabaseJson(json: ModelJson): this {
    return setDatabaseJson(this, json);
  }

  $set(obj: ModelJson | null | undefined): this {
    return setFast(this, obj);
  }

  $setRelated(relation: Relation | string, models: Model | Model[] | null | undefined): this {
    return setRelated(this, relation, models);
  }

  $appendRelated(relation: Relation | string, models: Model | Model[] | null | undefined): this {
    return appendRelated(this, relation, models);
  }

  $toJson(opt?: ToJsonOptions): ModelJson {
    return toJson(this, opt);
  }

  toJSON(opt?: ToJsonOptions): ModelJson {
    return this.$toJson(opt);
  }

  $toDatabaseJson(builder?: QueryBuilder): ModelJson {
    return toDatabaseJson(this, builder);
  }

  $beforeInsert(queryContext: unknown): Promise<unknown> | void {
    // Do nothing by default.
  }

  $afterInsert(queryContext: unknown): Promise<unknown> | void {
    // Do nothing by default.
  }

  $beforeUpdate(opt: ModelOptions, queryContext: unknown): Promise<unknown> | void {
    // Do nothing by default.
  }

  $afterUpdate(opt: ModelOptions, queryContext: unknown): Promise<unknown> | void {
    // Do nothing by default.
  }

  $afterFind(queryContext: unknown): Promise<unknown> | void {
    // Do nothing by default.
  }

  $beforeDelete(queryContext: unknown): Promise<unknown> | void {
    // Do nothing by default.
  }

  $afterDelete(queryContext: unknown): Promise<unknown> | void {
    // Do nothing by default.
  }

  $values(props: readonly string[]): unknown[] {
    return values(this, props);
  }

  $propKey(props: readonly string[]): string {
    return propKey(this, props);
  }

  $idKey(): string {
    return this.$propKey((this.constructor as ModelClass).getIdPropertyArray());
  }

  $clone(opt?: { shallow?: boolean }): this {
    return clone(this, !!(opt && opt.shallow), false);
  }

  $traverse(filterConstructor: TraverseFilter | Traverser, callback?: Traverser): this {
    if (callback === undefined) {
      callback = filterConstructor as Traverser;
      filterConstructor = null;
    }

    (this.constructor as ModelClass).traverse(filterConstructor as TraverseFilter, this, callback);
    return this;
  }

  $traverseAsync(
    filterConstructor: TraverseFilter | Traverser,
    callback?: Traverser,
  ): PromiseLike<unknown> {
    if (callback === undefined) {
      callback = filterConstructor as Traverser;
      filterConstructor = null;
    }

    return (this.constructor as ModelClass).traverseAsync(
      filterConstructor as TraverseFilter,
      this,
      callback,
    );
  }

  $omitFromJson(): string[] | undefined;
  $omitFromJson(...props: OmitProps): this;
  $omitFromJson(...props: OmitProps): string[] | undefined | this {
    if (props.length === 0) {
      return this.$$omitFromJson;
    } else {
      if (!Object.hasOwn(this, '$$omitFromJson')) {
        defineNonEnumerableProperty(this, '$$omitFromJson', []);
      }
      this.$$omitFromJson = this.$$omitFromJson!.concat(asPropsArray(props));
      return this;
    }
  }

  $omitFromDatabaseJson(): string[] | undefined;
  $omitFromDatabaseJson(...props: OmitProps): this;
  $omitFromDatabaseJson(...props: OmitProps): string[] | undefined | this {
    if (props.length === 0) {
      return this.$$omitFromDatabaseJson;
    } else {
      if (!Object.hasOwn(this, '$$omitFromDatabaseJson')) {
        defineNonEnumerableProperty(this, '$$omitFromDatabaseJson', []);
      }
      this.$$omitFromDatabaseJson = this.$$omitFromDatabaseJson!.concat(asPropsArray(props));
      return this;
    }
  }

  $knex(): Knex {
    return (this.constructor as ModelClass).knex();
  }

  $transaction(...args: Parameters<ModelClass['transaction']>): Promise<unknown> {
    return (this.constructor as ModelClass).transaction(...args);
  }

  get $ref(): ModelClass['ref'] {
    return (this.constructor as ModelClass).ref;
  }

  static get objectionModelClass(): typeof Model {
    return Model;
  }

  static fromJson(json: ModelJson | null | undefined, options?: ModelOptions): Model {
    const model = new this();
    model.$setJson(json || {}, options);
    return model;
  }

  static fromDatabaseJson(json: ModelJson | null | undefined): Model {
    const model = new this();
    model.$setDatabaseJson(json || {});
    return model;
  }

  static onCreateQuery(builder: QueryBuilder): void {
    // Do nothing by default.
  }

  static beforeFind(args: unknown): StaticHookResult {
    // Do nothing by default.
  }

  static afterFind(args: unknown): StaticHookResult {
    // Do nothing by default.
  }

  static beforeInsert(args: unknown): StaticHookResult {
    // Do nothing by default.
  }

  static afterInsert(args: unknown): StaticHookResult {
    // Do nothing by default.
  }

  static beforeUpdate(args: unknown): StaticHookResult {
    // Do nothing by default.
  }

  static afterUpdate(args: unknown): StaticHookResult {
    // Do nothing by default.
  }

  static beforeDelete(args: unknown): StaticHookResult {
    // Do nothing by default.
  }

  static afterDelete(args: unknown): StaticHookResult {
    // Do nothing by default.
  }

  static omitImpl(obj: Record<string, unknown>, prop: string): void {
    delete obj[prop];
  }

  static joinTableAlias(relationPath: string): string {
    return `${relationPath}_join`;
  }

  static createValidator(): Validator {
    return new AjvValidator({
      options: {
        allErrors: true,
        validateSchema: false,
        ownProperties: true,
        v5: true,
      },
    });
  }

  static modifierNotFound(builder: QueryBuilder, modifier: unknown): never {
    throw new this.ModifierNotFoundError(modifier);
  }

  static createNotFoundError(queryContext: unknown, props?: object): NotFoundError {
    return new this.NotFoundError({ ...props, modelClass: this });
  }

  static createValidationError(props: ValidationErrorArgs): ValidationError {
    return new this.ValidationError({ ...props, modelClass: this });
  }

  static getTableName(): string {
    let tableName = this.tableName;

    if (isFunction(tableName)) {
      tableName = (this.tableName as () => string)();
    }

    if (!isString(tableName)) {
      throw new Error(`Model ${this.name} must have a static property tableName`);
    }

    return tableName as string;
  }

  static getIdColumn(): string | string[] | null {
    let idColumn = this.idColumn;

    if (isFunction(idColumn)) {
      idColumn = (this.idColumn as () => string | string[])();
    }

    return idColumn as string | string[] | null;
  }

  static getValidator(): Validator {
    return cachedGet(this, '$$validator', getValidator);
  }

  static getJsonSchema(): JsonSchema | null {
    return cachedGet(this, '$$jsonSchema', getJsonSchema);
  }

  static getJsonAttributes(): string[] {
    return cachedGet(this, '$$jsonAttributes', getJsonAttributes);
  }

  static getColumnNameMappers(): ColumnNameMappers | null {
    return cachedGet(this, '$$columnNameMappers', getColumnNameMappers);
  }

  static getConcurrency(knex?: Knex | null): number {
    const DEFAULT_CONCURRENCY = 4;

    if (this.concurrency === null) {
      if (!knex) {
        return DEFAULT_CONCURRENCY;
      }

      // The mssql driver is shit, and we cannot have concurrent queries.
      if (isMsSql(knex)) {
        return 1;
      } else {
        return DEFAULT_CONCURRENCY;
      }
    } else {
      if (isFunction(this.concurrency)) {
        return (this.concurrency as () => number)();
      } else {
        return this.concurrency as number;
      }
    }
  }

  static getModifiers(): Record<string, unknown> {
    return this.modifiers || {};
  }

  static columnNameToPropertyName(columnName: string): string {
    const colToProp = cachedGet(this, '$$colToProp', () => new Map());
    let propertyName = colToProp.get(columnName);

    if (!propertyName) {
      propertyName = columnNameToPropertyName(this, columnName);
      colToProp.set(columnName, propertyName);
    }

    return propertyName;
  }

  static propertyNameToColumnName(propertyName: string): string {
    const propToCol = cachedGet(this, '$$propToCol', () => new Map());
    let columnName = propToCol.get(propertyName);

    if (!columnName) {
      columnName = propertyNameToColumnName(this, propertyName);
      propToCol.set(propertyName, columnName);
    }

    return columnName;
  }

  static getReadOnlyAttributes(): string[] {
    return cachedGet(this, '$$readOnlyAttributes', getReadOnlyAttributes);
  }

  static getIdRelationProperty(): RelationProperty {
    return cachedGet(this, '$$idRelationProperty', getIdRelationProperty);
  }

  static getIdColumnArray(): string[] {
    return this.getIdRelationProperty().cols;
  }

  static getIdPropertyArray(): string[] {
    return this.getIdRelationProperty().props;
  }

  static getIdProperty(): string | string[] {
    const idProps = this.getIdPropertyArray();

    if (idProps.length === 1) {
      return idProps[0];
    } else {
      return idProps;
    }
  }

  static getRelationMappings(): RelationMappings {
    return cachedGet(this, '$$relationMappings', getRelationMappings);
  }

  static getRelations(): Record<string, Relation> {
    const relations = Object.create(null);

    for (const relationName of this.getRelationNames()) {
      relations[relationName] = this.getRelation(relationName);
    }

    return relations;
  }

  static getRelationNames(): string[] {
    return cachedGet(this, '$$relationNames', getRelationNames);
  }

  static getVirtualAttributes(): string[] {
    return cachedGet(this, '$$virtualAttributes', getVirtualAttributes);
  }

  static getDefaultGraphOptions(): Record<string, unknown> | null {
    return this.defaultGraphOptions;
  }

  static getRelatedFindQueryMutates(): boolean {
    return this.relatedFindQueryMutates;
  }

  static getRelatedInsertQueryMutates(): boolean {
    return this.relatedInsertQueryMutates;
  }

  static query(trx?: Knex | null): QueryBuilder {
    const query = this.QueryBuilder.forClass(this).transacting(trx);
    this.onCreateQuery(query);
    return query;
  }

  static relatedQuery(relationName: string, trx?: Knex): QueryBuilder {
    return relatedQuery({
      modelClass: this,
      relationName,
      transaction: trx,
      alwaysReturnArray: true,
    });
  }

  static fetchTableMetadata(opt?: FetchTableMetadataOptions): Promise<TableMetadata> {
    return fetchTableMetadata(this, opt);
  }

  static tableMetadata(opt?: TableMetadataOptions): TableMetadata | null | undefined {
    return tableMetadata(this, opt);
  }

  static knex(): Knex;
  static knex(knex: Knex): void;
  static knex(...args: Knex[]): Knex | undefined | void {
    if (args.length) {
      defineNonEnumerableProperty(this, '$$knex', args[0]);
    } else {
      return this.$$knex;
    }
  }

  static transaction(
    knexOrTrx: Knex | TransactionCallback | null,
    cb?: TransactionCallback,
  ): Promise<unknown> {
    if (!cb) {
      cb = knexOrTrx as TransactionCallback;
      knexOrTrx = null;
    }

    return ((knexOrTrx as Knex | null) || this.knex()).transaction(cb);
  }

  static startTransaction(knexOrTrx?: Knex): Promise<Knex.Transaction> {
    const { transaction } = require('../transaction') as typeof TransactionModule;
    return transaction.start(knexOrTrx || this.knex());
  }

  static get raw(): typeof raw {
    return raw;
  }

  static get ref(): (...args: Parameters<typeof ref>) => ReturnType<typeof ref> {
    return (...args) => {
      return ref(...args).model(this);
    };
  }

  static get fn(): typeof fn {
    return fn;
  }

  static knexQuery(): Knex.QueryBuilder {
    return this.knex().table(this.getTableName());
  }

  static uniqueTag(): string {
    if (this.name) {
      return `${this.getTableName()}_${this.name}`;
    } else {
      return this.getTableName();
    }
  }

  static bindKnex(knex: Knex): ModelClass {
    return bindKnex(this, knex);
  }

  static bindTransaction(trx: Knex): ModelClass {
    return bindKnex(this, trx);
  }

  static ensureModel(model: unknown, options?: ModelOptions): Model | null {
    const modelClass = this;

    if (!model) {
      return null;
    }

    if (model instanceof modelClass) {
      return parseRelationsIntoModelInstances(model, model, options);
    } else {
      return modelClass.fromJson(model as ModelJson, options);
    }
  }

  static ensureModelArray(input: unknown, options?: ModelOptions): Model[] {
    if (!input) {
      return [];
    }

    if (Array.isArray(input)) {
      const models = new Array(input.length);

      for (let i = 0, l = input.length; i < l; ++i) {
        models[i] = this.ensureModel(input[i], options);
      }

      return models;
    } else {
      return [this.ensureModel(input, options)] as Model[];
    }
  }

  static getRelationUnsafe(name: string | null): Relation | null {
    const mapping = this.getRelationMappings()[name as string];

    if (!mapping) {
      return null;
    }

    if (!Object.hasOwn(this, '$$relations')) {
      defineNonEnumerableProperty(this, '$$relations', Object.create(null));
    }

    if (!this.$$relations[name as string]) {
      this.$$relations[name as string] = new mapping.relation(name as string, this);
      this.$$relations[name as string].setMapping(mapping);
    }

    return this.$$relations[name as string];
  }

  static getRelation(name: string): Relation {
    const relation = this.getRelationUnsafe(name);

    if (!relation) {
      throw new Error(`A model class ${this.name} doesn't have relation ${name}`);
    }

    return relation;
  }

  static fetchGraph(
    $models: unknown,
    expression: unknown,
    options: { transaction?: Knex; [option: string]: unknown } = {},
  ): QueryBuilder {
    return this.query(options.transaction)
      .resolve(this.ensureModelArray($models))
      .findOptions({ dontCallFindHooks: true })
      .withGraphFetched(expression, options)
      .runAfter((models: unknown) => (Array.isArray($models) ? models : (models as unknown[])[0]));
  }

  static traverse(
    ...args: [filterConstructor: unknown, models: unknown, traverser?: unknown]
  ): typeof Model | undefined {
    const { traverser, models, filterConstructor } = getTraverseArgs(...args);

    if (!asSingle(models)) {
      return;
    }

    const modelClass = asSingle(models)!.constructor;

    visitModels(models, modelClass, (model, _, parent, relation) => {
      if (!filterConstructor || model instanceof filterConstructor) {
        traverser(model, parent, relation && relation.name);
      }
    });

    return this;
  }

  static traverseAsync(
    ...args: [filterConstructor: unknown, models: unknown, traverser?: unknown]
  ): PromiseLike<unknown> {
    const { traverser, models, filterConstructor } = getTraverseArgs(...args);

    if (!asSingle(models)) {
      return Promise.resolve();
    }

    const modelClass = asSingle(models)!.constructor;
    const promises: unknown[] = [];

    visitModels(models, modelClass, (model, _, parent, relation) => {
      if (!filterConstructor || model instanceof filterConstructor) {
        const maybePromise = traverser(model, parent, relation && relation.name);
        promises.push(maybePromise);
      }
    });

    // The traversers have all been called above, so a concurrency limit here
    // would limit nothing.
    return Promise.all(promises);
  }
}

type ModelClass = typeof Model;

Object.defineProperties(Model, {
  isObjectionModelClass: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

Object.defineProperties(Model.prototype, {
  $isObjectionModel: {
    enumerable: false,
    writable: false,
    value: true,
  },

  $objectionModelClass: {
    enumerable: false,
    writable: false,
    value: Model,
  },
});

for (const hookName of [
  'beforeFind',
  'afterFind',
  'beforeInsert',
  'afterInsert',
  'beforeUpdate',
  'afterUpdate',
  'beforeDelete',
  'afterDelete',
] as const) {
  markDefaultStaticHook(Model[hookName]);
}

Model.QueryBuilder = QueryBuilder;

Model.HasOneRelation = HasOneRelation;
Model.HasManyRelation = HasManyRelation;
Model.ManyToManyRelation = ManyToManyRelation;
Model.BelongsToOneRelation = BelongsToOneRelation;
Model.HasOneThroughRelation = HasOneThroughRelation;

Model.JoinEagerAlgorithm = 'JoinEagerAlgorithm';
Model.NaiveEagerAlgorithm = 'NaiveEagerAlgorithm';
Model.WhereInEagerAlgorithm = 'WhereInEagerAlgorithm';

Model.ValidationError = ValidationError;
Model.NotFoundError = NotFoundError;
Model.ModifierNotFoundError = ModifierNotFoundError;

Model.tableName = null;
Model.jsonSchema = null;
Model.idColumn = 'id';
Model.uidProp = '#id';
Model.uidRefProp = '#ref';
Model.dbRefProp = '#dbRef';
Model.propRefRegex = /#ref{([^.]+)\.([^}]+)}/g;
Model.jsonAttributes = null;
Model.cloneObjectAttributes = true;
Model.virtualAttributes = null;
Model.relationMappings = null;
Model.modelPaths = [];
Model.pickJsonSchemaProperties = false;
Model.defaultGraphOptions = null;
Model.defaultFindOptions = Object.freeze({});
Model.modifiers = null;
Model.useLimitInFirst = false;
Model.useAfterFindInGraphs = false;
Model.columnNameMappers = null;
Model.relatedFindQueryMutates = false;
Model.relatedInsertQueryMutates = false;
Model.concurrency = null;

function instanceQuery({
  instance,
  transaction,
}: {
  instance: Model;
  transaction: Knex | undefined;
}): QueryBuilder {
  const modelClass = instance.constructor as ModelClass;

  return modelClass
    .query(transaction)
    .findOperationFactory(() => {
      return new InstanceFindOperation('find', { instance });
    })
    .insertOperationFactory(() => {
      return new InstanceInsertOperation('insert', { instance });
    })
    .updateOperationFactory(() => {
      return new InstanceUpdateOperation('update', { instance });
    })
    .patchOperationFactory(() => {
      return new InstanceUpdateOperation('patch', {
        instance,
        modelOptions: { patch: true },
      });
    })
    .deleteOperationFactory(() => {
      return new InstanceDeleteOperation('delete', { instance });
    })
    .relateOperationFactory(() => {
      throw new Error('`relate` makes no sense in this context');
    })
    .unrelateOperationFactory(() => {
      throw new Error('`unrelate` makes no sense in this context');
    });
}

interface RelatedQueryArgs {
  modelClass: ModelClass;
  relationName: string;
  transaction: Knex | undefined;
  alwaysReturnArray: boolean;
}

function relatedQuery(
  {
    modelClass,
    relationName,
    transaction,
    alwaysReturnArray,
  }: RelatedQueryArgs = {} as RelatedQueryArgs,
): QueryBuilder {
  const relation = modelClass.getRelation(relationName);
  const relatedModelClass = relation.relatedModelClass;

  const query = relatedModelClass
    .query(transaction)
    .findOperationFactory((builder) => {
      const isSubQuery = !builder.for();
      const owner = isSubQuery
        ? RelationOwner.createParentReference(builder, relation)
        : RelationOwner.create(builder.for());

      const operation = relation.find(builder, owner);

      operation.assignResultToOwner = modelClass.getRelatedFindQueryMutates();
      operation.alwaysReturnArray = alwaysReturnArray;
      operation.alias = isSubQuery ? relation.name : null;

      return operation;
    })
    .insertOperationFactory((builder) => {
      const owner = writeOperationOwner(builder, 'insert');
      const operation = relation.insert(builder, owner) as Operation;

      operation.assignResultToOwner = modelClass.getRelatedInsertQueryMutates();
      return operation;
    })
    .updateOperationFactory((builder) => {
      const owner = writeOperationOwner(builder, 'update');
      return relation.update(builder, owner);
    })
    .patchOperationFactory((builder) => {
      const owner = writeOperationOwner(builder, 'patch');
      return relation.patch(builder, owner);
    })
    .deleteOperationFactory((builder) => {
      const owner = writeOperationOwner(builder, 'delete');
      return relation.delete(builder, owner);
    })
    .relateOperationFactory((builder) => {
      const owner = writeOperationOwner(builder, 'relate');
      return relation.relate(builder, owner);
    })
    .unrelateOperationFactory((builder) => {
      const owner = writeOperationOwner(builder, 'unrelate');
      return relation.unrelate(builder, owner);
    });

  query._isRelatedQuery = true;
  return query;
}

function writeOperationOwner(builder: QueryBuilder, method: string): RelationOwner {
  const owner = builder.for();

  if ((owner === null || owner === undefined) && builder._forError === null) {
    // Without an owner the write would silently do nothing or, in the case
    // of inserts, create rows with null foreign keys. The error is thrown
    // when the query is built or executed.
    builder._forError = new Error(`relatedQuery(): for() must be called before ${method}()`);
  }

  return RelationOwner.create(owner);
}

// The names of the hidden static properties that are memoized with `cachedGet`.
type CachedStaticProp =
  | '$$validator'
  | '$$jsonSchema'
  | '$$jsonAttributes'
  | '$$columnNameMappers'
  | '$$colToProp'
  | '$$propToCol'
  | '$$readOnlyAttributes'
  | '$$idRelationProperty'
  | '$$relationMappings'
  | '$$relationNames'
  | '$$virtualAttributes';

function cachedGet<K extends CachedStaticProp>(
  target: ModelClass,
  hiddenPropertyName: K,
  creator: (modelClass: ModelClass) => ModelClass[K],
): ModelClass[K] {
  if (!Object.hasOwn(target, hiddenPropertyName)) {
    defineNonEnumerableProperty(target, hiddenPropertyName, creator(target));
  }

  return target[hiddenPropertyName];
}

function getValidator(modelClass: ModelClass): Validator {
  return modelClass.createValidator();
}

function getJsonSchema(modelClass: ModelClass): JsonSchema | null {
  return modelClass.jsonSchema;
}

function getColumnNameMappers(modelClass: ModelClass): ColumnNameMappers | null {
  return modelClass.columnNameMappers;
}

function getIdRelationProperty(modelClass: ModelClass): RelationProperty {
  const idColumn = asArray(modelClass.getIdColumn()) as string[];

  return new RelationProperty(
    idColumn.map((idCol) => `${modelClass.getTableName()}.${idCol}`),
    () => modelClass,
  );
}

function getReadOnlyAttributes(modelClass: ModelClass): string[] {
  return [...new Set(getReadOnlyAttributesRecursively(modelClass))];
}

function getReadOnlyAttributesRecursively(modelClass: ModelClass): string[] {
  if (modelClass === Model || modelClass.prototype == undefined) {
    // Stop recursion to the model class or its prototype is null or undefined.
    return [];
  }

  const propertyNames = Object.getOwnPropertyNames(modelClass.prototype);

  return [
    ...getReadOnlyAttributes(Object.getPrototypeOf(modelClass)),
    ...propertyNames.filter((propName) => {
      const desc = Object.getOwnPropertyDescriptor(
        modelClass.prototype,
        propName,
      ) as PropertyDescriptor;
      return (desc.get && !desc.set) || desc.writable === false || isFunction(desc.value);
    }),
  ];
}

function getRelationMappings(modelClass: ModelClass): RelationMappings {
  let relationMappings = modelClass.relationMappings;

  if (isFunction(relationMappings)) {
    relationMappings = (relationMappings as () => RelationMappings).call(modelClass);
  }

  return (relationMappings as RelationMappings | null) || {};
}

function getRelationNames(modelClass: ModelClass): string[] {
  return Object.keys(modelClass.getRelationMappings());
}

function getVirtualAttributes(modelClass: ModelClass): string[] {
  return modelClass.virtualAttributes || [];
}

function getTraverseArgs(
  filterConstructor: unknown,
  models: unknown,
  traverser?: unknown,
): TraverseArgs {
  filterConstructor = filterConstructor || null;

  if (traverser === undefined) {
    traverser = models as Traverser;
    models = filterConstructor as TraverseModels;
    filterConstructor = null;
  }

  if (!isFunction(traverser)) {
    throw new Error('traverser must be a function');
  }

  return {
    traverser,
    models,
    filterConstructor,
  } as TraverseArgs;
}

function asPropsArray(props: OmitProps): string[] {
  if (props.length === 1) {
    const arg = props[0];
    if (Array.isArray(arg)) {
      return arg;
    } else if (arg && typeof arg === 'object') {
      return Object.entries(arg)
        .filter(([, value]) => value)
        .map(([key]) => key);
    }
  }
  return props as string[];
}

export { Model };
export type {
  ModelClass,
  ModelJson,
  ModelOptions,
  JsonSchema,
  ToJsonOptions,
  ColumnNameMappers,
  RelationClass,
  RelationMapping,
  RelationMappings,
  TransactionCallback,
};
