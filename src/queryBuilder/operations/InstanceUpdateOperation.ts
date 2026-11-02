import { withWhereScope } from '../whereScopes';
import { UpdateOperation } from './UpdateOperation';
import { InstanceFindOperation } from './InstanceFindOperation';
import { assertHasId } from '../../utils/assert';
import { isObject } from '../../utils/objectUtils';
import type { Model, OperationOptions, QueryBuilder } from './types';

class InstanceUpdateOperation extends UpdateOperation {
  declare instance: Model;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);

    this.instance = opt.instance as Model;
    this.modelOptions.old = opt.instance;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    const retVal = super.onAdd(builder, args);

    if (!this.model) {
      this.model = this.instance;
    }

    return retVal;
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

    result = await super.onAfter2(builder, result);
    this.instance.$set(this.model);

    if (isObject(result)) {
      this.instance.$set(result);
    }

    return result;
  }

  toFindOperation(): InstanceFindOperation {
    return new InstanceFindOperation('find', {
      instance: this.instance,
    });
  }
}

export { InstanceUpdateOperation };
