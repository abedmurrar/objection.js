import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { OperationOptions, QueryBuilder } from './types';

type RunAfterFunction = (this: QueryBuilder, result: unknown, builder: QueryBuilder) => unknown;

class RunAfterOperation extends QueryBuilderOperation {
  declare func: RunAfterFunction | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.func = null;
  }

  onAdd(_: QueryBuilder, args: unknown[]): boolean {
    this.func = args[0] as RunAfterFunction;
    return true;
  }

  onAfter3(builder: QueryBuilder, result: unknown): unknown {
    return (this.func as RunAfterFunction).call(builder, result, builder);
  }

  clone(): this {
    const clone = super.clone();
    clone.func = this.func;
    return clone;
  }
}

export { RunAfterOperation };
