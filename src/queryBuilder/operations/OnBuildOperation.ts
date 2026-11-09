import { FunctionOperation } from './FunctionOperation';
import type { QueryBuilder } from './types';

type OnBuildFunction = (this: QueryBuilder, builder: QueryBuilder) => unknown;

class OnBuildOperation extends FunctionOperation<OnBuildFunction> {
  onBuild(builder: QueryBuilder): unknown {
    return (this.func as OnBuildFunction).call(builder, builder);
  }
}

export { OnBuildOperation };
