import { DelegateOperation } from './DelegateOperation';
import { InsertOperation } from './InsertOperation';
import { GraphUpsert } from '../graph/GraphUpsert';
import type { KnexBuilder, Model, OperationOptions, QueryBuilder, Relation } from './types';

// `GraphUpsert` is still JavaScript, exported as a value only.
type GraphUpsertInstance = InstanceType<typeof GraphUpsert>;

// The insert operation this delegates to. `RelationInsertOperation`s have a
// `relation`.
type InsertDelegate = InsertOperation & { relation?: Relation };

class InsertGraphOperation extends DelegateOperation {
  declare delegate: InsertDelegate;
  declare upsertOptions: Record<string, unknown>;
  declare upsert: GraphUpsertInstance | null;

  constructor(name: string | null, opt: OperationOptions | null = null) {
    super(name, opt as OperationOptions);

    if (!this.delegate.is(InsertOperation)) {
      throw new Error('Invalid delegate');
    }

    Object.assign(this.delegate.modelOptions, GraphUpsert.modelOptions);
    this.upsertOptions = opt!.opt || {};
    this.upsert = null;
  }

  get models(): Model[] {
    return this.delegate.models;
  }

  get isArray(): boolean {
    return this.delegate.isArray;
  }

  get relation(): Relation | undefined {
    return this.delegate.relation;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    const retVal = super.onAdd(builder, args);

    this.upsert = new GraphUpsert({
      objects: this.models,
      rootModelClass: builder.modelClass(),

      upsertOptions: Object.assign({}, this.upsertOptions, {
        noUpdate: true,
        noDelete: true,
        noUnrelate: true,
        insertMissing: true,
      }),
    });

    // We resolve this query here and will not execute it. This is because the root
    // value may depend on other models in the graph and cannot be inserted first.
    builder.resolve([]);

    return retVal;
  }

  onBefore1(_: QueryBuilder, result: unknown): unknown {
    // Do nothing.
    return result;
  }

  onBefore2(builder: QueryBuilder, result: unknown): unknown {
    // We override this with empty implementation so that the $beforeInsert()
    // hooks are not called twice for the root models.

    if (this.relation) {
      // We still need to call the relation before insert hook if the the
      // delegate operation is a RelationInsertOperation.
      return this.relation.executeBeforeInsert(this.models, builder.context(), result);
    } else {
      return result;
    }
  }

  onBefore3(_: QueryBuilder, result: unknown): unknown {
    // Do nothing.
    return result;
  }

  onBuild(): void {
    // Do nothing.
  }

  onBuildKnex(knexBuilder: KnexBuilder): KnexBuilder {
    // Do nothing.
    return knexBuilder;
  }

  // We overrode all other hooks but this one and do all the work in here.
  // This is a bit hacky.
  async onAfter1(builder: QueryBuilder, ...restArgs: [result: unknown]): Promise<unknown> {
    await this.upsert!.run(builder);
    return await super.onAfter1(builder, ...restArgs);
  }

  onAfter2(): unknown {
    // We override this with empty implementation so that the $afterInsert() hooks
    // are not called twice for the root models.
    return this.isArray ? this.models : this.models[0] || null;
  }

  clone(): this {
    const clone = super.clone();
    clone.upsert = this.upsert;
    return clone;
  }
}

export { InsertGraphOperation };
