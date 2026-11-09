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
    // Strip away relations and other internal stuff. The model holds the
    // internal form, which is also what `$setJson` validates: it calls
    // `$parseJson` before `$validate`. `$toJson()` would give the external
    // form, without hidden properties and with virtual attributes.
    //
    // Unlike `$setJson`, this leaves out the relations, so validators that
    // read them see them in `insert()` but not in graph inserts and patches.
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
