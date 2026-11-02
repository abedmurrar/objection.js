import { QueryTransformation } from './QueryTransformation';
import type { QueryBuilderBase } from '../QueryBuilderBase';
import type { QueryBuilderOperationSupport } from '../QueryBuilderOperationSupport';

class CompositeQueryTransformation extends QueryTransformation {
  declare transformations: QueryTransformation[];

  constructor(transformations: QueryTransformation[]) {
    super();
    this.transformations = transformations;
  }

  onConvertQueryBuilderBase(
    item: QueryBuilderBase,
    builder: QueryBuilderOperationSupport | null,
  ): QueryBuilderBase {
    for (const transformation of this.transformations) {
      item = transformation.onConvertQueryBuilderBase(item, builder);
    }

    return item;
  }
}

export { CompositeQueryTransformation };
