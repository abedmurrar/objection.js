import { isObject, isFunction } from '../utils/objectUtils';
import { defineNonEnumerableProperty } from './modelUtils';
import { isKnexRaw, isKnexQueryBuilder } from '../utils/knexUtils';
import type { Model, ModelClass, ModelJson } from './Model';
import type { QueryBuilder } from '../queryBuilder/QueryBuilder';

const QUERY_PROPS_PROPERTY = '$$queryProps';

// Something that converts itself into a knex raw instance, like `raw()`,
// `ref()` and `fn()`.
interface KnexRawConvertable {
  toKnexRaw(builder: QueryBuilder): unknown;
}

// Removes query properties from `json` and stores them into a hidden property
// inside `model` so that they can be later merged back to `json`.
function splitQueryProps(model: Model, json: ModelJson): ModelJson {
  const keys = Object.keys(json);

  if (hasQueryProps(json, keys)) {
    const queryProps: ModelJson = {};
    const modelProps: ModelJson = {};

    for (let i = 0, l = keys.length; i < l; ++i) {
      const key = keys[i];
      const value = json[key];

      if (isQueryProp(value)) {
        queryProps[key] = value;
      } else {
        modelProps[key] = value;
      }
    }

    defineNonEnumerableProperty(model, QUERY_PROPS_PROPERTY, queryProps);

    return modelProps;
  } else {
    return json;
  }
}

function hasQueryProps(json: ModelJson, keys: string[]): boolean {
  for (let i = 0, l = keys.length; i < l; ++i) {
    if (isQueryProp(json[keys[i]])) {
      return true;
    }
  }

  return false;
}

function isQueryProp(value: unknown): boolean | undefined {
  if (!isObject(value)) {
    return false;
  }

  return (
    isKnexQueryBuilder(value) ||
    isKnexRaw(value) ||
    isKnexRawConvertable(value as object) ||
    (value as { isObjectionQueryBuilderBase?: boolean }).isObjectionQueryBuilderBase
  );
}

// Merges and converts `model`'s query properties into `json`.
function mergeQueryProps(
  model: Model,
  json: ModelJson,
  omitProps: string[] | null,
  builder: QueryBuilder | undefined,
): ModelJson {
  json = convertExistingQueryProps(json, builder);
  json = convertAndMergeHiddenQueryProps(model, json, omitProps, builder);

  return json;
}

// Converts the query properties in `json` to knex raw instances.
// `json` may have query properties even though we removed them.
// For example they may have been added in lifecycle hooks.
function convertExistingQueryProps(json: ModelJson, builder: QueryBuilder | undefined): ModelJson {
  const keys = Object.keys(json);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    const value = json[key];

    if (isQueryProp(value)) {
      json[key] = queryPropToKnexRaw(value, builder);
    }
  }

  return json;
}

// Converts and merges the query props that were split from the model
// and stored into QUERY_PROPS_PROPERTY.
function convertAndMergeHiddenQueryProps(
  model: Model,
  json: ModelJson,
  omitProps: string[] | null,
  builder: QueryBuilder | undefined,
): ModelJson {
  const queryProps = model[QUERY_PROPS_PROPERTY];

  if (!queryProps) {
    // The model has no query properties.
    return json;
  }

  const modelClass = model.constructor as ModelClass;
  const keys = Object.keys(queryProps);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];

    if (!omitProps || !omitProps.includes(key)) {
      const queryProp = queryPropToKnexRaw(queryProps[key], builder);
      json[modelClass.propertyNameToColumnName(key)] = queryProp;
    }
  }

  return json;
}

// Converts a query property into a knex `raw` instance.
function queryPropToKnexRaw(queryProp: unknown, builder: QueryBuilder | undefined): unknown {
  if (!queryProp) {
    return queryProp;
  }

  if ((queryProp as { isObjectionQueryBuilderBase?: boolean }).isObjectionQueryBuilderBase) {
    return buildObjectionQueryBuilder(queryProp as QueryBuilder, builder);
  } else if (isKnexRawConvertable(queryProp as object)) {
    return buildKnexRawConvertable(queryProp as KnexRawConvertable, builder);
  } else {
    return queryProp;
  }
}

function buildObjectionQueryBuilder(
  builder: QueryBuilder,
  parentBuilder: QueryBuilder | undefined,
): unknown {
  return builder.subqueryOf(parentBuilder).toKnexQuery();
}

function buildKnexRawConvertable(
  convertable: KnexRawConvertable,
  builder: QueryBuilder | undefined,
): unknown {
  if (!builder) {
    throw new Error(
      'toDatabaseJson called without a query builder instance for a model with query properties',
    );
  }

  return convertable.toKnexRaw(builder);
}

function isKnexRawConvertable(queryProp: object): boolean {
  return isFunction((queryProp as Partial<KnexRawConvertable>).toKnexRaw);
}

export { splitQueryProps, mergeQueryProps };
