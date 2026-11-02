import { InternalOptions } from './InternalOptions';
import type { QueryBuilderOperationSupport } from './QueryBuilderOperationSupport';
import type { KnexInstance } from './operations/types';
import type { QueryBuilderUserContext } from './QueryBuilderUserContext';

class QueryBuilderContextBase {
  declare userContext: QueryBuilderUserContext;
  declare options: InternalOptions;
  // `knex(undefined)` stores undefined.
  declare knex: KnexInstance | null | undefined;

  declare aliasMap: Map<string, string> | null;
  declare tableMap: Map<string, string> | null;

  constructor(builder?: QueryBuilderOperationSupport) {
    // `userContext` and `options` are only null in the copy that `clone()`
    // creates, which assigns them right away.
    this.userContext = (
      builder
        ? new (builder.constructor as typeof QueryBuilderOperationSupport).QueryBuilderUserContext(
            builder,
          )
        : null
    )!;
    this.options = (
      builder ? new (this.constructor as typeof QueryBuilderContextBase).InternalOptions() : null
    )!;
    this.knex = null;

    this.aliasMap = null;
    this.tableMap = null;
  }

  static get InternalOptions(): typeof InternalOptions {
    return InternalOptions;
  }

  clone(): this {
    const ctx = new (this.constructor as new () => this)();

    ctx.userContext = this.userContext;
    ctx.options = this.options.clone();
    ctx.knex = this.knex;

    ctx.aliasMap = this.aliasMap;
    ctx.tableMap = this.tableMap;

    return ctx;
  }
}

export { QueryBuilderContextBase };
