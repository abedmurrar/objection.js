import { DelegateOperation } from './DelegateOperation';
import { UpsertGraphOperation } from './UpsertGraphOperation';
import { fetchGraph } from './InsertGraphAndFetchOperation';
import type { Model, OperationOptions, QueryBuilder } from './types';

class UpsertGraphAndFetchOperation extends DelegateOperation {
  declare delegate: UpsertGraphOperation;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);

    if (!this.delegate.is(UpsertGraphOperation)) {
      throw new Error('Invalid delegate');
    }
  }

  get models(): Model[] {
    return this.delegate.models;
  }

  get isArray(): boolean {
    return this.delegate.isArray;
  }

  onAfter3(builder: QueryBuilder): Promise<unknown> {
    return fetchGraph(builder, this.models, this.isArray);
  }
}

export { UpsertGraphAndFetchOperation };
