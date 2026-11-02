import { InsertOperation } from './InsertOperation';
import type { Model, OperationOptions, QueryBuilder } from './types';

class InstanceInsertOperation extends InsertOperation {
  declare instance: Model;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);
    this.instance = opt.instance as Model;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    if (!args || args.length === 0) {
      args = [this.instance];
    } else {
      args[0] = this.instance;
    }

    return super.onAdd(builder, args);
  }
}

export { InstanceInsertOperation };
