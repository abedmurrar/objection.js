import { clone } from './modelClone';
import type { Model, ModelClass, ModelJson, ModelOptions } from './Model';
import type { ValidatorArgs } from './Validator';

function validate(
  model: Model,
  json: ModelJson | null | undefined,
  options: ModelOptions = {},
): ModelJson {
  json = json || model;

  const inputJson = json;
  const validatingModelInstance = inputJson && inputJson.$isObjectionModel;

  if (options.skipValidation) {
    return json;
  }

  if (validatingModelInstance) {
    // Strip away relations and other internal stuff.
    // TODO 1: This should use `json.$toJson()` since we always validate the input representation!
    // TODO 2: This should also keep the relations in the object because some validators may
    //         depend on the relations.
    json = clone(json as Model, true, true);
    // We can mutate `json` now that we took a copy of it.
    options = Object.assign({}, options, { mutable: true });
  }

  const modelClass = model.constructor as ModelClass;
  const validator = modelClass.getValidator();
  const args: ValidatorArgs = {
    options,
    model,
    json,
    ctx: Object.create(null),
  };

  validator.beforeValidate(args);
  json = validator.validate(args);
  validator.afterValidate(args);

  if (validatingModelInstance) {
    // If we cloned `json`, we need to copy the possible default values.
    return (inputJson as Model).$set(json);
  } else {
    return json;
  }
}

export { validate };
