import { withWhereScope } from '../whereScopes';
import { FindOperation } from './FindOperation';
import { assertHasId } from '../../utils/assert';
import type { Model, OperationOptions, QueryBuilder } from './types';

class InstanceFindOperation extends FindOperation {
  declare instance: Model;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);
    this.instance = opt.instance as Model;
  }

  onBuild(builder: QueryBuilder): void {
    assertHasId(this.instance);
    withWhereScope(builder, () => builder.findById(this.instance.$id()));
  }
}

export { InstanceFindOperation };
