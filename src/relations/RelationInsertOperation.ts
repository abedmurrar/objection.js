import { InsertOperation } from '../queryBuilder/operations/InsertOperation';
import type { Relation, RelationOperationOptions, RelationQueryBuilder } from './Relation';
import type { RelationOwner } from './RelationOwner';

class RelationInsertOperation extends InsertOperation {
  declare relation: Relation;
  declare owner: RelationOwner;
  declare assignResultToOwner: boolean;

  constructor(name: string, opt: RelationOperationOptions) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.assignResultToOwner = true;
  }

  async onBefore2(builder: RelationQueryBuilder, result: unknown) {
    const queryContext = builder.context();
    result = await this.relation.executeBeforeInsert(this.models, queryContext, result);
    return super.onBefore2(builder, result);
  }

  clone(): this {
    const clone = super.clone();

    clone.relation = this.relation;
    clone.owner = this.owner;
    clone.assignResultToOwner = this.assignResultToOwner;

    return clone;
  }
}

export { RelationInsertOperation };
