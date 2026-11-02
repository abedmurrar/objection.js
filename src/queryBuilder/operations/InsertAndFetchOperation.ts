import { InsertOperation } from './InsertOperation';
import { DelegateOperation } from './DelegateOperation';
import { keyByProps } from '../../model/modelUtils';
import { asArray } from '../../utils/objectUtils';
import type { Model, OperationOptions, QueryBuilder } from './types';

class InsertAndFetchOperation extends DelegateOperation {
  declare delegate: InsertOperation;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);

    if (!this.delegate.is(InsertOperation)) {
      throw new Error('Invalid delegate');
    }
  }

  get models(): Model[] {
    return this.delegate.models;
  }

  async onAfter2(builder: QueryBuilder, inserted: unknown): Promise<unknown> {
    const modelClass = builder.modelClass();
    const insertedModels = await super.onAfter2(builder, inserted);

    const insertedModelArray = asArray(insertedModels as Model | Model[]);
    const idProps = modelClass.getIdPropertyArray();
    const ids = insertedModelArray.map((model) => model.$id());

    const fetchedModels = await modelClass
      .query()
      .childQueryOf(builder)
      .findByIds(ids)
      .castTo(builder.resultModelClass());

    const modelsById = keyByProps(fetchedModels, idProps);

    // Instead of returning the freshly fetched models, update the input
    // models with the fresh values.
    insertedModelArray.forEach((insertedModel) => {
      insertedModel.$set(modelsById.get(insertedModel.$propKey(idProps)));
    });

    return insertedModels;
  }
}

export { InsertAndFetchOperation };
