import type { ModelClass } from './Model';

// Creates an empty subclass with the same name. A class defined as a computed
// property is named after the key, so the name needs no code built from it.
function inheritModel<M extends ModelClass>(modelClass: M): M {
  const name = modelClass.name;
  const BaseClass = modelClass as unknown as new (...args: any[]) => object;

  return { [name]: class extends BaseClass {} }[name] as unknown as M;
}

export { inheritModel };
