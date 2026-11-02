import { asArray, isString, isFunction, isPlainObject } from './objectUtils';

// A query builder, as far as it's used here. Modifiers call any of its methods.
interface ModifierBuilder {
  where(condition: object): unknown;
}

type ModifierFunction = (
  this: ModifierBuilder,
  builder: ModifierBuilder,
  ...args: unknown[]
) => unknown;

// The parts of a model class that are used here.
interface ModifierModelClass {
  getModifiers(): Record<string, unknown>;
  modifierNotFound(builder: ModifierBuilder, modifier: unknown): unknown;
}

interface CreateModifierArgs {
  modelClass?: ModifierModelClass | null;
  // A modifier name, a function, an object of `where` conditions or an array
  // of any of them.
  modifier: unknown;
  modifiers?: Record<string, unknown> | null;
}

function createModifier({
  modelClass,
  modifier,
  modifiers,
}: CreateModifierArgs): (builder: ModifierBuilder, ...args: unknown[]) => void {
  const modelModifiers = modelClass ? modelClass.getModifiers() : {};

  const modifierFunctions = asArray(modifier).map((modifier): ModifierFunction => {
    let modify: unknown = null;

    if (isString(modifier)) {
      modify = (modifiers && modifiers[modifier]) || modelModifiers[modifier];

      // Modifiers can be pointers to other modifiers. Call this function recursively.
      if (modify && !isFunction(modify)) {
        return createModifier({ modelClass, modifier: modify, modifiers });
      }
    } else if (isFunction(modifier)) {
      modify = modifier;
    } else if (isPlainObject(modifier)) {
      modify = (builder: ModifierBuilder) => builder.where(modifier);
    } else if (Array.isArray(modifier)) {
      return createModifier({ modelClass, modifier, modifiers });
    }

    if (!modify) {
      // Without a model class this throws when the modifier is called, as it did
      // in the JavaScript code.
      modify = (builder: ModifierBuilder) => modelClass!.modifierNotFound(builder, modifier);
    }

    return modify as ModifierFunction;
  });

  return (builder, ...args) => {
    for (const modifier of modifierFunctions) {
      modifier.call(builder, builder, ...args);
    }
  };
}

export { createModifier };
