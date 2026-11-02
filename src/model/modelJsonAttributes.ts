import { asArray, flatten, isString } from '../utils/objectUtils';
import type { JsonSchema, ModelClass, ModelJson } from './Model';

function parseJsonAttributes(json: ModelJson, modelClass: ModelClass): ModelJson {
  const jsonAttr = modelClass.getJsonAttributes();

  if (jsonAttr.length) {
    // JSON attributes may be returned as strings depending on the database and
    // the database client. Convert them to objects here.
    for (let i = 0, l = jsonAttr.length; i < l; ++i) {
      const attr = jsonAttr[i];
      const value = json[attr];

      if (isString(value)) {
        const parsed = tryParseJson(value as string);

        // tryParseJson returns undefined if parsing failed.
        if (parsed !== undefined) {
          json[attr] = parsed;
        }
      }
    }
  }

  return json;
}

function formatJsonAttributes(json: ModelJson, modelClass: ModelClass): ModelJson {
  const jsonAttr = modelClass.getJsonAttributes();

  if (jsonAttr.length) {
    // All database clients want JSON columns as strings. Do the conversion here.
    for (let i = 0, l = jsonAttr.length; i < l; ++i) {
      const attr = jsonAttr[i];
      const value = json[attr];

      if (value != null) {
        json[attr] = JSON.stringify(value);
      }
    }
  }

  return json;
}

function getJsonAttributes(modelClass: ModelClass): string[] {
  let jsonAttributes = modelClass.jsonAttributes;

  if (Array.isArray(jsonAttributes)) {
    return jsonAttributes;
  }

  jsonAttributes = [];

  if (modelClass.getJsonSchema()) {
    const props: Record<string, JsonSchema> = modelClass.getJsonSchema()!.properties || {};

    for (const propName of Object.keys(props)) {
      const prop = props[propName];
      let types: unknown[] = asArray(prop.type).filter((it: unknown) => !!it);

      if (types.length === 0 && Array.isArray(prop.anyOf)) {
        types = flatten(prop.anyOf.map((it: JsonSchema) => it.type));
      }

      if (types.length === 0 && Array.isArray(prop.oneOf)) {
        types = flatten(prop.oneOf.map((it: JsonSchema) => it.type));
      }

      if (types.indexOf('object') !== -1 || types.indexOf('array') !== -1) {
        jsonAttributes.push(propName);
      }
    }
  }

  return jsonAttributes;
}

function tryParseJson(maybeJsonStr: string): unknown {
  try {
    return JSON.parse(maybeJsonStr);
  } catch (err) {
    return undefined;
  }
}

export { parseJsonAttributes, formatJsonAttributes, getJsonAttributes };
