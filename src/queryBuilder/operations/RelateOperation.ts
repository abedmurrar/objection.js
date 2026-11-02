import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { Relation, RelationOperationOptions } from '../../relations/Relation';

class RelateOperation extends QueryBuilderOperation {
  declare relation: Relation;
  declare owner: unknown;
  declare input: unknown;
  declare ids: unknown;

  constructor(name: string | null, opt: RelationOperationOptions) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.input = null;
    this.ids = null;
  }

  clone(): this {
    const clone = super.clone();

    clone.input = this.input;
    clone.ids = this.ids;

    return clone;
  }
}

export { RelateOperation };
