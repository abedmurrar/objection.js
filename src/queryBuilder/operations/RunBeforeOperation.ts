import { FunctionOperation } from './FunctionOperation';
import type { QueryBuilder } from './types';

type RunBeforeFunction = (this: QueryBuilder, result: unknown, builder: QueryBuilder) => unknown;

class RunBeforeOperation extends FunctionOperation<RunBeforeFunction> {
  onBefore1(builder: QueryBuilder, result: unknown): unknown {
    return (this.func as RunBeforeFunction).call(builder, result, builder);
  }
}

export { RunBeforeOperation };
