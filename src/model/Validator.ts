import type { JsonSchema, Model, ModelJson, ModelOptions } from './Model';

// The arguments of the validator methods. `ctx` is an object the methods can
// use to pass data to each other.
interface ValidatorArgs {
  model: Model;
  json: ModelJson;
  options: ModelOptions;
  ctx: ValidatorContext;
}

interface ValidatorContext {
  jsonSchema?: JsonSchema | null;
  [key: string]: unknown;
}

class Validator {
  constructor(...args: unknown[]) {
    (this.constructor as typeof Validator).init(this, ...args);
  }

  static init(..._args: unknown[]): void {}

  beforeValidate({ model, json, options }: ValidatorArgs): void {
    model.$beforeValidate(null, json, options);
  }

  // A rest parameter keeps `validate.length` 0, as it was in JavaScript.
  validate(..._args: [args: ValidatorArgs]): ModelJson {
    /* istanbul ignore next */
    throw new Error('not implemented');
  }

  afterValidate({ model, json, options }: ValidatorArgs): void {
    model.$afterValidate(json, options);
  }
}

export { Validator };
export type { ValidatorArgs, ValidatorContext };
