import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { OperationOptions, QueryBuilder } from './types';

class FindByIdsOperation extends QueryBuilderOperation {
  declare ids: unknown;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.ids = null;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    this.ids = args[0];
    return super.onAdd(builder, args);
  }

  onBuild(builder: QueryBuilder): void {
    builder.whereInComposite(builder.fullIdColumn(), this.ids);
  }

  clone(): this {
    const clone = super.clone();
    clone.ids = this.ids;
    return clone;
  }
}

export { FindByIdsOperation };
