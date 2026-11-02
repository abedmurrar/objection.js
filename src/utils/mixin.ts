import { flatten } from './objectUtils';

// A class or a function that takes a class and returns a new one.
type MixinArg = Function;
type MixinFunction = (Class: Function) => Function;

function mixin(...mixinArgs: (MixinArg | readonly MixinArg[])[]): Function {
  const args = flatten(mixinArgs);
  const mixins = args.slice(1) as MixinFunction[];

  return mixins.reduce((Class, mixinFunc) => {
    return mixinFunc(Class);
  }, args[0]);
}

function compose(...composeArgs: (MixinFunction | readonly MixinFunction[])[]): MixinFunction {
  const mixins = flatten(composeArgs);

  return function (Class: Function) {
    return mixin(Class, mixins);
  };
}

export { compose, mixin };
