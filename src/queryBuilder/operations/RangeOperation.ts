import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { OperationOptions, QueryBuilder } from './types';

class RangeOperation extends QueryBuilderOperation {
  declare resultSizeBuilder: QueryBuilder | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.resultSizeBuilder = null;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    if (args.length === 2) {
      const start = args[0] as number;
      const end = args[1] as number;

      // Need to set these here instead of `onBuildKnex` so that they
      // don't end up in the resultSize query.
      builder.limit(end - start + 1).offset(start);
    }

    return true;
  }

  onBefore1(builder: QueryBuilder, result: unknown): unknown {
    this.resultSizeBuilder = builder.clone();
    return super.onBefore1(builder, result);
  }

  async onAfter3(_: QueryBuilder, results: unknown): Promise<{ results: unknown; total: number }> {
    const resultSize = await (this.resultSizeBuilder as QueryBuilder).resultSize();

    return {
      results,
      // `parseInt` converts the number to a string first, as it always has.
      total: parseInt(resultSize as unknown as string, 10),
    };
  }

  clone(): this {
    const clone = super.clone();
    clone.resultSizeBuilder = this.resultSizeBuilder;
    return clone;
  }
}

export { RangeOperation };
