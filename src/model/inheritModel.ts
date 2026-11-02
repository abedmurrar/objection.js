import type { ModelClass } from './Model';

type ClassInheritor = <M extends ModelClass>(BaseClass: M) => M;

const cache = new Map<string, ClassInheritor>();

function inheritModel<M extends ModelClass>(modelClass: M): M {
  let inherit = cache.get(modelClass.name);

  if (!inherit) {
    inherit = createClassInheritor(modelClass.name);
    cache.set(modelClass.name, inherit);
  }

  return inherit(modelClass);
}

function createClassInheritor(className: string): ClassInheritor {
  return new Function(
    'BaseClass',
    `
    'use strict';
    return class ${className} extends BaseClass {}
  `,
  ) as ClassInheritor;
}

export { inheritModel };
