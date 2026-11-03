import { DeleteOperation } from '../../../queryBuilder/operations/DeleteOperation';
import type { RelationOperationOptions, RelationQueryBuilder } from '../../Relation';
import type { RelationOwner } from '../../RelationOwner';
import type { ManyToManyRelation } from '../ManyToManyRelation';

class ManyToManyDeleteOperationBase extends DeleteOperation {
  declare relation: ManyToManyRelation;
  declare owner: RelationOwner;

  constructor(name: string, opt: RelationOperationOptions<ManyToManyRelation>) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
  }

  // Deletes only delete the related rows.
  get modifiesJoinTable(): boolean {
    return false;
  }

  get modifiesJoinTableOnly(): boolean {
    return false;
  }

  /* istanbul ignore next */
  applyModifyFilterForRelatedTable(builder: RelationQueryBuilder): RelationQueryBuilder {
    throw new Error('not implemented');
  }

  /* istanbul ignore next */
  applyModifyFilterForJoinTable(builder: RelationQueryBuilder): RelationQueryBuilder {
    throw new Error('not implemented');
  }
}

export { ManyToManyDeleteOperationBase };
