import { DelegateOperation } from './DelegateOperation';
import { InsertGraphOperation } from './InsertGraphOperation';
import { RelationExpression } from '../RelationExpression';
import type { Model, OperationOptions, QueryBuilder } from './types';

class InsertGraphAndFetchOperation extends DelegateOperation {
  declare delegate: InsertGraphOperation;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);

    if (!this.delegate.is(InsertGraphOperation)) {
      throw new Error('Invalid delegate');
    }
  }

  get models(): Model[] {
    return this.delegate.models;
  }

  get isArray(): boolean {
    return this.delegate.isArray;
  }

  async onAfter2(builder: QueryBuilder): Promise<unknown> {
    if (this.models.length === 0) {
      return this.isArray ? [] : null;
    }

    const eager = RelationExpression.fromModelGraph(this.models);
    const modelClass = this.models[0].constructor;
    const ids = this.models.map((model) => model.$id());

    const models = await modelClass
      .query()
      .childQueryOf(builder)
      .findByIds(ids)
      .withGraphFetched(eager);

    return this.isArray ? models : models[0] || null;
  }
}

export { InsertGraphAndFetchOperation };
