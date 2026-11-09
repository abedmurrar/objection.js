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

  onAfter2(builder: QueryBuilder): Promise<unknown> {
    return fetchGraph(builder, this.models, this.isArray);
  }
}

// Fetches the models that a graph write wrote, with the relations of the graph.
async function fetchGraph(
  builder: QueryBuilder,
  models: Model[],
  isArray: boolean,
): Promise<unknown> {
  if (models.length === 0) {
    return isArray ? [] : null;
  }

  const eager = RelationExpression.fromModelGraph(models);
  const modelClass = models[0].constructor;
  const ids = models.map((model) => model.$id());

  const fetched = await modelClass
    .query()
    .childQueryOf(builder)
    .findByIds(ids)
    .withGraphFetched(eager);

  return isArray ? fetched : fetched[0] || null;
}

export { InsertGraphAndFetchOperation, fetchGraph };
