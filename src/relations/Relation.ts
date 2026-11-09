import type { Knex } from 'knex';
import { withWhereScope } from '../queryBuilder/whereScopes';
import { RelationProperty } from './RelationProperty';

import { RelationFindOperation } from './RelationFindOperation';
import { RelationUpdateOperation } from './RelationUpdateOperation';
import { RelationDeleteOperation } from './RelationDeleteOperation';

import { resolveModel } from '../utils/resolveModel';
import { get, isFunction } from '../utils/objectUtils';
import { mapAfterAllReturn } from '../utils/promiseUtils';
import { createModifier } from '../utils/createModifier';

import type { RelationOwner } from './RelationOwner';
import type { Model } from '../model/Model';
import type { QueryBuilderOperation } from '../queryBuilder/operations/QueryBuilderOperation';

// The relations call and chain the query builder's methods dynamically.
export type RelationQueryBuilder = any;

// A model instance and a model class.
export type RelationModel = Model;
export type RelationModelClass = typeof Model;

// The query builder operation that `insert`, `relate` etc. return.
export type RelationOperation = QueryBuilderOperation;

// A relation's `modify` (or `filter`) after `createModifier`.
export type RelationModifier = (builder: RelationQueryBuilder, ...args: unknown[]) => void;

// A relation's (or join table's) `beforeInsert` hook.
export type RelationBeforeInsert = (model: RelationModel, queryContext: unknown) => unknown;

// The `opt` the relations pass to their operations.
export interface RelationOperationOptions<R extends Relation = Relation> {
  relation: R;
  owner: RelationOwner;
  modelOptions?: { patch?: boolean };
  dontCopyReturning?: boolean;
  dontCopyOnConflict?: boolean;
}

// An item of a ManyToManyRelation's `joinTableExtras`.
export interface JoinTableExtra {
  joinTableCol: string;
  joinTableProp: string;
  aliasCol: string;
  aliasProp: string;
}

export interface RelationJoinOptions {
  joinOperation?: string;
  relatedTableAlias?: string;
  relatedJoinSelectQuery?: RelationQueryBuilder;
  relatedTable?: string;
  ownerTable?: string;
  joinTableAlias?: string;
}

type RelationConstructor = new (relationName: string, OwnerClass: RelationModelClass) => Relation;

interface MappingContext {
  name: string;
  // The user's relation mapping, which is validated here.
  mapping: any;
  ownerModelClass: RelationModelClass;
  relatedModelClass: RelationModelClass | null;
  relatedProp: RelationProperty | null;
  ownerProp: RelationProperty | null;
  modify: RelationModifier | null | undefined;
  beforeInsert: RelationBeforeInsert | null;
  forbiddenMappingProperties: string[];
  createError: (msg: string) => Error;
}

class Relation {
  declare name: string;
  declare ownerModelClass: RelationModelClass;

  // These are null until `setMapping` is called, which is done right after
  // the relation is created.
  declare relatedModelClass: RelationModelClass;
  declare ownerProp: RelationProperty;
  declare relatedProp: RelationProperty;

  declare joinTableModelClass: RelationModelClass | null;
  declare joinTableOwnerProp: RelationProperty | null;
  declare joinTableRelatedProp: RelationProperty | null;
  declare joinTableBeforeInsert: RelationBeforeInsert | null;
  declare joinTableExtras: JoinTableExtra[];
  // Only many-to-many relations have one. `clone()` copies it.
  declare joinTableModify: RelationModifier | null | undefined;

  declare modify: RelationModifier | null | undefined;
  declare beforeInsert: RelationBeforeInsert;

  declare isObjectionRelation: boolean;
  declare static isObjectionRelationClass: boolean;

  constructor(relationName: string, OwnerClass: RelationModelClass) {
    this.name = relationName;
    this.ownerModelClass = OwnerClass;
    this.relatedModelClass = null!;

    this.ownerProp = null!;
    this.relatedProp = null!;

    this.joinTableModelClass = null;
    this.joinTableOwnerProp = null;
    this.joinTableRelatedProp = null;
    this.joinTableBeforeInsert = null;
    this.joinTableExtras = [];

    this.modify = null;
    this.beforeInsert = null!;
  }

  setMapping(mapping: unknown): void {
    let ctx: MappingContext = {
      name: this.name,
      mapping,
      ownerModelClass: this.ownerModelClass,
      relatedModelClass: null,
      relatedProp: null,
      ownerProp: null,
      modify: null,
      beforeInsert: null,
      forbiddenMappingProperties: this.forbiddenMappingProperties,
      createError: (msg) => this.createError(msg),
    };

    ctx = checkForbiddenProperties(ctx);
    ctx = checkOwnerModelClass(ctx);
    ctx = checkRelatedModelClass(ctx);
    ctx = resolveRelatedModelClass(ctx);
    ctx = checkRelation(ctx);
    ctx = createJoinProperties(ctx);
    ctx = parseModify(ctx);
    ctx = parseBeforeInsert(ctx);

    this.relatedModelClass = ctx.relatedModelClass!;
    this.ownerProp = ctx.ownerProp!;
    this.relatedProp = ctx.relatedProp!;
    this.modify = ctx.modify;
    this.beforeInsert = ctx.beforeInsert!;
  }

  get forbiddenMappingProperties(): string[] {
    return ['join.through'];
  }

  get joinTable(): string | null {
    return this.joinTableModelClass ? this.joinTableModelClass.getTableName() : null;
  }

  get joinModelClass(): RelationModelClass | null {
    return this.getJoinModelClass(this.ownerModelClass.knex());
  }

  getJoinModelClass(knex: Knex): RelationModelClass | null {
    return this.joinTableModelClass && knex !== this.joinTableModelClass.knex()
      ? this.joinTableModelClass.bindKnex(knex)
      : this.joinTableModelClass;
  }

  isOneToOne(): boolean {
    return false;
  }

  clone(): this {
    const relation = new (this.constructor as RelationConstructor)(
      this.name,
      this.ownerModelClass,
    ) as this;

    relation.relatedModelClass = this.relatedModelClass;
    relation.ownerProp = this.ownerProp;
    relation.relatedProp = this.relatedProp;
    relation.modify = this.modify;
    relation.beforeInsert = this.beforeInsert;

    relation.joinTableModelClass = this.joinTableModelClass;
    relation.joinTableOwnerProp = this.joinTableOwnerProp;
    relation.joinTableRelatedProp = this.joinTableRelatedProp;
    relation.joinTableBeforeInsert = this.joinTableBeforeInsert;
    relation.joinTableExtras = this.joinTableExtras;
    relation.joinTableModify = this.joinTableModify;

    return relation;
  }

  bindKnex(knex: Knex): this {
    const bound = this.clone();

    bound.relatedModelClass = this.relatedModelClass.bindKnex(knex);
    bound.ownerModelClass = this.ownerModelClass.bindKnex(knex);

    if (this.joinTableModelClass) {
      bound.joinTableModelClass = this.joinTableModelClass.bindKnex(knex);
    }

    return bound;
  }

  findQuery(builder: RelationQueryBuilder, owner: RelationOwner): RelationQueryBuilder {
    const relatedRefs = this.relatedProp.refs(builder);

    withWhereScope(builder, () => {
      owner.buildFindQuery(builder, this, relatedRefs);
    });

    return this.applyModify(builder);
  }

  applyModify(builder: RelationQueryBuilder): RelationQueryBuilder {
    try {
      // The relation's `modify` gets its own scope so that an `orWhere`
      // in it can't escape the owner condition.
      return withWhereScope(builder, () => builder.modify(this.modify));
    } catch (err) {
      if (err instanceof this.relatedModelClass.ModifierNotFoundError) {
        throw this.createError(err.message);
      } else {
        throw err;
      }
    }
  }

  join(
    builder: RelationQueryBuilder,
    {
      joinOperation = 'join',
      relatedTableAlias = builder.tableRefFor(this.relatedModelClass),
      relatedJoinSelectQuery = this.relatedModelClass.query().childQueryOf(builder),
      relatedTable = builder.tableNameFor(this.relatedModelClass),
      ownerTable = builder.tableRefFor(this.ownerModelClass),
    }: RelationJoinOptions = {},
  ): RelationQueryBuilder {
    let relatedJoinSelect = this.applyModify(relatedJoinSelectQuery).as(relatedTableAlias);

    if (relatedJoinSelect.isSelectAll()) {
      // No need to join a subquery if the query is `select * from "RelatedTable"`.
      relatedJoinSelect = aliasedTableName(relatedTable, relatedTableAlias);
    }

    return builder[joinOperation](relatedJoinSelect, (join: RelationQueryBuilder) => {
      const relatedProp = this.relatedProp;
      const ownerProp = this.ownerProp;

      relatedProp.forEach((i) => {
        const relatedRef = relatedProp.ref(builder, i).table(relatedTableAlias);
        const ownerRef = ownerProp.ref(builder, i).table(ownerTable);

        join.on(relatedRef, ownerRef);
      });
    });
  }

  find(_: RelationQueryBuilder, owner: RelationOwner): RelationFindOperation {
    return new RelationFindOperation('find', {
      relation: this,
      owner,
    });
  }

  insert(_: RelationQueryBuilder, owner: RelationOwner): RelationOperation {
    /* istanbul ignore next */
    throw this.createError('not implemented');
  }

  update(_: RelationQueryBuilder, owner: RelationOwner): RelationOperation {
    return new RelationUpdateOperation('update', {
      relation: this,
      owner,
    });
  }

  patch(_: RelationQueryBuilder, owner: RelationOwner): RelationOperation {
    return new RelationUpdateOperation('patch', {
      relation: this,
      owner,
      modelOptions: { patch: true },
    });
  }

  delete(_: RelationQueryBuilder, owner: RelationOwner): RelationOperation {
    return new RelationDeleteOperation('delete', {
      relation: this,
      owner,
    });
  }

  // The subclasses take the same arguments as `find`, these don't use them.
  relate(builder: RelationQueryBuilder, owner: RelationOwner): RelationOperation;
  relate(): RelationOperation {
    /* istanbul ignore next */
    throw this.createError('not implemented');
  }

  unrelate(builder: RelationQueryBuilder, owner: RelationOwner): RelationOperation;
  unrelate(): RelationOperation {
    /* istanbul ignore next */
    throw this.createError('not implemented');
  }

  hasRelateProp(model: RelationModel): boolean {
    return model.$hasProps(this.relatedProp.props);
  }

  setRelateProp(model: RelationModel, values: unknown[]): void {
    this.relatedProp.forEach((i) => {
      this.relatedProp.setProp(model, i, values[i]);
    });
  }

  executeBeforeInsert(models: RelationModel[], queryContext: unknown, result: unknown): unknown {
    return mapAfterAllReturn(
      models,
      (model: RelationModel) => this.beforeInsert(model, queryContext),
      result,
    );
  }

  createError(message: string): Error {
    if (this.ownerModelClass && this.ownerModelClass.name && this.name) {
      return new Error(`${this.ownerModelClass.name}.relationMappings.${this.name}: ${message}`);
    } else {
      return new Error(`${this.constructor.name}: ${message}`);
    }
  }
}

Object.defineProperties(Relation, {
  isObjectionRelationClass: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

Object.defineProperties(Relation.prototype, {
  isObjectionRelation: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

function checkForbiddenProperties(ctx: MappingContext): MappingContext {
  ctx.forbiddenMappingProperties.forEach((prop) => {
    if (get(ctx.mapping, prop.split('.')) !== undefined) {
      throw ctx.createError(`Property ${prop} is not supported for this relation type.`);
    }
  });

  return ctx;
}

function checkOwnerModelClass(ctx: MappingContext): MappingContext {
  if (!isFunction(ctx.ownerModelClass) || !ctx.ownerModelClass.isObjectionModelClass) {
    throw ctx.createError(`Relation's owner is not a subclass of Model`);
  }

  return ctx;
}

function checkRelatedModelClass(ctx: MappingContext): MappingContext {
  if (!ctx.mapping.modelClass) {
    throw ctx.createError('modelClass is not defined');
  }

  return ctx;
}

function resolveRelatedModelClass(ctx: MappingContext): MappingContext {
  let relatedModelClass: RelationModelClass;

  try {
    // undefined only for a relative path without `modelPaths`, which then
    // fails further on, as it did in the JavaScript code.
    relatedModelClass = resolveModel(
      ctx.mapping.modelClass,
      ctx.ownerModelClass.modelPaths,
      'modelClass',
    ) as RelationModelClass;
  } catch (err) {
    throw ctx.createError((err as Error).message);
  }

  return Object.assign(ctx, { relatedModelClass });
}

function checkRelation(ctx: MappingContext): MappingContext {
  if (!ctx.mapping.relation) {
    throw ctx.createError('relation is not defined');
  }

  if (!isFunction(ctx.mapping.relation) || !ctx.mapping.relation.isObjectionRelationClass) {
    throw ctx.createError('relation is not a subclass of Relation');
  }

  return ctx;
}

function createJoinProperties(ctx: MappingContext): MappingContext {
  const mapping = ctx.mapping;

  if (!mapping.join || !mapping.join.from || !mapping.join.to) {
    throw ctx.createError(
      'join must be an object that maps the columns of the related models together. For example: {from: "SomeTable.id", to: "SomeOtherTable.someModelId"}',
    );
  }

  const fromProp = createRelationProperty(ctx, mapping.join.from, 'join.from');
  const toProp = createRelationProperty(ctx, mapping.join.to, 'join.to');

  let ownerProp: RelationProperty;
  let relatedProp: RelationProperty;

  if (fromProp.modelClass.getTableName() === ctx.ownerModelClass.getTableName()) {
    ownerProp = fromProp;
    relatedProp = toProp;
  } else if (toProp.modelClass.getTableName() === ctx.ownerModelClass.getTableName()) {
    ownerProp = toProp;
    relatedProp = fromProp;
  } else {
    throw ctx.createError('join: either `from` or `to` must point to the owner model table.');
  }

  if (ownerProp.props.some((it) => it === ctx.name)) {
    throw ctx.createError(
      `join: relation name and join property '${ctx.name}' cannot have the same name. If you cannot change one or the other, you can use $parseDatabaseJson and $formatDatabaseJson methods to convert the column name.`,
    );
  }

  if (relatedProp.modelClass.getTableName() !== ctx.relatedModelClass!.getTableName()) {
    throw ctx.createError('join: either `from` or `to` must point to the related model table.');
  }

  return Object.assign(ctx, { ownerProp, relatedProp });
}

function createRelationProperty(
  ctx: MappingContext,
  refString: unknown,
  propName: string,
): RelationProperty {
  try {
    return new RelationProperty(refString, (table) => {
      return [ctx.ownerModelClass, ctx.relatedModelClass!].find(
        (it) => it.getTableName() === table,
      );
    });
  } catch (err) {
    if (err instanceof RelationProperty.ModelNotFoundError) {
      throw ctx.createError(
        `join: either \`from\` or \`to\` must point to the owner model table and the other one to the related table. It might be that specified table '${err.tableName}' is not correct`,
      );
    } else if (err instanceof RelationProperty.InvalidReferenceError) {
      throw ctx.createError(
        `${propName} must have format TableName.columnName. For example "SomeTable.id" or in case of composite key ["SomeTable.a", "SomeTable.b"].`,
      );
    } else {
      throw err;
    }
  }
}

function parseModify(ctx: MappingContext): MappingContext {
  const mapping = ctx.mapping;
  const modifier = mapping.modify || mapping.filter;
  const modify: RelationModifier | null | undefined =
    modifier &&
    createModifier({
      modifier,
      modelClass: ctx.relatedModelClass,
    });

  return Object.assign(ctx, { modify });
}

function parseBeforeInsert(ctx: MappingContext): MappingContext {
  let beforeInsert: RelationBeforeInsert;

  if (isFunction(ctx.mapping.beforeInsert)) {
    beforeInsert = ctx.mapping.beforeInsert;
  } else {
    beforeInsert = (model) => model;
  }

  return Object.assign(ctx, { beforeInsert });
}

function aliasedTableName(tableName: string, alias: string): string {
  if (tableName === alias) {
    return tableName;
  } else {
    return `${tableName} as ${alias}`;
  }
}

export { Relation };
