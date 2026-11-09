import { asArray } from '../utils/objectUtils';
import { after } from '../utils/promiseUtils';
import type { QueryBuilder } from './QueryBuilder';
import type { ModelClass, Operation } from './QueryBuilderOperationSupport';
import type { QueryBuilderUserContext } from './QueryBuilderUserContext';

const BUILDER_SYMBOL = Symbol();

// The static hooks of `Model`, which do nothing. Queries skip creating the
// arguments and calling the hook when a model class hasn't overridden it.
const defaultStaticHooks = new WeakSet<object>();

function markDefaultStaticHook(hook: object): void {
  defaultStaticHooks.add(hook);
}

function hasStaticHook(modelClass: ModelClass, hookName: string): boolean {
  return !defaultStaticHooks.has(modelClass[hookName]);
}

type StaticHook = (this: ModelClass, args: StaticHookArguments) => unknown;

// Calls a static "before" hook (`beforeFind`, `beforeInsert`, ...) of the
// query's model class, if the class overrides it. Returns what the hook
// returns: a promise to wait for, or anything else, which is ignored.
function callStaticBeforeHook(builder: QueryBuilder, hookName: string): unknown {
  const modelClass = builder.modelClass();

  if (!hasStaticHook(modelClass, hookName)) {
    return undefined;
  }

  return (modelClass[hookName] as StaticHook).call(
    modelClass,
    StaticHookArguments.create({ builder }),
  );
}

// Calls a static "after" hook (`afterFind`, `afterInsert`, ...) of the query's
// model class, if the class overrides it. Returns the result, or what the hook
// returns instead of `undefined`, and only a promise when the hook returns one.
function callStaticAfterHook(builder: QueryBuilder, hookName: string, result: unknown): unknown {
  const modelClass = builder.modelClass();

  if (!hasStaticHook(modelClass, hookName)) {
    return result;
  }

  const maybePromise = (modelClass[hookName] as StaticHook).call(
    modelClass,
    StaticHookArguments.create({ builder, result }),
  );

  return after(maybePromise, (maybeResult: unknown) =>
    maybeResult === undefined ? result : maybeResult,
  );
}

interface StaticHookArgumentsOptions {
  builder: QueryBuilder;
  result?: unknown;
}

class StaticHookArguments {
  declare readonly [BUILDER_SYMBOL]: QueryBuilder;
  declare readonly result: unknown[];

  constructor({ builder, result = null }: StaticHookArgumentsOptions) {
    // The builder should never be accessed through the arguments.
    // Hide it as well as possible to discourage people from
    // digging it out.
    Object.defineProperty(this, BUILDER_SYMBOL, {
      value: builder,
    });

    Object.defineProperty(this, 'result', {
      value: asArray(result),
    });
  }

  static create(args: StaticHookArgumentsOptions): StaticHookArguments {
    return new StaticHookArguments(args);
  }

  get asFindQuery(): () => QueryBuilder {
    return () => {
      return this[BUILDER_SYMBOL].toFindQuery().clearWithGraphFetched().runAfter(asArray);
    };
  }

  get context(): QueryBuilderUserContext {
    return this[BUILDER_SYMBOL].context();
  }

  get transaction(): unknown {
    return this[BUILDER_SYMBOL].unsafeKnex();
  }

  get relation(): unknown {
    return findInOperations(this[BUILDER_SYMBOL], getRelation);
  }

  get modelOptions(): unknown {
    return findInOperations(this[BUILDER_SYMBOL], getModelOptions);
  }

  get items(): unknown[] {
    return asArray(findInOperations(this[BUILDER_SYMBOL], getItems) || []);
  }

  get inputItems(): unknown[] {
    return asArray(findInOperations(this[BUILDER_SYMBOL], getInputItems) || []);
  }

  get cancelQuery(): (cancelValue?: unknown) => void {
    const args = this;

    return (cancelValue) => {
      const builder = this[BUILDER_SYMBOL];

      if (cancelValue === undefined) {
        if (builder.isInsert()) {
          cancelValue = args.inputItems;
        } else if (builder.isFind()) {
          cancelValue = [];
        } else {
          cancelValue = 0;
        }
      }

      builder.resolve(cancelValue);
    };
  }
}

interface JoinedStaticHookArgumentsOptions extends StaticHookArgumentsOptions {
  relation: unknown;
  items: unknown[];
}

// The relations that `withGraphJoined()` fetches have no query of their own, so
// the hooks of their model classes get the relation and its owners instead.
class JoinedStaticHookArguments extends StaticHookArguments {
  declare readonly joinedRelation: unknown;
  declare readonly joinedItems: unknown[];

  constructor({ builder, result, relation, items }: JoinedStaticHookArgumentsOptions) {
    super({ builder, result });

    Object.defineProperty(this, 'joinedRelation', { value: relation });
    Object.defineProperty(this, 'joinedItems', { value: items });
  }

  static create(args: JoinedStaticHookArgumentsOptions): JoinedStaticHookArguments {
    return new JoinedStaticHookArguments(args);
  }

  get asFindQuery(): () => QueryBuilder {
    return () => {
      throw new Error(
        'asFindQuery() is not available for relations fetched with withGraphJoined().',
      );
    };
  }

  get relation(): unknown {
    return this.joinedRelation;
  }

  get modelOptions(): unknown {
    return undefined;
  }

  // The owners of the related models.
  get items(): unknown[] {
    return this.joinedItems;
  }

  get inputItems(): unknown[] {
    return [];
  }

  get cancelQuery(): (cancelValue?: unknown) => void {
    return () => {
      throw new Error(
        'cancelQuery() is not available for relations fetched with withGraphJoined().',
      );
    };
  }
}

// What some of the operations have: the relation operations have a relation
// and an owner, the instance operations an instance, and the insert and update
// operations models and model options.
interface ItemOperation extends Operation {
  relation?: unknown;
  modelOptions?: unknown;
  instance?: unknown;
  owner?: { isModels: boolean; modelArray: unknown[] };
  models?: unknown;
  model?: unknown;
}

// The value of the first operation that has one (a truthy one), or undefined.
function findInOperations(builder: QueryBuilder, get: (op: ItemOperation) => unknown): unknown {
  let value: unknown;

  builder.findOperation((op: ItemOperation) => {
    value = get(op);
    return !!value;
  });

  return value || undefined;
}

function getRelation(op: ItemOperation): unknown {
  return op.relation;
}

function getModelOptions(op: ItemOperation): unknown {
  return op.modelOptions;
}

function getItems(op: ItemOperation): unknown {
  return op.instance || (op.owner && op.owner.isModels && op.owner.modelArray);
}

function getInputItems(op: ItemOperation): unknown {
  return op.models || op.model;
}

export {
  StaticHookArguments,
  JoinedStaticHookArguments,
  markDefaultStaticHook,
  hasStaticHook,
  callStaticBeforeHook,
  callStaticAfterHook,
};
