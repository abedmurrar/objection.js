import { ref } from '../../queryBuilder/ReferenceBuilder';
import { isEmpty } from '../../utils/objectUtils';
import { isKnexRaw, isKnexQueryBuilder } from '../../utils/knexUtils';
import { toPgJsonPathLiteral, getJsonDialect } from '../../utils/postgresJsonPath';
import { toMySqlJsonPath, toJsonSql } from '../../utils/mysqlJsonPath';
import { QueryBuilderOperation } from './QueryBuilderOperation';
import { StaticHookArguments, hasStaticHook } from '../StaticHookArguments';
import type {
  KnexBuilder,
  Model,
  ModelOptions,
  OperationOptions,
  QueryBuilder,
  RawBinding,
} from './types';

class UpdateOperation extends QueryBuilderOperation {
  // `null` until `onAdd()`, which runs before all the other hooks. The hooks
  // need a model: `ensureModel()` returns `null` only when there's nothing to
  // update, and `InstanceUpdateOperation` uses its instance then.
  declare model: Model;
  declare modelOptions: ModelOptions;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);

    this.model = null!;
    this.modelOptions = Object.assign({}, this.opt.modelOptions || {});
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    const json = args[0];
    const modelClass = builder.modelClass();

    this.model = modelClass.ensureModel(json, this.modelOptions)!;
    return true;
  }

  async onBefore2(builder: QueryBuilder, result: unknown): Promise<unknown> {
    await callBeforeUpdate(builder, this.model, this.modelOptions);
    return result;
  }

  onBefore3(builder: QueryBuilder): void {
    const row = this.model.$toDatabaseJson(builder);

    if (isEmpty(row)) {
      // Resolve the query if there is nothing to update.
      builder.resolve(0);
    }
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const json = this.model.$toDatabaseJson(builder);
    const convertedJson = convertFieldExpressionsToRaw(builder, this.model, json);

    return knexBuilder.update(convertedJson);
  }

  onAfter2(builder: QueryBuilder, numUpdated: unknown): unknown {
    return callAfterUpdate(builder, this.model, this.modelOptions, numUpdated);
  }

  toFindOperation(): QueryBuilderOperation | null {
    return null;
  }

  clone(): this {
    const clone = super.clone();
    clone.model = this.model;
    return clone;
  }
}

// An item of the `access` path of a parsed field expression.
interface JsonAccess {
  readonly type: 'array' | 'object';
  readonly ref: string | number;
}

async function callBeforeUpdate(
  builder: QueryBuilder,
  model: Model,
  modelOptions: ModelOptions,
): Promise<unknown> {
  await callInstanceBeforeUpdate(builder, model, modelOptions);
  return callStaticBeforeUpdate(builder);
}

function callInstanceBeforeUpdate(
  builder: QueryBuilder,
  model: Model,
  modelOptions: ModelOptions,
): unknown {
  return model.$beforeUpdate(modelOptions, builder.context());
}

function callStaticBeforeUpdate(builder: QueryBuilder): unknown {
  if (!hasStaticHook(builder.modelClass(), 'beforeUpdate')) {
    return undefined;
  }

  const args = StaticHookArguments.create({ builder });
  return builder.modelClass().beforeUpdate(args);
}

async function callAfterUpdate(
  builder: QueryBuilder,
  model: Model,
  modelOptions: ModelOptions,
  result: unknown,
): Promise<unknown> {
  await callInstanceAfterUpdate(builder, model, modelOptions);
  return callStaticAfterUpdate(builder, result);
}

function callInstanceAfterUpdate(
  builder: QueryBuilder,
  model: Model,
  modelOptions: ModelOptions,
): unknown {
  return model.$afterUpdate(modelOptions, builder.context());
}

async function callStaticAfterUpdate(builder: QueryBuilder, result: unknown): Promise<unknown> {
  if (!hasStaticHook(builder.modelClass(), 'afterUpdate')) {
    return result;
  }

  const args = StaticHookArguments.create({ builder, result });
  const maybeResult = await builder.modelClass().afterUpdate(args);

  if (maybeResult === undefined) {
    return result;
  } else {
    return maybeResult;
  }
}

function convertFieldExpressionsToRaw(
  builder: QueryBuilder,
  model: Model,
  json: Record<string, unknown>,
): Record<string, unknown> {
  const knex = builder.knex();
  const convertedJson: Record<string, unknown> = {};

  for (const key of Object.keys(json)) {
    let val = json[key];

    if (key.indexOf(':') > -1) {
      // 'col:attr' : ref('other:lol') is transformed to
      // "col" : raw(`jsonb_set(COALESCE("col", '{}'), '{attr}', to_jsonb("other"#>'{lol}'), true)`)
      // on postgres and to
      // `col` : raw("JSON_SET(COALESCE(`col`, JSON_OBJECT()), '$.\"attr\"', JSON_EXTRACT(`other`, '$.\"lol\"'))")
      // on mysql. A NULL column is treated as an empty object (or array).

      const parsed: { column: string; parsedExpr: { access: readonly JsonAccess[] } } = ref(key);
      const access = parsed.parsedExpr.access;
      const isSqlValue = isKnexQueryBuilder(val) || isKnexRaw(val);
      // When the column is set by an earlier key, that expression is used instead.
      const target = convertedJson[parsed.column] || parsed.column;
      const isFirstSet = !convertedJson[parsed.column];

      if (!isSqlValue) {
        val = JSON.stringify(val);
      }

      if (getJsonDialect(knex, key) === 'mysql') {
        const empty = access[0].type === 'array' ? 'JSON_ARRAY()' : 'JSON_OBJECT()';
        const column = isFirstSet ? `COALESCE(??, ${empty})` : '??';
        const value = isSqlValue ? '?' : toJsonSql('?', knex);

        convertedJson[parsed.column] = knex.raw(`JSON_SET(${column}, ?, ${value})`, [
          target,
          toMySqlJsonPath(access),
          val,
        ] as RawBinding[]);
      } else {
        const empty = access[0].type === 'array' ? `'[]'::jsonb` : `'{}'::jsonb`;
        const column = isFirstSet ? `COALESCE(??, ${empty})` : '??';
        const value = isSqlValue ? 'to_jsonb(?)' : '?';

        convertedJson[parsed.column] = knex.raw(
          `jsonb_set(${column}, ${toPgJsonPathLiteral(access)}, ${value}, true)`,
          [target, val] as RawBinding[],
        );
      }

      delete model[key];
    } else {
      convertedJson[key] = val;
    }
  }

  return convertedJson;
}

export { UpdateOperation, convertFieldExpressionsToRaw };
