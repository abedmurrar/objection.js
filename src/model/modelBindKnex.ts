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
  let BoundModelClass = getBoundModelFromCache(modelClass, knex);

  if (BoundModelClass === null) {
    BoundModelClass = inheritModel(modelClass);
    BoundModelClass = copyHiddenProperties(modelClass, BoundModelClass);

    BoundModelClass.knex(knex);

    BoundModelClass = putBoundModelToCache(modelClass, BoundModelClass, knex);
    BoundModelClass = bindRelations(modelClass, BoundModelClass, knex);
  }

  return BoundModelClass;
}

function getBoundModelFromCache<M extends ModelClass>(modelClass: M, knex: Knex): M | null {
  const cache = getCache(knex);
  const cacheKey = modelClass.uniqueTag();

  return (cache.get(cacheKey) as M | undefined) || null;
}

function getCache(knex: KnexWithCache): Map<string, ModelClass> {
  if (!knex.$$objection) {
    createCache(knex);
  }

  return knex.$$objection!.boundModels;
}

function createCache(knex: KnexWithCache): void {
  defineNonEnumerableProperty(knex, '$$objection', {
    boundModels: new Map(),
  });
}

function copyHiddenProperties<M extends ModelClass>(modelClass: M, BoundModelClass: M): M {
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

  return BoundModelClass;
}

function putBoundModelToCache<M extends ModelClass>(
  modelClass: M,
  BoundModelClass: M,
  knex: Knex,
): M {
  const cache = getCache(knex);
  const cacheKey = modelClass.uniqueTag();

  cache.set(cacheKey, BoundModelClass);
  return BoundModelClass;
}

function bindRelations<M extends ModelClass>(modelClass: M, BoundModelClass: M, knex: Knex): M {
  const boundRelations: Record<string, Relation> = Object.create(null);

  for (const relationName of modelClass.getRelationNames()) {
    const relation = modelClass.getRelation(relationName);
    const boundRelation = relation.bindKnex(knex);

    boundRelations[relation.name] = boundRelation;
  }

  defineNonEnumerableProperty(BoundModelClass, '$$relations', boundRelations);

  return BoundModelClass;
}

export { bindKnex };
