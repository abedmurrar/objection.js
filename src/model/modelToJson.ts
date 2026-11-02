import { isInternalProp } from '../utils/internalPropUtils';
import { mergeQueryProps } from './modelQueryProps';
import { isObject, cloneDeep, isFunction } from '../utils/objectUtils';
import type { Model, ModelClass, ModelJson, ToJsonOptions } from './Model';
import type { QueryBuilder } from '../queryBuilder/QueryBuilder';
const EMPTY_ARRAY: string[] = [];

interface ToJsonImplOptions {
  virtuals: boolean | string[];
  shallow: boolean;
  omit: string[] | null;
  pick: Record<string, unknown> | null;
  omitFromJson: string[] | null;
  cloneObjects: boolean;
}

function toJson(model: Model, optIn: ToJsonOptions | undefined): ModelJson {
  const modelClass = model.constructor as ModelClass;

  const opt: ToJsonImplOptions = {
    virtuals: getVirtuals(optIn),
    shallow: isShallow(optIn),
    omit: getOmit(optIn, modelClass),
    pick: null,
    omitFromJson: model.$omitFromJson() || null,
    cloneObjects: modelClass.cloneObjectAttributes,
  };

  let json = toExternalJsonImpl(model, opt);
  json = model.$formatJson(json);

  return json;
}

function toDatabaseJson(model: Model, builder: QueryBuilder | undefined): ModelJson {
  const modelClass = model.constructor as ModelClass;

  const opt: ToJsonImplOptions = {
    virtuals: false,
    shallow: true,
    omit: modelClass.getRelationNames(),
    pick: getPick(modelClass),
    omitFromJson: model.$omitFromDatabaseJson() || null,
    cloneObjects: modelClass.cloneObjectAttributes,
  };

  let json = toDatabaseJsonImpl(model, opt);
  json = model.$formatDatabaseJson(json);

  return mergeQueryProps(model, json, opt.omitFromJson, builder);
}

function getVirtuals(opt: ToJsonOptions | undefined): boolean | string[] {
  if (!opt) {
    return true;
  } else if (Array.isArray(opt.virtuals)) {
    return opt.virtuals;
  } else {
    return opt.virtuals !== false;
  }
}

function isShallow(opt: ToJsonOptions | ToJsonImplOptions | undefined): boolean {
  return !!opt && !!opt.shallow;
}

function getOmit(opt: ToJsonOptions | undefined, modelClass: ModelClass): string[] | null {
  return isShallow(opt) ? modelClass.getRelationNames() : null;
}

function getPick(modelClass: ModelClass): Record<string, unknown> | null {
  const jsonSchema = modelClass.getJsonSchema();
  return (jsonSchema && modelClass.pickJsonSchemaProperties && jsonSchema.properties) || null;
}

function toExternalJsonImpl(model: Model, opt: ToJsonImplOptions): ModelJson {
  const json: ModelJson = {};
  const keys = Object.keys(model);
  const vAttr = getVirtualAttributes(model, opt);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    const value = model[key];

    assignJsonValue(json, key, value, opt);
  }

  if (vAttr.length !== 0) {
    assignVirtualAttributes(json, model, vAttr, opt);
  }

  return json;
}

function getVirtualAttributes(model: Model, opt: ToJsonImplOptions): string[] {
  if (Array.isArray(opt.virtuals)) {
    return opt.virtuals;
  } else if (opt.virtuals === true) {
    return (model.constructor as ModelClass).getVirtualAttributes();
  } else {
    return EMPTY_ARRAY;
  }
}

function toDatabaseJsonImpl(model: Model, opt: ToJsonImplOptions): ModelJson {
  const json: ModelJson = {};
  const keys = Object.keys(model);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    const value = model[key];

    assignJsonValue(json, key, value, opt);
  }

  return json;
}

function assignJsonValue(
  json: ModelJson,
  key: string,
  value: unknown,
  opt: ToJsonImplOptions,
): void {
  const type = typeof value;

  if (
    type !== 'function' &&
    type !== 'undefined' &&
    !isInternalProp(key) &&
    !shouldOmit(opt, key) &&
    shouldPick(opt, key)
  ) {
    if (isObject(value)) {
      json[key] = toJsonObject(value as object, opt);
    } else {
      json[key] = value;
    }
  }
}

function shouldOmit(opt: ToJsonImplOptions, key: string): boolean {
  return (
    (opt.omit !== null && opt.omit.includes(key)) ||
    (opt.omitFromJson !== null && opt.omitFromJson.includes(key))
  );
}

function shouldPick(opt: ToJsonImplOptions, key: string): boolean {
  return opt.pick === null || key in opt.pick;
}

function assignVirtualAttributes(
  json: ModelJson,
  model: Model,
  vAttr: string[],
  opt: ToJsonImplOptions,
): void {
  for (let i = 0, l = vAttr.length; i < l; ++i) {
    const key = vAttr[i];
    let value = model[key];

    if (isFunction(value)) {
      value = (value as (this: Model) => unknown).call(model);
    }

    assignJsonValue(json, key, value, opt);
  }
}

function toJsonObject(value: object, opt: ToJsonImplOptions): unknown {
  if (Array.isArray(value)) {
    return toJsonArray(value, opt);
  } else if ((value as Partial<Model>).$isObjectionModel) {
    // No branch for $toDatabaseJson here since there is never a need
    // to have nested models in database rows.
    return (value as Model).$toJson(opt);
  } else if (Buffer.isBuffer(value)) {
    return value;
  } else if (opt.cloneObjects) {
    return cloneDeep(value);
  } else {
    return value;
  }
}

function toJsonArray(value: unknown[], opt: ToJsonImplOptions): unknown[] {
  const ret = new Array(value.length);

  for (let i = 0, l = ret.length; i < l; ++i) {
    const item = value[i];

    if (isObject(item)) {
      ret[i] = toJsonObject(item as object, opt);
    } else {
      ret[i] = item;
    }
  }

  return ret;
}

export { toJson, toDatabaseJson };
