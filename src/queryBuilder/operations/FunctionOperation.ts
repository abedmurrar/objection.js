import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { OperationOptions, QueryBuilder } from './types';

// An operation that holds the function a user passed to one of the hook
// methods (`runBefore()`, `onBuild()`, ...). Each subclass calls it from its
// own hook, and defines no other hook, so the hooks of a query stay the same.
class FunctionOperation<F> extends QueryBuilderOperation {
  declare func: F | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.func = null;
  }

  onAdd(_: QueryBuilder, args: unknown[]): boolean {
    this.func = args[0] as F;
    return true;
  }

  clone(): this {
    const clone = super.clone();
    clone.func = this.func;
    return clone;
  }
}

export { FunctionOperation };
