import type { KnexInstance } from './operations/types';

// What a user context needs from its query builder.
interface UserContextBuilder {
  knex(): KnexInstance;
}

const SYMBOL_BUILDER = Symbol();

class QueryBuilderUserContext {
  // The user context holds whatever properties the user passes to `context()`.
  [key: string]: unknown;

  declare [SYMBOL_BUILDER]: UserContextBuilder;

  constructor(builder: UserContextBuilder) {
    // This should never ever be accessed outside this class. We only
    // store it so that we can access builder.knex() lazily.
    this[SYMBOL_BUILDER] = builder;
  }

  get transaction(): unknown {
    return this[SYMBOL_BUILDER].knex();
  }

  newFromObject(builder: UserContextBuilder, obj: object): this {
    const ctx = new (this.constructor as new (builder: UserContextBuilder) => this)(builder);
    Object.assign(ctx, obj);
    return ctx;
  }

  newMerge(builder: UserContextBuilder, obj: object): this {
    const ctx = new (this.constructor as new (builder: UserContextBuilder) => this)(builder);
    Object.assign(ctx, this, obj);
    return ctx;
  }
}

export { QueryBuilderUserContext };
