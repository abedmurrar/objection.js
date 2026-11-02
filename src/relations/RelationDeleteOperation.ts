import { DeleteOperation } from '../queryBuilder/operations/DeleteOperation';
import { RelationFindOperation } from './RelationFindOperation';
import type { Relation, RelationOperationOptions, RelationQueryBuilder } from './Relation';
import type { RelationOwner } from './RelationOwner';

class RelationDeleteOperation extends DeleteOperation {
  declare relation: Relation;
  declare owner: RelationOwner;

  constructor(name: string, opt: RelationOperationOptions) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
  }

  onBuild(builder: RelationQueryBuilder): void {
    super.onBuild(builder);
    this.relation.findQuery(builder, this.owner);
  }

  toFindOperation(): RelationFindOperation {
    return new RelationFindOperation('find', {
      relation: this.relation,
      owner: this.owner,
    });
  }
}

export { RelationDeleteOperation };
