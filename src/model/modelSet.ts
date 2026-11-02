import { isInternalProp } from '../utils/internalPropUtils';
import { splitQueryProps } from './modelQueryProps';
import { isFunction, isString, isPlainObject } from '../utils/objectUtils';
import { parseRelationsIntoModelInstances } from './modelParseRelations';
import type { Model, ModelClass, ModelJson, ModelOptions } from './Model';
import type { Relation } from '../relations/Relation';

function setJson<M extends Model>(model: M, json: ModelJson, options: ModelOptions): M {
  json = json || {};
  options = options || {};

  if (Object.prototype.toString.call(json) !== '[object Object]') {
    throw new Error(
      'You should only pass objects to $setJson method. ' +
        '$setJson method was given an invalid value ' +
        json,
    );
  }

  if (!json.$isObjectionModel) {
    // json can contain "query properties" like `raw` instances, query builders etc.
    // We take them out of `json` and store them to a hidden property $$queryProps
    // in the model instance for later use.
    json = splitQueryProps(model, json);
  }

  json = model.$parseJson(json, options);
  json = model.$validate(json, options);

  model.$set(json);

  if (!options.skipParseRelations) {
    parseRelationsIntoModelInstances(model, json, options);
  }

  return model;
}

function setDatabaseJson<M extends Model>(model: M, json: ModelJson): M {
  json = model.$parseDatabaseJson(json);

  if (json) {
    const keys = Object.keys(json);

    for (let i = 0, l = keys.length; i < l; ++i) {
      const key = keys[i];
      (model as Model)[key] = json[key];
    }
  }

  return model;
}

function setFast<M extends Model>(model: M, obj: ModelJson | null | undefined): M {
  if (obj) {
    // Don't try to set read-only properties. They can easily get here
    // through `fromJson` when parsing an object that was previously
    // serialized from a model instance.
    const readOnlyAttr = (model.constructor as ModelClass).getReadOnlyAttributes();
    const keys = Object.keys(obj);

    for (let i = 0, l = keys.length; i < l; ++i) {
      const key = keys[i];
      const value: unknown = obj[key];

      if (
        (value !== undefined || isPlainObject(obj)) &&
        !isInternalProp(key) &&
        !isFunction(value) &&
        !readOnlyAttr.includes(key)
      ) {
        (model as Model)[key] = value;
      }
    }
  }

  return model;
}

function setRelated<M extends Model>(
  model: M,
  relation: Relation | string,
  models: Model | Model[] | null | undefined,
): M {
  relation = ensureRelation(model, relation);

  if (relation.isOneToOne()) {
    if (Array.isArray(models)) {
      if (models.length === 0) {
        (model as Model)[relation.name] = null;
      } else {
        (model as Model)[relation.name] = models[0] || null;
      }
    } else {
      (model as Model)[relation.name] = models || null;
    }
  } else {
    if (!models) {
      (model as Model)[relation.name] = [];
    } else if (Array.isArray(models)) {
      (model as Model)[relation.name] = models;
    } else {
      (model as Model)[relation.name] = [models];
    }
  }

  return model;
}

function appendRelated<M extends Model>(
  model: M,
  relation: Relation | string,
  models: Model | Model[] | null | undefined,
): M {
  relation = ensureRelation(model, relation);

  if (!(model as Model)[relation.name] || relation.isOneToOne()) {
    return model.$setRelated(relation, models);
  } else {
    if (Array.isArray(models)) {
      models.forEach((it) => ((model as Model)[relation.name] as Model[]).push(it));
    } else if (models) {
      ((model as Model)[relation.name] as Model[]).push(models);
    }
  }

  return model;
}

function ensureRelation(model: Model, relation: Relation | string): Relation {
  if (isString(relation)) {
    return (model.constructor as ModelClass).getRelation(relation as string);
  } else {
    return relation as Relation;
  }
}

export { setFast, setJson, setDatabaseJson, setRelated, appendRelated };
