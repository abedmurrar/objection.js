import { isObject, cloneDeep } from '../utils/objectUtils';
import { hiddenProps } from './modelUtils';
import { defineNonEnumerableProperty } from './modelUtils';
import { isInternalProp } from '../utils/internalPropUtils';
import type { Model, ModelClass } from './Model';

function clone<M extends Model>(model: M, shallow: boolean, stripInternal: boolean): M {
  let clone: M | null = null;

  const omitFromJson = model.$omitFromJson();
  const omitFromDatabaseJson = model.$omitFromDatabaseJson();

  if (!shallow && !stripInternal) {
    clone = cloneSimple(model);
  } else {
    clone = cloneWithOpt(model, shallow, stripInternal);
  }

  if (omitFromJson) {
    clone.$omitFromJson(omitFromJson);
  }

  if (omitFromDatabaseJson) {
    clone.$omitFromDatabaseJson(omitFromDatabaseJson);
  }

  clone = copyHiddenProps(model, clone);
  return clone;
}

function cloneSimple<M extends Model>(model: M): M {
  const clone = new model.constructor() as M;
  const keys = Object.keys(model);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    const value = (model as Model)[key];

    if (isObject(value)) {
      (clone as Model)[key] = cloneObject(value as object);
    } else {
      (clone as Model)[key] = value;
    }
  }

  return clone;
}

function cloneWithOpt<M extends Model>(model: M, shallow: boolean, stripInternal: boolean): M {
  const clone = new model.constructor() as M;
  const keys = Object.keys(model);
  const relationNames = (model.constructor as ModelClass).getRelationNames();

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    const value = (model as Model)[key];

    if (shallow && relationNames.includes(key)) {
      // The constructor may have given default values for relations.
      delete (clone as Model)[key];
      continue;
    }

    if (stripInternal && isInternalProp(key)) {
      continue;
    }

    if (isObject(value)) {
      (clone as Model)[key] = cloneObject(value as object);
    } else {
      (clone as Model)[key] = value;
    }
  }

  return clone;
}

function cloneObject(value: object): unknown {
  if (Array.isArray(value)) {
    return cloneArray(value);
  } else if ((value as Partial<Model>).$isObjectionModel) {
    return clone(value as Model, false, false);
  } else if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  } else {
    return cloneDeep(value);
  }
}

function cloneArray(value: unknown[]): unknown[] {
  const ret = new Array(value.length);

  for (let i = 0, l = ret.length; i < l; ++i) {
    const item = value[i];

    if (isObject(item)) {
      ret[i] = cloneObject(item as object);
    } else {
      ret[i] = item;
    }
  }

  return ret;
}

function copyHiddenProps<M extends Model>(model: M, clone: M): M {
  for (let i = 0, l = hiddenProps.length; i < l; ++i) {
    const prop = hiddenProps[i];

    if (Object.hasOwn(model, prop)) {
      defineNonEnumerableProperty(clone, prop, (model as Model)[prop]);
    }
  }

  return clone;
}

export { clone };
