'use strict';

const { isObject } = require('../utils/objectUtils');

function parseRelationsIntoModelInstances(model, json, options = {}) {
  const relationNames = model.constructor.getRelationNames();

  if (!options.cache && !hasRelation(json, relationNames)) {
    // Nothing to parse. The cache would only be used for the relations.
    return model;
  }

  if (!options.cache) {
    options = Object.assign({}, options, {
      cache: new Map(),
    });
  }

  options.cache.set(json, model);

  for (const relationName of relationNames) {
    const relationJson = json[relationName];

    if (relationJson !== undefined) {
      const relation = model.constructor.getRelation(relationName);
      const relationModel = parseRelation(relationJson, relation, options);

      if (relationModel !== relationJson) {
        model[relation.name] = relationModel;
      }
    }
  }

  return model;
}

function hasRelation(json, relationNames) {
  for (let i = 0, l = relationNames.length; i < l; ++i) {
    if (json[relationNames[i]] !== undefined) {
      return true;
    }
  }

  return false;
}

function parseRelation(json, relation, options) {
  if (Array.isArray(json)) {
    return parseRelationArray(json, relation, options);
  } else if (json) {
    return parseRelationObject(json, relation, options);
  } else {
    return null;
  }
}

function parseRelationArray(json, relation, options) {
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

function parseRelationObject(json, relation, options) {
  if (isObject(json)) {
    const modelClass = relation.relatedModelClass;
    let model = options.cache.get(json);

    if (model === undefined) {
      if (json instanceof modelClass) {
        model = parseRelationsIntoModelInstances(json, json, options);
      } else {
        model = modelClass.fromJson(json, options);
      }
    }

    return model;
  } else {
    return json;
  }
}

module.exports = {
  parseRelationsIntoModelInstances,
};
