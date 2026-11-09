import { FunctionOperation } from './FunctionOperation';
import type { QueryBuilder } from './types';

type OnErrorFunction = (this: QueryBuilder, error: unknown, builder: QueryBuilder) => unknown;

class OnErrorOperation extends FunctionOperation<OnErrorFunction> {
  onError(builder: QueryBuilder, error: unknown): unknown {
    return (this.func as OnErrorFunction).call(builder, error, builder);
  }
}

export { OnErrorOperation };
