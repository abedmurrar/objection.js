import type { QueryBuilderBase } from '../QueryBuilderBase';
import type { QueryBuilderOperationSupport } from '../QueryBuilderOperationSupport';

class QueryTransformation {
  onConvertQueryBuilderBase(
    item: QueryBuilderBase,
    builder: QueryBuilderOperationSupport | null,
  ): QueryBuilderBase {
    return item;
  }
}

export { QueryTransformation };
