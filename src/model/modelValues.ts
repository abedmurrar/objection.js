import { isObject } from '../utils/objectUtils';
import type { Model } from './Model';

// Property keys needs to be prefixed with a non-numeric character so that
// they are not considered indexes when used as object keys.
const PROP_KEY_PREFIX = 'k_';

function values(model: Model, args: readonly string[]): unknown[] {
  switch (args.length) {
    case 1:
      return values1(model, args);
    case 2:
      return values2(model, args);
    case 3:
      return values3(model, args);
    default:
      return valuesN(model, args);
  }
}

function propKey(model: Model, props: readonly string[]): string {
  switch (props.length) {
    case 1:
      return propKey1(model, props);
    case 2:
      return propKey2(model, props);
    case 3:
      return propKey3(model, props);
    default:
      return propKeyN(model, props);
  }
}

function hasProps(model: Model, props: readonly string[]): boolean {
  for (let i = 0; i < props.length; ++i) {
    const value = model[props[i]];

    if (isNullOrUndefined(value)) {
      return false;
    }
  }

  return true;
}

function values1(model: Model, args: readonly string[]): unknown[] {
  return [model[args[0]]];
}

function values2(model: Model, args: readonly string[]): unknown[] {
  return [model[args[0]], model[args[1]]];
}

function values3(model: Model, args: readonly string[]): unknown[] {
  return [model[args[0]], model[args[1]], model[args[2]]];
}

function valuesN(model: Model, args: readonly string[]): unknown[] {
  const ret = new Array(args.length);

  for (let i = 0, l = args.length; i < l; ++i) {
    ret[i] = model[args[i]];
  }

  return ret;
}

function propKey1(model: Model, props: readonly string[]): string {
  return PROP_KEY_PREFIX + propToStr(model[props[0]]);
}

function propKey2(model: Model, props: readonly string[]): string {
  return PROP_KEY_PREFIX + propToStr(model[props[0]]) + ',' + propToStr(model[props[1]]);
}

function propKey3(model: Model, props: readonly string[]): string {
  return (
    PROP_KEY_PREFIX +
    propToStr(model[props[0]]) +
    ',' +
    propToStr(model[props[1]]) +
    ',' +
    propToStr(model[props[2]])
  );
}

function propKeyN(model: Model, props: readonly string[]): string {
  let key = PROP_KEY_PREFIX;

  for (let i = 0, l = props.length; i < l; ++i) {
    key += propToStr(model[props[i]]);

    if (i < l - 1) {
      key += ',';
    }
  }

  return key;
}

function propToStr(value: unknown): string {
  // Ids are almost always numbers or strings.
  const type = typeof value;

  if (type === 'string') {
    return value as string;
  } else if (type === 'number') {
    return `${value}`;
  } else if (value === null) {
    return 'null';
  } else if (value === undefined) {
    return 'undefined';
  } else if (Buffer.isBuffer(value)) {
    return value.toString('hex');
  } else if (isObject(value)) {
    return JSON.stringify(value);
  } else {
    return `${value}`;
  }
}

function isNullOrUndefined(val: unknown): val is null | undefined {
  return val === null || val === undefined;
}

export { PROP_KEY_PREFIX, propToStr, values, hasProps, propKey };
