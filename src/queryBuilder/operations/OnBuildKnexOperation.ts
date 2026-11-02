import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { KnexBuilder, OperationOptions, QueryBuilder } from './types';

type OnBuildKnexFunction = (
  this: KnexBuilder,
  knexBuilder: KnexBuilder,
  builder: QueryBuilder,
) => KnexBuilder;

class OnBuildKnexOperation extends QueryBuilderOperation {
  declare func: OnBuildKnexFunction | null;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);
    this.func = null;
  }

  onAdd(_: QueryBuilder, args: unknown[]): boolean {
    this.func = args[0] as OnBuildKnexFunction;
    return true;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    return (this.func as OnBuildKnexFunction).call(knexBuilder, knexBuilder, builder);
  }

  clone(): this {
    const clone = super.clone();
    clone.func = this.func;
    return clone;
  }
}

export { OnBuildKnexOperation };
