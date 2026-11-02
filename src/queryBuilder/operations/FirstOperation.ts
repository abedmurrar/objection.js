import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { KnexBuilder, QueryBuilder } from './types';

class FirstOperation extends QueryBuilderOperation {
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const modelClass = builder.modelClass();

    if (builder.isFind() && modelClass.useLimitInFirst) {
      knexBuilder = knexBuilder.limit(1);
    }

    return knexBuilder;
  }

  onAfter3(_: QueryBuilder, result: unknown): unknown {
    if (Array.isArray(result)) {
      return result[0];
    } else {
      return result;
    }
  }
}

export { FirstOperation };
