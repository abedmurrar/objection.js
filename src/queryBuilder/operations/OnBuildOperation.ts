import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { OperationOptions, QueryBuilder } from './types';

type OnBuildFunction = (this: QueryBuilder, builder: QueryBuilder) => unknown;

class OnBuildOperation extends QueryBuilderOperation {
  declare func: OnBuildFunction | null;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);
    this.func = null;
  }

  onAdd(_: QueryBuilder, args: unknown[]): boolean {
    this.func = args[0] as OnBuildFunction;
    return true;
  }

  onBuild(builder: QueryBuilder): unknown {
    return (this.func as OnBuildFunction).call(builder, builder);
  }

  clone(): this {
    const clone = super.clone();
    clone.func = this.func;
    return clone;
  }
}

export { OnBuildOperation };
