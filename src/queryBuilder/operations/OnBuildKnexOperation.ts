import { FunctionOperation } from './FunctionOperation';
import type { KnexBuilder, QueryBuilder } from './types';

type OnBuildKnexFunction = (
  this: KnexBuilder,
  knexBuilder: KnexBuilder,
  builder: QueryBuilder,
) => KnexBuilder;

class OnBuildKnexOperation extends FunctionOperation<OnBuildKnexFunction> {
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    return (this.func as OnBuildKnexFunction).call(knexBuilder, knexBuilder, builder);
  }
}

export { OnBuildKnexOperation };
