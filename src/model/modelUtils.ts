import type { Model } from './Model';

const hiddenProps = ['$$queryProps'];

const staticHiddenProps = [
  '$$knex',
  '$$validator',
  '$$jsonSchema',
  '$$colToProp',
  '$$propToCol',
  '$$relationMappings',
  '$$relations',
  '$$relationNames',
  '$$jsonAttributes',
  '$$columnNameMappers',
  '$$tableMetadata',
  '$$readOnlyAttributes',
  '$$idRelationProperty',
  '$$virtualAttributes',
];

function defineNonEnumerableProperty(obj: object, prop: PropertyKey, value: unknown): void {
  Object.defineProperty(obj, prop, {
    enumerable: false,
    writable: true,
    configurable: true,
    value,
  });
}

function keyByProps<M extends Model>(
  models: readonly M[],
  props: readonly string[],
): Map<string, M> {
  const map = new Map<string, M>();

  for (let i = 0, l = models.length; i < l; ++i) {
    const model = models[i];
    map.set(model.$propKey(props), model);
  }

  return map;
}

export { hiddenProps, staticHiddenProps, defineNonEnumerableProperty, keyByProps };
