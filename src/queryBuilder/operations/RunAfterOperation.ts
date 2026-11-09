import { FunctionOperation } from './FunctionOperation';
import type { QueryBuilder } from './types';

type RunAfterFunction = (this: QueryBuilder, result: unknown, builder: QueryBuilder) => unknown;

class RunAfterOperation extends FunctionOperation<RunAfterFunction> {
  onAfter3(builder: QueryBuilder, result: unknown): unknown {
    return (this.func as RunAfterFunction).call(builder, result, builder);
  }
}

export { RunAfterOperation };
