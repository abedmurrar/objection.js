import { ObjectionToKnexConvertingOperation } from './ObjectionToKnexConvertingOperation';
import type { KnexBuilder, QueryBuilder } from './types';

// An operation that simply calls the equivalent knex method.
class KnexOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    return knexBuilder[this.name as string].apply(knexBuilder, this.getKnexArgs(builder));
  }
}

export { KnexOperation };
