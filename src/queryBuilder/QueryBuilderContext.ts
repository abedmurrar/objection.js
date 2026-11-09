import { QueryBuilderContextBase } from './QueryBuilderContextBase';
import type { QueryBuilder } from './QueryBuilder';

// Called with the builder as `this` and as the last argument.
type RunHook = (this: QueryBuilder, result: unknown, builder: QueryBuilder) => unknown;
type OnBuildHook = (this: QueryBuilder, builder: QueryBuilder) => void;

class QueryBuilderContext extends QueryBuilderContextBase {
  declare runBefore: RunHook[];
  declare runAfter: RunHook[];
  declare onBuild: OnBuildHook[];

  constructor(builder?: QueryBuilder) {
    super(builder);

    this.runBefore = [];
    this.runAfter = [];
    this.onBuild = [];
  }

  clone(): this {
    const ctx = super.clone();

    // The constructor gave the copy empty arrays.
    if (this.runBefore.length !== 0) ctx.runBefore = this.runBefore.slice();
    if (this.runAfter.length !== 0) ctx.runAfter = this.runAfter.slice();
    if (this.onBuild.length !== 0) ctx.onBuild = this.onBuild.slice();

    return ctx;
  }
}

export { QueryBuilderContext };
