import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { OperationOptions, QueryBuilder } from './types';

type OnErrorFunction = (this: QueryBuilder, error: unknown, builder: QueryBuilder) => unknown;

class OnErrorOperation extends QueryBuilderOperation {
  declare func: OnErrorFunction | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.func = null;
  }

  onAdd(_: QueryBuilder, args: unknown[]): boolean {
    this.func = args[0] as OnErrorFunction;
    return true;
  }

  onError(builder: QueryBuilder, error: unknown): unknown {
    return (this.func as OnErrorFunction).call(builder, error, builder);
  }

  clone(): this {
    const clone = super.clone();
    clone.func = this.func;
    return clone;
  }
}

export { OnErrorOperation };
