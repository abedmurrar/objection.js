import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { Relation, RelationOperationOptions } from '../../relations/Relation';

class UnrelateOperation extends QueryBuilderOperation {
  declare relation: Relation;
  declare owner: unknown;
  declare ids: unknown;

  constructor(name: string | null, opt: RelationOperationOptions) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.ids = null;
  }

  clone(): this {
    const clone = super.clone();
    clone.ids = this.ids;
    return clone;
  }
}

export { UnrelateOperation };
