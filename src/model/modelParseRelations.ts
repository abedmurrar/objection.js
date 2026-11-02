import { isObject } from '../utils/objectUtils';
import type { Model, ModelClass, ModelJson, ModelOptions } from './Model';
import type { Relation } from '../relations/Relation';

// The options with the cache of the objects that were already converted into
// models, so that an object that appears many times in a graph becomes one model.
type ParseOptions = ModelOptions & { cache: Map<unknown, Model> };

function parseRelationsIntoModelInstances<M extends Model>(
  model: M,
  json: ModelJson,
  options: ModelOptions = {},
): M {
  const relationNames = (model.constructor as ModelClass).getRelationNames();

  if (!options.cache && !hasRelation(json, relationNames)) {
    // Nothing to parse. The cache would only be used for the relations.
    return model;
  }

  if (!options.cache) {
    options = Object.assign({}, options, {
      cache: new Map(),
    });
  }

  (options as ParseOptions).cache.set(json, model);

  for (const relationName of relationNames) {
    const relationJson = json[relationName];

    if (relationJson !== undefined) {
      const relation = (model.constructor as ModelClass).getRelation(relationName);
      const relationModel = parseRelation(relationJson, relation, options as ParseOptions);

      if (relationModel !== relationJson) {
        (model as Model)[relation.name] = relationModel;
      }
    }
  }

  return model;
}

function hasRelation(json: ModelJson, relationNames: string[]): boolean {
  for (let i = 0, l = relationNames.length; i < l; ++i) {
    if (json[relationNames[i]] !== undefined) {
      return true;
    }
  }

  return false;
}

function parseRelation(json: unknown, relation: Relation, options: ParseOptions): unknown {
  if (Array.isArray(json)) {
    return parseRelationArray(json, relation, options);
  } else if (json) {
    return parseRelationObject(json, relation, options);
  } else {
    return null;
  }
}

function parseRelationArray(json: unknown[], relation: Relation, options: ParseOptions): unknown[] {
  const models = new Array(json.length);
  let didChange = false;

  for (let i = 0, l = json.length; i < l; ++i) {
    const model = parseRelationObject(json[i], relation, options);

    if (model !== json[i]) {
      didChange = true;
    }

    models[i] = model;
  }

  if (didChange) {
    return models;
  } else {
    return json;
  }
}

function parseRelationObject(json: unknown, relation: Relation, options: ParseOptions): unknown {
  if (isObject(json)) {
    const modelClass = relation.relatedModelClass;
    let model = options.cache.get(json);

    if (model === undefined) {
      if (json instanceof modelClass) {
        model = parseRelationsIntoModelInstances(json, json, options);
      } else {
        model = modelClass.fromJson(json as ModelJson, options);
      }
    }

    return model;
  } else {
    return json;
  }
}

export { parseRelationsIntoModelInstances };
