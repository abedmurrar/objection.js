import { QueryBuilderOperation } from './QueryBuilderOperation';
import { isPlainObject, isObject, isFunction, once } from '../../utils/objectUtils';
import { isKnexQueryBuilder, isKnexJoinBuilder } from '../../utils/knexUtils';
import { transformation } from '../transformations';
import { isModelClass } from '../../utils/resolveModel';
import type {
  KnexBuilder,
  ModelClass,
  OperationOptions,
  QueryBuilder,
  QueryBuilderClass,
} from './types';

// `JoinBuilder` requires this file, so it's required lazily.
const getJoinBuilder: () => QueryBuilderClass = once(() => require('../JoinBuilder').JoinBuilder);

// An objection value that converts itself to a knex raw, like a `RawBuilder`.
interface ToKnexRaw {
  toKnexRaw(builder: QueryBuilder): unknown;
}

// An objection query builder base, like a `QueryBuilder` or a `JoinBuilder`.
interface ObjectionQueryBuilderBase {
  isObjectionQueryBuilderBase: true;
  subqueryOf(builder: QueryBuilder): { toKnexQuery(): KnexBuilder };
}

// A function passed as an argument, like a `where` callback. It may return a
// value or nothing (`unknown` doesn't allow a function to return nothing on
// some code paths).
type ArgumentFunctionResult = {} | null | void;
type ArgumentFunction = (this: unknown, ...args: unknown[]) => ArgumentFunctionResult;

// An abstract operation base class that converts all arguments from objection types
// to knex types. For example objection query builders are converted into knex query
// builders and objection RawBuilder instances are converted into knex Raw instances.
class ObjectionToKnexConvertingOperation extends QueryBuilderOperation {
  declare args: unknown[] | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.args = null;
  }

  // The arguments converted for knex. `any`: they are arbitrary user values
  // that the subclasses pass on to knex.
  getKnexArgs(builder: QueryBuilder): any[] {
    return convertArgs(this.name, builder, this.args as unknown[]);
  }

  onAdd(builder: QueryBuilder, args: ArrayLike<unknown>): boolean {
    this.args = Array.from(args);
    return shouldBeAdded(this.name, builder, this.args);
  }

  clone(): this {
    const clone = super.clone();
    clone.args = this.args;
    return clone;
  }
}

function shouldBeAdded(opName: string | null, builder: QueryBuilder, args: unknown[]): boolean {
  const skipUndefined = builder.internalOptions().skipUndefined;

  for (let i = 0, l = args.length; i < l; ++i) {
    const arg = args[i];

    if (isUndefined(arg)) {
      if (skipUndefined) {
        return false;
      } else {
        throw new Error(
          `undefined passed as argument #${i} for '${opName}' operation. Call skipUndefined() method to ignore the undefined values.`,
        );
      }
    }
  }

  return true;
}

function convertArgs(opName: string | null, builder: QueryBuilder, args: unknown[]): unknown[] {
  const skipUndefined = builder.internalOptions().skipUndefined;

  return args.map((arg, i) => {
    if (hasToKnexRawMethod(arg)) {
      return convertToKnexRaw(arg, builder);
    } else if (isObjectionQueryBuilderBase(arg)) {
      return convertQueryBuilderBase(arg, builder);
    } else if (isArray(arg)) {
      return convertArray(arg, builder, i, opName, skipUndefined);
    } else if (isModelClass(arg)) {
      // Model classes can be used in place of their table names, for example
      // `join(Pet, ...)`. They are functions, so this check must come first.
      return (arg as ModelClass).getTableName();
    } else if (isFunction(arg)) {
      return convertFunction(arg as ArgumentFunction, builder);
    } else if (isModel(arg)) {
      return convertModel(arg as { $toDatabaseJson(): unknown });
    } else if (isPlainObject(arg)) {
      return convertPlainObject(arg, builder, i, opName, skipUndefined);
    } else {
      return arg;
    }
  });
}

function isUndefined(item: unknown): item is undefined {
  return item === undefined;
}

function hasToKnexRawMethod(item: unknown): item is ToKnexRaw {
  return isObject(item) && isFunction((item as Partial<ToKnexRaw>).toKnexRaw);
}

function convertToKnexRaw(item: ToKnexRaw, builder: QueryBuilder): unknown {
  return item.toKnexRaw(builder);
}

function isObjectionQueryBuilderBase(item: unknown): item is ObjectionQueryBuilderBase {
  return (
    isObject(item) &&
    (item as Partial<ObjectionQueryBuilderBase>).isObjectionQueryBuilderBase === true
  );
}

function convertQueryBuilderBase(
  item: ObjectionQueryBuilderBase,
  builder: QueryBuilder,
): KnexBuilder {
  item = transformation.onConvertQueryBuilderBase(item, builder);
  return item.subqueryOf(builder).toKnexQuery();
}

function isArray(item: unknown): item is unknown[] {
  return Array.isArray(item);
}

function convertArray(
  arr: unknown[],
  builder: QueryBuilder,
  i: number,
  opName: string | null,
  skipUndefined: boolean,
): unknown[] {
  return arr.map((item) => {
    if (item === undefined) {
      if (!skipUndefined) {
        throw new Error(
          `undefined passed as an item in argument #${i} for '${opName}' operation. Call skipUndefined() method to ignore the undefined values.`,
        );
      }
    } else if (hasToKnexRawMethod(item)) {
      return convertToKnexRaw(item, builder);
    } else if (isObjectionQueryBuilderBase(item)) {
      return convertQueryBuilderBase(item, builder);
    } else if (isModelClass(item)) {
      return (item as ModelClass).getTableName();
    } else {
      return item;
    }
  });
}

function convertFunction(func: ArgumentFunction, builder: QueryBuilder): ArgumentFunction {
  return function convertedKnexArgumentFunction(
    this: unknown,
    ...args: unknown[]
  ): ArgumentFunctionResult {
    if (isKnexQueryBuilder(this)) {
      convertQueryBuilderFunction(this, func, builder);
    } else if (isKnexJoinBuilder(this)) {
      convertJoinBuilderFunction(this, func, builder);
    } else {
      return func.apply(this, args);
    }
  };
}

function convertQueryBuilderFunction(
  knexQueryBuilder: KnexBuilder,
  func: ArgumentFunction,
  builder: QueryBuilder,
): void {
  const convertedQueryBuilder = builder.constructor.forClass(builder.modelClass());

  convertedQueryBuilder.isPartial(true).subqueryOf(builder);
  func.call(convertedQueryBuilder, convertedQueryBuilder);

  convertedQueryBuilder.toKnexQuery(knexQueryBuilder);
}

function convertJoinBuilderFunction(
  knexJoinBuilder: KnexBuilder,
  func: ArgumentFunction,
  builder: QueryBuilder,
): void {
  const JoinBuilder = getJoinBuilder();
  const joinClauseBuilder = JoinBuilder.forClass(builder.modelClass());

  joinClauseBuilder.isPartial(true).subqueryOf(builder);
  func.call(joinClauseBuilder, joinClauseBuilder);

  joinClauseBuilder.toKnexQuery(knexJoinBuilder);
}

function isModel(item: unknown): boolean | undefined {
  return isObject(item) && (item as { $isObjectionModel?: boolean }).$isObjectionModel;
}

function convertModel(model: { $toDatabaseJson(): unknown }): unknown {
  return model.$toDatabaseJson();
}

function convertPlainObject(
  obj: Record<string, unknown>,
  builder: QueryBuilder,
  i: number,
  opName: string | null,
  skipUndefined: boolean,
): Record<string, unknown> {
  return Object.keys(obj).reduce((out: Record<string, unknown>, key) => {
    const item = obj[key];

    if (item === undefined) {
      if (!skipUndefined) {
        throw new Error(
          `undefined passed as a property in argument #${i} for '${opName}' operation. Call skipUndefined() method to ignore the undefined values.`,
        );
      }
    } else if (hasToKnexRawMethod(item)) {
      out[key] = convertToKnexRaw(item, builder);
    } else if (isObjectionQueryBuilderBase(item)) {
      out[key] = convertQueryBuilderBase(item, builder);
    } else if (isModelClass(item)) {
      // `{ alias: ModelClass }`.
      out[key] = (item as ModelClass).getTableName();
    } else {
      out[key] = item;
    }

    return out;
  }, {});
}

export { ObjectionToKnexConvertingOperation };
