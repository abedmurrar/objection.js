import { withWhereScope } from '../../queryBuilder/whereScopes';
import { getModel } from '../../model/getModel';
import { Relation, aliasedTableName, mappingModifier, mappingBeforeInsert } from '../Relation';
import { RelationProperty } from '../RelationProperty';

import { isSqlite, isMySql } from '../../utils/knexUtils';
import { inheritModel } from '../../model/inheritModel';
import { resolveModel } from '../../utils/resolveModel';
import { mapAfterAllReturn } from '../../utils/promiseUtils';
import { isObject, isString } from '../../utils/objectUtils';

import { ManyToManyFindOperation } from './find/ManyToManyFindOperation';
import { ManyToManyInsertOperation } from './insert/ManyToManyInsertOperation';
import { ManyToManyRelateOperation } from './relate/ManyToManyRelateOperation';

import { ManyToManyUnrelateOperationBase } from './unrelate/ManyToManyUnrelateOperationBase';
import { ManyToManyUpdateOperationBase } from './update/ManyToManyUpdateOperationBase';
import { ManyToManyDeleteOperationBase } from './delete/ManyToManyDeleteOperationBase';
import { ManyToManyModifyMixin } from './ManyToManyModifyMixin';
import { ManyToManySqliteModifyMixin } from './ManyToManySqliteModifyMixin';
import { ManyToManyMySqlModifyMixin } from './ManyToManyMySqlModifyMixin';

import type {
  JoinTableExtra,
  RelationBeforeInsert,
  RelationJoinOptions,
  RelationModel,
  RelationModelClass,
  RelationModifier,
  RelationQueryBuilder,
} from '../Relation';
import type { RelationOwner } from '../RelationOwner';

interface MappingContext {
  // The user's relation mapping, which is validated here.
  mapping: any;
  ownerModelClass: RelationModelClass;
  relatedModelClass: RelationModelClass;
  ownerProp: RelationProperty;
  relatedProp: RelationProperty;

  joinTableModelClass: RelationModelClass | null;
  joinTableOwnerProp: RelationProperty | null;
  joinTableRelatedProp: RelationProperty | null;
  joinTableBeforeInsert: RelationBeforeInsert | null;
  joinTableExtras: JoinTableExtra[];
  joinTableModify?: RelationModifier | null;

  createError: (msg: string) => Error;
}

class ManyToManyRelation extends Relation {
  // These are set in `setMapping`.
  declare joinTableModelClass: RelationModelClass;
  declare joinTableOwnerProp: RelationProperty;
  declare joinTableRelatedProp: RelationProperty;
  declare joinTableBeforeInsert: RelationBeforeInsert;
  declare joinTableModify: RelationModifier | null | undefined;

  declare isObjectionManyToManyRelation: boolean;

  setMapping(mapping: unknown) {
    const retVal = super.setMapping(mapping);

    let ctx: MappingContext = {
      mapping,
      ownerModelClass: this.ownerModelClass,
      relatedModelClass: this.relatedModelClass,
      ownerProp: this.ownerProp,
      relatedProp: this.relatedProp,

      joinTableModelClass: null,
      joinTableOwnerProp: null,
      joinTableRelatedProp: null,
      joinTableBeforeInsert: null,
      joinTableExtras: [],

      createError: (msg) => this.createError(msg),
    };

    ctx = checkThroughObject(ctx);
    ctx = resolveJoinModelClassIfDefined(ctx);
    ctx = createJoinProperties(ctx);
    ctx = parseExtras(ctx);
    ctx = parseModify(ctx);
    ctx = parseBeforeInsert(ctx);
    ctx = finalizeJoinModelClass(ctx);

    this.joinTableExtras = ctx.joinTableExtras;
    this.joinTableModify = ctx.joinTableModify;
    this.joinTableModelClass = ctx.joinTableModelClass!;
    this.joinTableOwnerProp = ctx.joinTableOwnerProp!;
    this.joinTableRelatedProp = ctx.joinTableRelatedProp!;
    this.joinTableBeforeInsert = ctx.joinTableBeforeInsert!;

    return retVal;
  }

  get forbiddenMappingProperties(): string[] {
    return [];
  }

  findQuery(builder: RelationQueryBuilder, owner: RelationOwner): RelationQueryBuilder {
    const joinTableOwnerRefs = this.joinTableOwnerProp.refs(builder);
    const joinTable = builder.tableNameFor(this.joinTable);
    const joinTableAlias = builder.tableRefFor(this.joinTable);

    let joinTableSelect: RelationQueryBuilder = this.joinTableModelClass
      .query()
      .childQueryOf(builder)
      .modify(this.joinTableModify)
      .as(joinTableAlias);
    if (joinTableSelect.isSelectAll()) {
      joinTableSelect = aliasedTableName(joinTable, joinTableAlias);
    }

    builder.join(joinTableSelect, (join: RelationQueryBuilder) => {
      this.relatedProp.forEach((i) => {
        const relatedRef = this.relatedProp.ref(builder, i);
        const joinTableRelatedRef = this.joinTableRelatedProp.ref(builder, i);

        join.on(relatedRef, joinTableRelatedRef);
      });
    });

    withWhereScope(builder, () => {
      owner.buildFindQuery(builder, this, joinTableOwnerRefs);
    });

    return this.applyModify(builder);
  }

  join(
    builder: RelationQueryBuilder,
    {
      joinOperation = 'join',
      relatedTableAlias = builder.tableRefFor(this.relatedModelClass),
      relatedJoinSelectQuery = this.relatedModelClass.query().childQueryOf(builder),
      relatedTable = builder.tableNameFor(this.relatedModelClass),
      ownerTable = builder.tableRefFor(this.ownerModelClass),
      joinTableAlias = defaultJoinTableAlias(this, relatedTableAlias, builder),
    }: RelationJoinOptions = {},
  ): RelationQueryBuilder {
    let relatedJoinSelect = this.applyModify(relatedJoinSelectQuery).as(relatedTableAlias);

    if (relatedJoinSelect.isSelectAll()) {
      // No need to join a subquery if the query is `select * from "RelatedTable"`.
      relatedJoinSelect = aliasedTableName(relatedTable, relatedTableAlias);
    }

    let joinTableSelect: RelationQueryBuilder = this.joinTableModelClass
      .query()
      .childQueryOf(builder)
      .modify(this.joinTableModify)
      .as(joinTableAlias);
    if (joinTableSelect.isSelectAll()) {
      joinTableSelect = aliasedTableName(this.joinTable!, joinTableAlias);
    }

    return builder[joinOperation](joinTableSelect, (join: RelationQueryBuilder) => {
      const ownerProp = this.ownerProp;
      const joinTableOwnerProp = this.joinTableOwnerProp;

      ownerProp.forEach((i) => {
        const joinTableOwnerRef = joinTableOwnerProp.ref(builder, i).table(joinTableAlias);
        const ownerRef = ownerProp.ref(builder, i).table(ownerTable);

        join.on(joinTableOwnerRef, ownerRef);
      });
    })[joinOperation](relatedJoinSelect, (join: RelationQueryBuilder) => {
      const relatedProp = this.relatedProp;
      const joinTableRelatedProp = this.joinTableRelatedProp;

      relatedProp.forEach((i) => {
        const joinTableRelatedRef = joinTableRelatedProp.ref(builder, i).table(joinTableAlias);
        const relatedRef = relatedProp.ref(builder, i).table(relatedTableAlias);

        join.on(joinTableRelatedRef, relatedRef);
      });
    });
  }

  find(_: RelationQueryBuilder, owner: RelationOwner): ManyToManyFindOperation {
    return new ManyToManyFindOperation('find', {
      relation: this,
      owner,
    });
  }

  insert(_: RelationQueryBuilder, owner: RelationOwner): ManyToManyInsertOperation {
    return new ManyToManyInsertOperation('insert', {
      relation: this,
      owner,
    });
  }

  update(builder: RelationQueryBuilder, owner: RelationOwner): ManyToManyUpdateOperationBase {
    const Operation = dialectOperation(builder, UpdateOperations);
    return new Operation('update', { relation: this, owner });
  }

  patch(builder: RelationQueryBuilder, owner: RelationOwner): ManyToManyUpdateOperationBase {
    const Operation = dialectOperation(builder, UpdateOperations);
    return new Operation('patch', { modelOptions: { patch: true }, relation: this, owner });
  }

  delete(builder: RelationQueryBuilder, owner: RelationOwner): ManyToManyDeleteOperationBase {
    const Operation = dialectOperation(builder, DeleteOperations);
    return new Operation('delete', { relation: this, owner });
  }

  relate(builder: RelationQueryBuilder, owner: RelationOwner): ManyToManyRelateOperation {
    return new ManyToManyRelateOperation('relate', {
      relation: this,
      owner,
    });
  }

  unrelate(builder: RelationQueryBuilder, owner: RelationOwner): ManyToManyUnrelateOperationBase {
    const Operation = dialectOperation(builder, UnrelateOperations);
    return new Operation('unrelate', { relation: this, owner });
  }

  // `rel` is a related model, or an id object (see ManyToManyRelateOperation).
  createJoinModel(ownerId: unknown[], rel: Record<string, any>): Record<string, unknown> {
    const joinModel: Record<string, unknown> = {};

    for (let j = 0, lp = this.joinTableOwnerProp.size; j < lp; ++j) {
      this.joinTableOwnerProp.setProp(joinModel, j, ownerId[j]);
    }

    for (let j = 0, lp = this.joinTableRelatedProp.size; j < lp; ++j) {
      const value = this.relatedProp.getProp(rel, j);

      if (value !== undefined) {
        this.joinTableRelatedProp.setProp(joinModel, j, value);
      }
    }

    for (const extra of this.joinTableExtras) {
      let extraValue = rel[extra.aliasProp];

      if (extraValue === undefined && rel.$$queryProps) {
        extraValue = rel.$$queryProps[extra.aliasProp];
      }

      if (extraValue !== undefined) {
        joinModel[extra.joinTableProp] = extraValue;
      }
    }

    return joinModel;
  }

  omitExtraProps(models: RelationModel[]): void {
    if (this.joinTableExtras && this.joinTableExtras.length) {
      const props = this.joinTableExtras.map((extra) => extra.aliasProp);

      for (const model of models) {
        // Omit extra properties instead of deleting them from the models so that they can
        // be used in the `$before` and `$after` hooks.
        model.$omitFromDatabaseJson(props);
      }
    }
  }

  executeJoinTableBeforeInsert(
    models: RelationModel[],
    queryContext: unknown,
    result: unknown,
  ): unknown {
    return mapAfterAllReturn(
      models,
      (model: RelationModel) => this.joinTableBeforeInsert(model, queryContext),
      result,
    );
  }
}

Object.defineProperties(ManyToManyRelation.prototype, {
  isObjectionManyToManyRelation: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

// Called with the same arguments as the other defaults, which it doesn't use.
function defaultJoinTableAlias(
  relation: ManyToManyRelation,
  relatedTableAlias: string,
  builder: RelationQueryBuilder,
): string {
  const alias = builder.tableRefFor(relation.joinTable);

  if (alias === relation.joinTable) {
    return relation.ownerModelClass.joinTableAlias(relatedTableAlias);
  } else {
    return alias;
  }
}

function checkThroughObject(ctx: MappingContext): MappingContext {
  const mapping = ctx.mapping;

  if (!isObject(mapping.join.through)) {
    throw ctx.createError('join must have a `through` object that describes the join table.');
  }

  if (!mapping.join.through.from || !mapping.join.through.to) {
    throw ctx.createError(
      'join.through must be an object that describes the join table. For example: {from: "JoinTable.someId", to: "JoinTable.someOtherId"}',
    );
  }

  return ctx;
}

function resolveJoinModelClassIfDefined(ctx: MappingContext): MappingContext {
  let joinTableModelClass: RelationModelClass | null = null;

  if (ctx.mapping.join.through.modelClass) {
    try {
      // undefined only for a relative path without `modelPaths`, which then
      // fails further on, as it did in the JavaScript code.
      joinTableModelClass = resolveModel(
        ctx.mapping.join.through.modelClass,
        ctx.ownerModelClass.modelPaths,
        'join.through.modelClass',
      ) as RelationModelClass;
    } catch (err) {
      throw ctx.createError((err as Error).message);
    }
  }

  return Object.assign(ctx, { joinTableModelClass });
}

function createJoinProperties(ctx: MappingContext): MappingContext {
  let ret;

  let fromProp;
  let toProp;

  let relatedProp;
  let ownerProp;

  ret = createRelationProperty(ctx, ctx.mapping.join.through.from, 'join.through.from');
  fromProp = ret.prop;
  ctx = ret.ctx;

  ret = createRelationProperty(ctx, ctx.mapping.join.through.to, 'join.through.to');
  toProp = ret.prop;
  ctx = ret.ctx;

  if (fromProp.modelClass.getTableName() !== toProp.modelClass.getTableName()) {
    throw ctx.createError('join.through `from` and `to` must point to the same join table.');
  }

  if (ctx.relatedProp.modelClass.getTableName() === fromProp.modelClass.getTableName()) {
    relatedProp = fromProp;
    ownerProp = toProp;
  } else {
    relatedProp = toProp;
    ownerProp = fromProp;
  }

  return Object.assign(ctx, {
    joinTableOwnerProp: ownerProp,
    joinTableRelatedProp: relatedProp,
  });
}

function createRelationProperty(
  ctx: MappingContext,
  refString: unknown,
  messagePrefix: string,
): { ctx: MappingContext; prop: RelationProperty } {
  let prop: RelationProperty | null = null;
  let joinTableModelClass = ctx.joinTableModelClass;

  const resolveModelClass = (table: string): RelationModelClass | null => {
    if (joinTableModelClass === null) {
      joinTableModelClass = inheritModel(getModel()) as RelationModelClass;
      joinTableModelClass.tableName = table;
      joinTableModelClass.idColumn = null;
      joinTableModelClass.concurrency = ctx.ownerModelClass.concurrency;
    }

    if (joinTableModelClass.getTableName() === table) {
      return joinTableModelClass;
    } else {
      return null;
    }
  };

  try {
    prop = new RelationProperty(refString, resolveModelClass);
  } catch (err) {
    if (err instanceof RelationProperty.ModelNotFoundError) {
      throw ctx.createError('join.through `from` and `to` must point to the same join table.');
    } else {
      throw ctx.createError(
        `${messagePrefix} must have format JoinTable.columnName. For example "JoinTable.someId" or in case of composite key ["JoinTable.a", "JoinTable.b"].`,
      );
    }
  }

  return {
    ctx: Object.assign(ctx, { joinTableModelClass }),
    prop,
  };
}

function parseExtras(ctx: MappingContext): MappingContext {
  let extraDef = ctx.mapping.join.through.extra;

  if (!extraDef) {
    return ctx;
  }

  if (isString(extraDef)) {
    extraDef = {
      [extraDef]: extraDef,
    };
  } else if (Array.isArray(extraDef)) {
    extraDef = extraDef.reduce((extraDef: Record<string, string>, col: string) => {
      extraDef[col] = col;
      return extraDef;
    }, {});
  }

  const joinTableExtras = Object.keys(extraDef).map((key): JoinTableExtra => {
    const val = extraDef[key];

    return {
      joinTableCol: val,
      joinTableProp: ctx.joinTableModelClass!.columnNameToPropertyName(val),
      aliasCol: key,
      aliasProp: ctx.joinTableModelClass!.columnNameToPropertyName(key),
    };
  });

  return Object.assign(ctx, { joinTableExtras });
}

function parseModify(ctx: MappingContext): MappingContext {
  return Object.assign(ctx, {
    joinTableModify: mappingModifier(ctx.mapping.join.through, ctx.relatedModelClass),
  });
}

function parseBeforeInsert(ctx: MappingContext): MappingContext {
  return Object.assign(ctx, {
    joinTableBeforeInsert: mappingBeforeInsert(ctx.mapping.join.through),
  });
}

function finalizeJoinModelClass(ctx: MappingContext): MappingContext {
  if (ctx.joinTableModelClass!.getIdColumn() === null) {
    // We cannot know if the join table has a primary key. Therefore we set some
    // known column as the idColumn so that inserts will work.
    ctx.joinTableModelClass!.idColumn = ctx.joinTableRelatedProp!.cols;
  }

  return ctx;
}

export { ManyToManyRelation };

// The update, delete and unrelate operations of each database. SQLite and MySQL
// can't use the correlated subquery of `ManyToManyModifyMixin`, see their
// mixins. Deletes on MySQL only read the related table, which it allows.
const UpdateOperations = {
  sqlite: ManyToManySqliteModifyMixin(ManyToManyUpdateOperationBase),
  mysql: ManyToManyMySqlModifyMixin(ManyToManyUpdateOperationBase),
  other: ManyToManyModifyMixin(ManyToManyUpdateOperationBase),
};

const UnrelateOperations = {
  sqlite: ManyToManySqliteModifyMixin(ManyToManyUnrelateOperationBase),
  mysql: ManyToManyMySqlModifyMixin(ManyToManyUnrelateOperationBase),
  other: ManyToManyModifyMixin(ManyToManyUnrelateOperationBase),
};

const DefaultDeleteOperation = ManyToManyModifyMixin(ManyToManyDeleteOperationBase);

const DeleteOperations = {
  sqlite: ManyToManySqliteModifyMixin(ManyToManyDeleteOperationBase),
  mysql: DefaultDeleteOperation,
  other: DefaultDeleteOperation,
};

function dialectOperation<T>(
  builder: RelationQueryBuilder,
  { sqlite, mysql, other }: { sqlite: T; mysql: T; other: T },
): T {
  const knex = builder.knex();

  if (isSqlite(knex)) {
    return sqlite;
  } else if (isMySql(knex)) {
    return mysql;
  } else {
    return other;
  }
}
