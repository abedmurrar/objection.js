import { withWhereScope } from '../whereScopes';
import { DeleteOperation } from './DeleteOperation';
import { InstanceFindOperation } from './InstanceFindOperation';
import { assertHasId } from '../../utils/assert';
import type { Model, OperationOptions, QueryBuilder } from './types';

class InstanceDeleteOperation extends DeleteOperation {
  declare instance: Model;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);
    this.instance = opt.instance as Model;
  }

  async onBefore2(builder: QueryBuilder, result: unknown): Promise<unknown> {
    await this.instance.$beforeDelete(builder.context());
    await super.onBefore2(builder, result);
    return result;
  }

  onBuild(builder: QueryBuilder): void {
    super.onBuild(builder);

    assertHasId(this.instance);
    withWhereScope(builder, () => builder.findById(this.instance.$id()));
  }

  async onAfter2(builder: QueryBuilder, result: unknown): Promise<unknown> {
    // The result may be an object if `returning` was used.
    if (Array.isArray(result)) {
      result = result[0];
    }

    await this.instance.$afterDelete(builder.context());
    return super.onAfter2(builder, result);
  }

  toFindOperation(): InstanceFindOperation {
    return new InstanceFindOperation('find', {
      instance: this.instance,
    });
  }
}

export { InstanceDeleteOperation };
