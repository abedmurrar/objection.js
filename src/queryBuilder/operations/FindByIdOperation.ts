import { QueryBuilderOperation } from './QueryBuilderOperation';
import { assertIdNotUndefined } from '../../utils/assert';
import type { OperationOptions, QueryBuilder } from './types';

class FindByIdOperation extends QueryBuilderOperation {
  declare id: unknown;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.id = this.opt.id;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    if (this.id === null || this.id === undefined) {
      this.id = args[0];
    }

    return super.onAdd(builder, args);
  }

  onBuild(builder: QueryBuilder): void {
    // Also with `skipUndefined()`: the id is the only condition, so leaving it
    // out would find, update or delete every row of the table.
    assertIdNotUndefined(this.id, `undefined was passed to ${this.name}`);
    builder.whereComposite(builder.fullIdColumn(), this.id);
  }

  clone(): this {
    const clone = super.clone();
    clone.id = this.id;
    return clone;
  }
}

export { FindByIdOperation };
