import { getKeyMapper } from '../utils/identifierMapping';
import { tryParseJson } from './modelJsonAttributes';
import type { Model, ModelClass } from './Model';

// How the rows of a query become models of a class that keeps the default
// `fromDatabaseJson()`, `$setDatabaseJson()` and `$parseDatabaseJson()`, and
// whose column name mappers, if any, come from `snakeCaseMappers()`: the
// columns are written to the model directly, with the same key mapping and
// JSON parsing, instead of through a mapped copy of the row and three method
// calls for each row.
interface DatabaseRowWriter {
  mapKey: ((key: string) => string) | null;
  jsonAttributes: Set<string> | null;
  jsonAttributeList: string[];
}

const jsonAttributeSets = new WeakMap<string[], Set<string>>();

// The writer of each model class, with the methods it was found for. A class
// is checked once, and a change of its methods, e.g. in tests, is noticed.
interface CachedRowWriter {
  fromDatabaseJson: unknown;
  setDatabaseJson: unknown;
  parseDatabaseJson: unknown;
  writer: DatabaseRowWriter | null;
}

const rowWriters = new WeakMap<ModelClass, CachedRowWriter>();

// The writer of `modelClass`, or undefined if it hasn't been found yet.
function cachedDatabaseRowWriter(modelClass: ModelClass): DatabaseRowWriter | null | undefined {
  const cached = rowWriters.get(modelClass);

  if (
    cached !== undefined &&
    cached.fromDatabaseJson === modelClass.fromDatabaseJson &&
    cached.setDatabaseJson === modelClass.prototype.$setDatabaseJson &&
    cached.parseDatabaseJson === modelClass.prototype.$parseDatabaseJson
  ) {
    return cached.writer;
  }

  return undefined;
}

// Whether `modelClass` keeps the default `fromDatabaseJson()`. Checked before a
// model is created, since an override may create it differently.
function hasDefaultFromDatabaseJson(modelClass: ModelClass): boolean {
  return modelClass.fromDatabaseJson === modelClass.objectionModelClass.fromDatabaseJson;
}

// Finds and caches the writer of `modelClass`. `model` is a new model of it,
// or null if the class overrides `fromDatabaseJson()`. The model shows whether
// an instance overrides one of the other methods, e.g. with a class field.
function findDatabaseRowWriter(
  modelClass: ModelClass,
  model: Model | null,
): DatabaseRowWriter | null {
  const writer = model === null ? null : createDatabaseRowWriter(modelClass, model);

  rowWriters.set(modelClass, {
    fromDatabaseJson: modelClass.fromDatabaseJson,
    setDatabaseJson: modelClass.prototype.$setDatabaseJson,
    parseDatabaseJson: modelClass.prototype.$parseDatabaseJson,
    writer,
  });

  return writer;
}

function createDatabaseRowWriter(modelClass: ModelClass, model: Model): DatabaseRowWriter | null {
  const base = model.$objectionModelClass;

  if (
    !hasDefaultFromDatabaseJson(modelClass) ||
    model.$setDatabaseJson !== base.prototype.$setDatabaseJson ||
    model.$parseDatabaseJson !== base.prototype.$parseDatabaseJson
  ) {
    return null;
  }

  const columnNameMappers = modelClass.getColumnNameMappers();
  let mapKey: ((key: string) => string) | null = null;

  if (columnNameMappers) {
    const keyMapper = getKeyMapper(columnNameMappers.parse);

    if (keyMapper === undefined) {
      return null;
    }

    mapKey = keyMapper;
  }

  return {
    mapKey,
    jsonAttributes: getJsonAttributeSet(modelClass),
    jsonAttributeList: modelClass.getJsonAttributes(),
  };
}

function getJsonAttributeSet(modelClass: ModelClass): Set<string> | null {
  const jsonAttributes = modelClass.getJsonAttributes();

  if (jsonAttributes.length === 0) {
    return null;
  }

  let set = jsonAttributeSets.get(jsonAttributes);

  if (set === undefined) {
    set = new Set(jsonAttributes);
    jsonAttributeSets.set(jsonAttributes, set);
  }

  return set;
}

// The property of a column.
function columnProperty(writer: DatabaseRowWriter, column: string): string {
  return writer.mapKey === null ? column : writer.mapKey(column);
}

// Whether the value of a property is parsed as JSON.
function isJsonProperty(writer: DatabaseRowWriter, prop: string): boolean {
  return writer.jsonAttributes !== null && writer.jsonAttributes.has(prop);
}

// JSON attributes may be returned as strings depending on the database and the
// database client.
function parseJsonValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = tryParseJson(value);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return value;
}

function writeDatabaseRow(writer: DatabaseRowWriter, model: Model, row: object): Model {
  if (writer.mapKey === null) {
    return copyDatabaseRow(writer.jsonAttributeList, model, row as Record<string, unknown>);
  } else {
    return mapDatabaseRow(writer, writer.mapKey, model, row as Record<string, unknown>);
  }
}

// Without key mapping, the JSON attributes are parsed in the row, as
// `$parseDatabaseJson()` does, and the row is copied as it is.
function copyDatabaseRow(
  jsonAttributes: string[],
  model: Model,
  row: Record<string, unknown>,
): Model {
  for (let i = 0, l = jsonAttributes.length; i < l; ++i) {
    const attr = jsonAttributes[i];
    const value = row[attr];

    if (typeof value === 'string') {
      row[attr] = parseJsonValue(value);
    }
  }

  const keys = Object.keys(row);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    model[key] = row[key];
  }

  return model;
}

function mapDatabaseRow(
  writer: DatabaseRowWriter,
  mapKey: (key: string) => string,
  model: Model,
  row: Record<string, unknown>,
): Model {
  const jsonAttributes = writer.jsonAttributes;
  const keys = Object.keys(row);

  for (let i = 0, l = keys.length; i < l; ++i) {
    const key = keys[i];
    const prop = mapKey(key);
    const value = row[key];

    if (jsonAttributes !== null && jsonAttributes.has(prop)) {
      model[prop] = parseJsonValue(value);
    } else {
      model[prop] = value;
    }
  }

  return model;
}

// The rows of a query as models of `modelClass`, in place.
function createModelsFromDatabaseRows(modelClass: ModelClass, rows: unknown[]): unknown[] {
  const writer = cachedDatabaseRowWriter(modelClass);

  if (writer === undefined || writer === null) {
    return createModelsWithoutWriter(modelClass, rows, writer);
  }

  for (let i = 0, l = rows.length; i < l; ++i) {
    const row = rows[i];

    rows[i] = isRow(row)
      ? writeDatabaseRow(writer, new modelClass(), row)
      : modelClass.fromDatabaseJson(row as object);
  }

  return rows;
}

// The first query of a class, which finds its writer, and the classes that
// have none.
function createModelsWithoutWriter(
  modelClass: ModelClass,
  rows: unknown[],
  writer: DatabaseRowWriter | null | undefined,
): unknown[] {
  if (writer === undefined && !hasDefaultFromDatabaseJson(modelClass)) {
    writer = findDatabaseRowWriter(modelClass, null);
  }

  for (let i = 0, l = rows.length; i < l; ++i) {
    const row = rows[i];

    if (writer === null || !isRow(row)) {
      rows[i] = modelClass.fromDatabaseJson(row as object);
      continue;
    }

    const model = new modelClass();

    if (writer === undefined) {
      writer = findDatabaseRowWriter(modelClass, model);

      if (writer === null) {
        // What `fromDatabaseJson()` does with the model it creates.
        model.$setDatabaseJson(row);
        rows[i] = model;
        continue;
      }
    }

    rows[i] = writeDatabaseRow(writer, model, row);
  }

  return rows;
}

function isRow(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export {
  hasDefaultFromDatabaseJson,
  cachedDatabaseRowWriter,
  findDatabaseRowWriter,
  createModelsFromDatabaseRows,
  columnProperty,
  isJsonProperty,
  parseJsonValue,
};
export type { DatabaseRowWriter };
