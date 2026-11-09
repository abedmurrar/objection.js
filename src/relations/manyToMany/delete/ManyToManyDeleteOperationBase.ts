import { DeleteOperation } from '../../../queryBuilder/operations/DeleteOperation';
import type { RelationOperationOptions, RelationQueryBuilder } from '../../Relation';
import type { RelationOwner } from '../../RelationOwner';
import type { ManyToManyRelation } from '../ManyToManyRelation';

class ManyToManyDeleteOperationBase extends DeleteOperation {
  // Defined by `ManyToManyModifyMixin`, which every concrete class uses.
  declare applyModifyFilterForRelatedTable: (builder: RelationQueryBuilder) => RelationQueryBuilder;
  declare applyModifyFilterForJoinTable: (builder: RelationQueryBuilder) => RelationQueryBuilder;

  declare relation: ManyToManyRelation;
  declare owner: RelationOwner;
  declare skipRelationFilter: boolean;

  constructor(name: string, opt: RelationOperationOptions<ManyToManyRelation>) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.skipRelationFilter = false;
  }

  // The rows that `upsertGraph()` deletes are known to be related to the
  // owner, so they keep their own filters, like the ids of `findByIds()`.
  onAdd(builder: RelationQueryBuilder, args: unknown[]): boolean {
    this.skipRelationFilter = builder.internalOptions().skipRelationFilter;
    return super.onAdd(builder, args);
  }

  // Deletes only delete the related rows.
  get modifiesJoinTable(): boolean {
    return false;
  }

  get modifiesJoinTableOnly(): boolean {
    return false;
  }
}

export { ManyToManyDeleteOperationBase };
