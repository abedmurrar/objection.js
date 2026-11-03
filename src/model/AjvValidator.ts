import Ajv from 'ajv';
import type { ErrorObject, Options, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { Validator } from './Validator';
import { ValidationErrorType } from '../model/ValidationError';
import { isObject, cloneDeep as cloneDeepValue, omit } from '../utils/objectUtils';
import type { JsonSchema, Model, ModelClass, ModelJson, ModelOptions } from './Model';
import type { ValidatorArgs } from './Validator';
import type { ValidationError } from './ValidationError';

// The Ajv options, and the options of older Ajv versions that people may still
// pass, like `v5` (which `Model.createValidator()` passes too).
type AjvValidatorOptions = Options & {
  serialize?: (schema: JsonSchema) => string;
  v5?: boolean;
};

interface AjvValidatorConfig {
  options?: AjvValidatorOptions;
  onCreateAjv?: (ajv: Ajv) => void;
}

interface CompiledValidators {
  patchValidator: ValidateFunction | null;
  normalValidator: ValidateFunction | null;
}

interface ValidationErrorItem {
  message: string | undefined;
  keyword: string;
  params: ErrorObject['params'];
  data?: unknown;
}

class AjvValidator extends Validator {
  declare ajvOptions: AjvValidatorOptions;
  declare ajv: Ajv;
  declare ajvNoDefaults: Ajv;
  declare cache: Map<string, CompiledValidators>;
  declare schemaCache: WeakMap<object, CompiledValidators>;

  static init(self: AjvValidator, conf: AjvValidatorConfig): void {
    super.init(self, conf);

    self.ajvOptions = Object.assign({}, conf.options, {
      allErrors: true,
    });

    // Create a normal Ajv instance.
    self.ajv = new Ajv(
      Object.assign(
        {
          useDefaults: true,
        },
        self.ajvOptions,
      ),
    );

    // Create an instance that doesn't set default values. We need this one
    // to validate `patch` objects (objects that have a subset of properties).
    self.ajvNoDefaults = new Ajv(
      Object.assign({}, self.ajvOptions, {
        useDefaults: false,
      }),
    );

    // Caches for the compiled validator functions: by the serialized schema,
    // and by the schema object for the schemas of model classes.
    self.cache = new Map();
    self.schemaCache = new WeakMap();

    const setupAjv = (ajv: Ajv) => {
      if (conf.onCreateAjv) {
        conf.onCreateAjv(ajv);
      }
      // Only add Ajv formats if they weren't added in user-space already
      if (!ajv.formats['date-time']) {
        addFormats(ajv);
      }
    };

    setupAjv(self.ajv);
    setupAjv(self.ajvNoDefaults);
  }

  beforeValidate({ json, model, options, ctx }: ValidatorArgs): void {
    ctx.jsonSchema = (model.constructor as ModelClass).getJsonSchema();

    // Objection model's have a `$beforeValidate` hook that is allowed to modify the schema.
    // We need to clone the schema in case the function modifies it. We only do this in the
    // rare case that the given model has implemented the hook.
    if (model.$beforeValidate !== model.$objectionModelClass.prototype.$beforeValidate) {
      ctx.jsonSchema = cloneDeep(ctx.jsonSchema) as JsonSchema | null;
      const ret = model.$beforeValidate(ctx.jsonSchema, json, options);

      if (ret !== undefined) {
        ctx.jsonSchema = ret;
      }
    }
  }

  validate({ json, model, options, ctx }: ValidatorArgs): ModelJson {
    if (!ctx.jsonSchema) {
      return json;
    }

    const modelClass = model.constructor as ModelClass;
    const validator = this.getValidator(modelClass, ctx.jsonSchema, !!options.patch);

    // We need to clone the input json if we are about to set default values.
    if (!options.mutable && !options.patch && setsDefaultValues(ctx.jsonSchema)) {
      json = cloneDeep(json) as ModelJson;
    }

    validator.call(model, json);
    const error = parseValidationError(validator.errors, modelClass, options, this.ajvOptions);

    if (error) {
      throw error;
    }

    return json;
  }

  getValidator(
    modelClass: ModelClass,
    jsonSchema: JsonSchema,
    isPatchObject: boolean,
  ): ValidateFunction {
    // Use the Ajv custom serializer if provided.
    const createCacheKey = this.ajvOptions.serialize || JSON.stringify;

    // The compiled validators are cached by the serialized schema. In the
    // common case where jsonSchema is the model class's own schema, they are
    // also cached by the schema object, so the costly createCacheKey function
    // runs once per schema object. Classes bound to a knex instance share their
    // validator with the class they are bound from, and a bound class can have
    // a schema of its own, so the cache isn't keyed by the class name.
    const isClassSchema = jsonSchema === modelClass.getJsonSchema() && isObject(jsonSchema);
    let validators = isClassSchema ? this.schemaCache.get(jsonSchema) : undefined;
    let validator: ValidateFunction | null = null;

    if (!validators) {
      const cacheKey = createCacheKey(jsonSchema);
      validators = this.cache.get(cacheKey);

      if (!validators) {
        validators = {
          // Validator created for the schema object without `required` properties
          // using the Ajv instance that doesn't set default values.
          patchValidator: null,

          // Validator created for the unmodified schema.
          normalValidator: null,
        };

        this.cache.set(cacheKey, validators);
      }

      if (isClassSchema) {
        this.schemaCache.set(jsonSchema, validators);
      }
    }

    if (isPatchObject) {
      validator = validators.patchValidator;

      if (!validator) {
        validator = this.compilePatchValidator(jsonSchema);
        validators.patchValidator = validator;
      }
    } else {
      validator = validators.normalValidator;

      if (!validator) {
        validator = this.compileNormalValidator(jsonSchema);
        validators.normalValidator = validator;
      }
    }

    return validator;
  }

  compilePatchValidator(jsonSchema: JsonSchema): ValidateFunction {
    jsonSchema = jsonSchemaWithoutRequired(jsonSchema);
    // We need to use the ajv instance that doesn't set the default values.
    return this.ajvNoDefaults.compile(jsonSchema);
  }

  compileNormalValidator(jsonSchema: JsonSchema): ValidateFunction {
    return this.ajv.compile(jsonSchema);
  }
}

function parseValidationError(
  errors: ErrorObject[] | null | undefined,
  modelClass: ModelClass,
  options: ModelOptions,
  ajvOptions: AjvValidatorOptions,
): ValidationError | null {
  if (!errors) {
    return null;
  }

  const relationNames = modelClass.getRelationNames();
  const errorHash: Record<string, ValidationErrorItem[]> = {};
  let numErrors = 0;

  for (const error of errors) {
    // If additionalProperties = false, relations can pop up as additionalProperty
    // errors. Skip those.
    if (
      error.params &&
      error.params.additionalProperty &&
      relationNames.includes(error.params.additionalProperty)
    ) {
      continue;
    }

    let path = error.instancePath.replace(/\//g, '.');

    if (error.params) {
      if (error.params.missingProperty) {
        path += `.${error.params.missingProperty}`;
      } else if (error.params.additionalProperty) {
        path += `.${error.params.additionalProperty}`;
      }
    }

    const key = `${options.dataPath || ''}${path}`.substring(1);

    // More than one error can occur for the same key in Ajv, merge them in the array:
    const array = errorHash[key] || (errorHash[key] = []);

    // Prepare error object
    const errorObj: ValidationErrorItem = {
      message: error.message,
      keyword: error.keyword,
      params: error.params,
    };

    // Add data if verbose enabled
    if (ajvOptions.verbose) {
      errorObj.data = error.data;
    }

    // Use unshift instead of push so that the last error ends up at [0],
    // preserving previous behavior where only the last error was stored.
    array.unshift(errorObj);

    ++numErrors;
  }

  if (numErrors === 0) {
    return null;
  }

  return modelClass.createValidationError({
    type: ValidationErrorType.ModelValidation,
    data: errorHash,
  });
}

function cloneDeep(obj: unknown): unknown {
  if (isObject(obj) && (obj as Partial<Model>).$isObjectionModel) {
    return (obj as Model).$clone();
  } else {
    return cloneDeepValue(obj);
  }
}

// Whether a schema has default values is checked for every validated model,
// so the answer is cached per schema object.
const setsDefaultValuesCache = new WeakMap<object, boolean>();

function setsDefaultValues(jsonSchema: JsonSchema): boolean {
  if (!isObject(jsonSchema as unknown)) {
    return jsonSchema && jsonSchema.properties && hasDefaults(jsonSchema.properties);
  }

  let result = setsDefaultValuesCache.get(jsonSchema);

  if (result === undefined) {
    result = !!(jsonSchema.properties && hasDefaults(jsonSchema.properties));
    setsDefaultValuesCache.set(jsonSchema, result);
  }

  return result;
}

function hasDefaults(obj: object): boolean {
  if (Array.isArray(obj)) {
    return arrayHasDefaults(obj);
  } else {
    return objectHasDefaults(obj as Record<string, unknown>);
  }
}

function arrayHasDefaults(arr: unknown[]): boolean {
  for (let i = 0, l = arr.length; i < l; ++i) {
    const val = arr[i];

    if (isObject(val) && hasDefaults(val as object)) {
      return true;
    }
  }

  return false;
}

function objectHasDefaults(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];

    if (key === 'default') {
      return true;
    } else {
      const val = obj[key];

      if (isObject(val) && hasDefaults(val as object)) {
        return true;
      }
    }
  }

  return false;
}

function jsonSchemaWithoutRequired(jsonSchema: JsonSchema): JsonSchema {
  // Boolean schemas (`true` / `false`) have no `required` to strip.
  if (!isObject(jsonSchema)) {
    return jsonSchema;
  }

  // `not` is intentionally left untouched: stripping `required` inside it
  // would turn it into a schema that rejects everything (e.g.
  // `not: { required: ['a'] }` -> `not: {}`). Kept as is, it still holds for
  // patches: any property present in the patch is also present in the
  // resulting object.
  const subSchemaProps = ['anyOf', 'oneOf', 'allOf', 'then', 'else', 'properties'];
  // `definitions` was renamed to `$defs` in draft 2019-09. Support both.
  const definitionProps = ['definitions', '$defs'];
  return Object.assign(
    omit(jsonSchema, ['required', ...subSchemaProps]),
    ...subSchemaProps.map((prop) => subSchemaWithoutRequired(jsonSchema, prop)),
    ...definitionProps.map((prop) => definitionsWithoutRequired(jsonSchema, prop)),
    jsonSchema.discriminator && jsonSchema.discriminator.propertyName
      ? { required: [jsonSchema.discriminator.propertyName] }
      : {},
  );
}

function definitionsWithoutRequired(jsonSchema: JsonSchema, prop: string): JsonSchema {
  const definitions = jsonSchema[prop] as Record<string, JsonSchema> | undefined;

  if (definitions && Object.keys(definitions).length > 0) {
    return {
      [prop]: Object.fromEntries(
        Object.entries(definitions).map(([key, schema]) => [key, jsonSchemaWithoutRequired(schema)]),
      ),
    };
  } else {
    return {};
  }
}

function subSchemaWithoutRequired(jsonSchema: JsonSchema, prop: string): JsonSchema {
  if (jsonSchema[prop] !== undefined) {
    if (Array.isArray(jsonSchema[prop])) {
      const schemaArray = (jsonSchema[prop] as JsonSchema[]).map(jsonSchemaWithoutRequired);
      const nonEmptySchemaArray = schemaArray.filter((schema) => !matchesAnything(schema));

      // An `anyOf` or `oneOf` option that only consisted of `required` is
      // empty once `required` is stripped, and an empty schema matches any
      // patch, just like the stripped `required` keywords elsewhere and the
      // `true` schema. Drop the whole keyword then: requiring the patch to
      // match one of the remaining options would reject valid patches, and
      // with `oneOf` keeping the empty option would fail every patch that also
      // matches another option.
      if (prop !== 'allOf' && nonEmptySchemaArray.length !== schemaArray.length) {
        return {};
      } else if (nonEmptySchemaArray.length !== 0) {
        return {
          [prop]: nonEmptySchemaArray,
        };
      } else {
        return {};
      }
    } else if (prop === 'properties') {
      // `properties` is a map of property names to schemas, regardless of the
      // schema's `type` (which may also be e.g. `['object', 'null']`, or be
      // missing entirely).
      return {
        [prop]: Object.fromEntries(
          Object.entries(jsonSchema[prop] as Record<string, JsonSchema>).map(([key, schema]) => [
            key,
            jsonSchemaWithoutRequired(schema),
          ]),
        ),
      };
    } else {
      return {
        [prop]: jsonSchemaWithoutRequired(jsonSchema[prop]),
      };
    }
  } else {
    return {};
  }
}

function matchesAnything(schema: unknown): boolean {
  return schema === true || (isObject(schema) && Object.keys(schema).length === 0);
}

export { AjvValidator };
export type { AjvValidatorConfig, AjvValidatorOptions };
