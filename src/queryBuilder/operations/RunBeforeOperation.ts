import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { OperationOptions, QueryBuilder } from './types';

type RunBeforeFunction = (this: QueryBuilder, result: unknown, builder: QueryBuilder) => unknown;

class RunBeforeOperation extends QueryBuilderOperation {
  declare func: RunBeforeFunction | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.func = null;
  }

  onAdd(_: QueryBuilder, args: unknown[]): boolean {
    this.func = args[0] as RunBeforeFunction;
    return true;
  }

  onBefore1(builder: QueryBuilder, result: unknown): unknown {
    return (this.func as RunBeforeFunction).call(builder, result, builder);
  }

  clone(): this {
    const clone = super.clone();
    clone.func = this.func;
    return clone;
  }
}

export { RunBeforeOperation };
