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

    ctx.runBefore = this.runBefore.slice();
    ctx.runAfter = this.runAfter.slice();
    ctx.onBuild = this.onBuild.slice();

    return ctx;
  }
}

export { QueryBuilderContext };
