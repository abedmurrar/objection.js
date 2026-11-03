import { isFunction, isEmpty, isObject } from '../../utils/objectUtils';
import { QueryBuilderOperation } from './QueryBuilderOperation';
import { convertFieldExpressionsToRaw } from './UpdateOperation';
import type { KnexBuilder, Model, OperationOptions, QueryBuilder } from './types';

class MergeOperation extends QueryBuilderOperation {
  declare model: Model | null;
  declare args: unknown[] | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.model = null;
    this.args = null;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    this.args = args;

    if (!isEmpty(args) && isObject(args[0]) && !Array.isArray(args[0])) {
      const json = args[0];
      const modelClass = builder.modelClass();

      this.model = modelClass.ensureModel(json, { patch: true });
    }

    return true;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    if (!isFunction(knexBuilder.merge)) {
      throw new Error('merge method can only be chained right after onConflict method');
    }

    if (this.model) {
      const json = this.model.$toDatabaseJson(builder);
      const convertedJson = convertFieldExpressionsToRaw(builder, json);

      return knexBuilder.merge(convertedJson);
    }

    return knexBuilder.merge(...(this.args as unknown[]));
  }

  toFindOperation(): QueryBuilderOperation | null {
    return null;
  }

  clone(): this {
    const clone = super.clone();
    clone.model = this.model;
    clone.args = this.args;
    return clone;
  }
}

export { MergeOperation };
