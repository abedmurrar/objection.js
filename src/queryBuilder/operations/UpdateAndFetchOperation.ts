import { withWhereScope } from '../whereScopes';
import { DelegateOperation } from './DelegateOperation';
import { FindByIdOperation } from './FindByIdOperation';
import { UpdateOperation } from './UpdateOperation';
import type { Model, OperationOptions, QueryBuilder } from './types';

class UpdateAndFetchOperation extends DelegateOperation {
  declare delegate: UpdateOperation;
  declare id: unknown;
  declare skipIdWhere: boolean;
  // Shared with the clones that each execution runs.
  declare state: { isMerged: boolean };

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);

    if (!this.delegate.is(UpdateOperation)) {
      throw new Error('Invalid delegate');
    }

    this.id = null;
    this.skipIdWhere = false;
    this.state = { isMerged: false };
  }

  get model(): Model {
    return this.delegate.model;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    this.id = args[0];
    return this.delegate.onAdd(builder, args.slice(1));
  }

  onBefore1(builder: QueryBuilder, result: unknown): unknown {
    // A second run would write back the row that the first one merged into
    // the patch.
    if (this.state.isMerged) {
      throw new Error(
        `Unable to execute ${this.name}() twice, as the fetched row was merged into ` +
          'its patch. Create a new query for each run.',
      );
    }

    return super.onBefore1(builder, result);
  }

  onBuild(builder: QueryBuilder): void {
    if (!this.skipIdWhere) {
      withWhereScope(builder, () => builder.findById(this.id));
    }

    super.onBuild(builder);
  }

  async onAfter2(builder: QueryBuilder, numUpdated: unknown): Promise<unknown> {
    if (numUpdated == 0) {
      // If nothing was updated, we should fetch nothing.
      await super.onAfter2(builder, numUpdated);
      return undefined;
    }

    const fetched = await builder
      .emptyInstance()
      .childQueryOf(builder)
      .modify((builder) => {
        if (!this.skipIdWhere) {
          builder.findById(this.id);
        }
      })
      .castTo(builder.resultModelClass());

    if (fetched) {
      this.model.$set(fetched);
      this.state.isMerged = true;
    }

    await super.onAfter2(builder, numUpdated);
    return fetched ? this.model : undefined;
  }

  toFindOperation(): FindByIdOperation {
    return new FindByIdOperation('findById', {
      id: this.id,
    });
  }

  clone(): this {
    const clone = super.clone();

    clone.id = this.id;
    clone.skipIdWhere = this.skipIdWhere;
    clone.state = this.state;

    return clone;
  }
}

export { UpdateAndFetchOperation };
