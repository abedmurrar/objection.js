import { asArray, isObject, uniqBy, get, set } from '../utils/objectUtils';
import { ref as createRef } from '../queryBuilder/ReferenceBuilder';
import { propToStr, PROP_KEY_PREFIX } from '../model/modelValues';
import type { ReferenceBuilder } from '../queryBuilder/ReferenceBuilder';
import type { RelationModelClass, RelationQueryBuilder } from './Relation';

// An object that holds the property values: a model, a plain object such as
// a join table row or a patch.
type PropObject = Record<string, any>;

type ModelClassResolver = (tableName: string) => RelationModelClass | null | undefined;
type PropGetter = (obj: PropObject) => unknown;
type PropSetter = (obj: PropObject, value: unknown) => unknown;
type Patcher = (patch: PropObject, value: unknown) => unknown;

interface PropPath {
  // The property name, then the JSON path in it.
  path: (string | number)[];
  modelClass: RelationModelClass;
}

class ModelNotFoundError extends Error {
  declare tableName: string;

  constructor(tableName: string) {
    super();
    this.name = this.constructor.name;
    this.tableName = tableName;
  }
}

class InvalidReferenceError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }
}

// A pair of these define how two tables are related to each other.
// Both the owner and the related table have one of these.
//
// A relation property can be a single column, an array of columns
// (composite key) a json column reference, an array of json column
// references or any combination of the above.
class RelationProperty {
  declare _refs: ReferenceBuilder[];
  declare _modelClass: RelationModelClass;
  declare _props: string[];
  declare _cols: string[];
  declare _propGetters: PropGetter[];
  declare _propSetters: PropSetter[];
  declare _patchers: Patcher[];

  // references must be a reference string like `Table.column:maybe.some.json[1].path`.
  // or an array of such references (composite key).
  //
  // modelClassResolver must be a function that takes a table name
  // and returns a model class.
  constructor(references: unknown, modelClassResolver: ModelClassResolver) {
    const refs = createRefs(asArray(references));
    const paths = createPaths(refs, modelClassResolver);
    const modelClass = resolveModelClass(paths);

    this._refs = refs.map((ref) => ref.model(modelClass));
    this._modelClass = modelClass;
    this._props = paths.map((it) => it.path[0] as string);
    this._cols = refs.map((it) => it.column);
    this._propGetters = paths.map((it) => createGetter(it.path));
    this._propSetters = paths.map((it) => createSetter(it.path));
    this._patchers = refs.map((it, i) => createPatcher(it, paths[i].path));
  }

  static get ModelNotFoundError(): typeof ModelNotFoundError {
    return ModelNotFoundError;
  }

  static get InvalidReferenceError(): typeof InvalidReferenceError {
    return InvalidReferenceError;
  }

  // The number of columns.
  get size(): number {
    return this._refs.length;
  }

  // The model class that owns the property.
  get modelClass(): RelationModelClass {
    return this._modelClass;
  }

  // An array of property names. Contains multiple values in case of composite key.
  // This may be different from `cols` if the model class has some kind of conversion
  // between database and "external" formats, for example a snake_case to camelCase
  // conversion.
  get props(): string[] {
    return this._props;
  }

  // An array of column names. Contains multiple values in case of composite key.
  // This may be different from `props` if the model class has some kind of conversion
  // between database and "external" formats, for example a snake_case to camelCase
  // conversion.
  get cols(): string[] {
    return this._cols;
  }

  forEach(callback: (index: number) => void): void {
    for (let i = 0, l = this.size; i < l; ++i) {
      callback(i);
    }
  }

  // Creates a concatenated string from the property values of the given object.
  propKey(obj: PropObject): string {
    const size = this.size;
    let key: string = PROP_KEY_PREFIX;

    for (let i = 0; i < size; ++i) {
      key += propToStr(this.getProp(obj, i));

      if (i !== size - 1) {
        key += ',';
      }
    }

    return key;
  }

  // Returns the property values of the given object as an array.
  getProps(obj: PropObject): unknown[] {
    const size = this.size;
    const props = new Array<unknown>(size);

    for (let i = 0; i < size; ++i) {
      props[i] = this.getProp(obj, i);
    }

    return props;
  }

  // Returns true if the given object has a non-null value in all properties.
  hasProps(obj: PropObject): boolean {
    const size = this.size;

    for (let i = 0; i < size; ++i) {
      const prop = this.getProp(obj, i);

      if (prop === null || prop === undefined) {
        return false;
      }
    }

    return true;
  }

  // Returns the index:th property value of the given object.
  getProp(obj: PropObject, index: number): unknown {
    return this._propGetters[index](obj);
  }

  // Sets the index:th property value of the given object.
  setProp(obj: PropObject, index: number, value: unknown): unknown {
    return this._propSetters[index](obj, value);
  }

  // Returns an instance of ReferenceBuilder that points to the index:th
  // value of a row.
  ref(builder: RelationQueryBuilder, index: number): ReferenceBuilder {
    const table = builder.tableRefFor(this.modelClass);

    return this._refs[index].clone().table(table);
  }

  // Returns an array of reference builders. `ref(builder, i)` for each i.
  refs(builder: RelationQueryBuilder): ReferenceBuilder[] {
    const refs = new Array<ReferenceBuilder>(this.size);

    for (let i = 0, l = refs.length; i < l; ++i) {
      refs[i] = this.ref(builder, i);
    }

    return refs;
  }

  // Appends an update operation for the index:th column into `patch` object.
  patch(patch: PropObject, index: number, value: unknown): unknown {
    return this._patchers[index](patch, value);
  }

  // String representation of this property's index:th column for logging.
  propDescription(index: number): string {
    return this._refs[index].expression;
  }
}

function createRefs(refs: unknown[]): ReferenceBuilder[] {
  try {
    return refs.map((it) => {
      if (
        !isObject(it) ||
        !(it as { isObjectionReferenceBuilder?: boolean }).isObjectionReferenceBuilder
      ) {
        return createRef(it);
      } else {
        return it as ReferenceBuilder;
      }
    });
  } catch (err) {
    throw new InvalidReferenceError();
  }
}

function createPaths(refs: ReferenceBuilder[], modelClassResolver: ModelClassResolver): PropPath[] {
  return refs.map((ref) => {
    if (!ref.tableName) {
      throw new InvalidReferenceError();
    }

    const modelClass = modelClassResolver(ref.tableName);

    if (!modelClass) {
      throw new ModelNotFoundError(ref.tableName);
    }

    const prop = modelClass.columnNameToPropertyName(ref.column);
    // A ReferenceBuilder is only unparsed inside clone(), which copies the
    // parsed expression right after.
    const jsonPath = ref.parsedExpr!.access.map((it) => it.ref);

    return {
      path: [prop as string | number].concat(jsonPath),
      modelClass,
    };
  });
}

function resolveModelClass(paths: PropPath[]): RelationModelClass {
  const modelClasses = paths.map((it) => it.modelClass);
  const uniqueModelClasses = uniqBy(modelClasses);

  if (uniqueModelClasses.length !== 1) {
    throw new InvalidReferenceError();
  }

  return modelClasses[0];
}

function createGetter(path: (string | number)[]): PropGetter {
  if (path.length === 1) {
    const prop = path[0];
    return (obj) => obj[prop];
  } else {
    return (obj) => get(obj, path);
  }
}

function createSetter(path: (string | number)[]): PropSetter {
  if (path.length === 1) {
    const prop = path[0];
    return (obj, value) => (obj[prop] = value);
  } else {
    return (obj, value) => set(obj, path, value);
  }
}

function createPatcher(ref: ReferenceBuilder, path: (string | number)[]): Patcher {
  if (ref.isPlainColumnRef) {
    return (patch, value) => (patch[path[0]] = value);
  } else {
    // Objection `patch`, `update` etc. methods understand field expressions.
    return (patch, value) => (patch[ref.expression] = value);
  }
}

export { RelationProperty };
