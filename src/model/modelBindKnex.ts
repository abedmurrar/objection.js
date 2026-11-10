import { inheritModel } from './inheritModel';
import { staticHiddenProps } from './modelUtils';
import { defineNonEnumerableProperty } from './modelUtils';
import type { Knex } from 'knex';
import type { ModelClass } from './Model';
import type { Relation } from '../relations/Relation';

// The knex instance (or transaction) with the cache of the model classes bound to it.
type KnexWithCache = Knex & {
  $$objection?: {
    boundModels: Map<string, ModelClass>;
  };
};

function bindKnex<M extends ModelClass>(modelClass: M, knex: Knex): M {
  const cache = boundModels(knex);
  const cacheKey = modelClass.uniqueTag();
  let BoundModelClass = cache.get(cacheKey) as M | undefined;

  if (BoundModelClass === undefined) {
    BoundModelClass = inheritModel(modelClass);
    copyHiddenProperties(modelClass, BoundModelClass);
    BoundModelClass.knex(knex);

    // Cached before its relations are bound: binding them binds the related
    // model classes, whose relations can lead back to this one.
    cache.set(cacheKey, BoundModelClass);
    bindRelations(modelClass, BoundModelClass, knex);
  }

  return BoundModelClass;
}

// The model classes bound to a knex instance (or transaction), by their unique tag.
function boundModels(knex: KnexWithCache): Map<string, ModelClass> {
  if (!knex.$$objection) {
    defineNonEnumerableProperty(knex, '$$objection', { boundModels: new Map() });
  }

  return knex.$$objection!.boundModels;
}

function copyHiddenProperties(modelClass: ModelClass, BoundModelClass: ModelClass): void {
  // Bound classes share the validator of the class they are bound from, which
  // is copied below. Create it first, so that a class bound to a new knex
  // instance, like every transaction, doesn't create and compile a validator
  // of its own.
  if (!Object.hasOwn(modelClass, '$$validator')) {
    modelClass.getValidator();
  }

  for (const prop of staticHiddenProps) {
    // $$relations is bound separately, see `bindRelations()`.
    if (Object.hasOwn(modelClass, prop) && prop !== '$$relations') {
      defineNonEnumerableProperty(
        BoundModelClass,
        prop,
        (modelClass as unknown as Record<string, unknown>)[prop],
      );
    }
  }
}

function bindRelations(modelClass: ModelClass, BoundModelClass: ModelClass, knex: Knex): void {
  const boundRelations: Record<string, Relation> = Object.create(null);

  for (const relationName of modelClass.getRelationNames()) {
    const relation = modelClass.getRelation(relationName);
    const boundRelation = relation.bindKnex(knex);

    boundRelations[relation.name] = boundRelation;
  }

  defineNonEnumerableProperty(BoundModelClass, '$$relations', boundRelations);
}

export { bindKnex };
