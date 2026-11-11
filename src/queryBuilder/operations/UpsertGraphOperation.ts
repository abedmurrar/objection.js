import { QueryBuilderOperation } from './QueryBuilderOperation';
import { GraphUpsert } from '../graph/GraphUpsert';
import { RelationFindOperation } from '../../relations/RelationFindOperation';
import type { Model, OperationOptions, QueryBuilder } from './types';

class UpsertGraphOperation extends QueryBuilderOperation {
  declare upsertOptions: Record<string, unknown>;
  declare upsert: GraphUpsert | null;

  constructor(name: string | null, opt: OperationOptions) {
    super(
      name,
      Object.assign({}, opt, {
        upsertOptions: {},
      }),
    );

    this.upsertOptions = opt.upsertOptions || {};
    this.upsert = null;
  }

  get models(): Model[] {
    return this.upsert!.objects;
  }

  get isArray(): boolean {
    return this.upsert!.isArray;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    const [objects] = args;

    this.upsert = new GraphUpsert({
      objects,
      rootModelClass: builder.modelClass(),
      upsertOptions: this.upsertOptions,
    });

    // Never execute this builder.
    builder.resolve([]);

    return true;
  }

  onAfter1(builder: QueryBuilder): unknown {
    if (hasOtherSqlModifyingQueryBuilderCalls(builder)) {
      throw new Error(
        'upsertGraph query should contain no other query builder calls like `findById`, `where` or `$relatedQuery` that would affect the SQL. They have no effect.',
      );
    }

    return this.upsert!.run(builder);
  }

  clone(): this {
    const clone = super.clone();
    clone.upsert = this.upsert;
    return clone;
  }
}

function hasOtherSqlModifyingQueryBuilderCalls(builder: QueryBuilder): boolean {
  return builder.has(/where/) || builder.has(RelationFindOperation);
}

export { UpsertGraphOperation };
