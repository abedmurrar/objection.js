import { normalizeIds } from '../../utils/normalizeIds';
import { RelateOperation } from '../../queryBuilder/operations/RelateOperation';
import type { Relation, RelationQueryBuilder } from '../Relation';
import type { RelationOwner } from '../RelationOwner';

class BelongsToOneRelateOperation extends RelateOperation {
  declare relation: Relation;
  declare owner: RelationOwner;
  declare ids: unknown[][];

  onAdd(_: RelationQueryBuilder, args: unknown[]): boolean {
    this.input = args[0];
    this.ids = normalizeIds(args[0], this.relation.relatedProp, { arrayOutput: true });

    assertOneId(this.ids);
    return true;
  }

  queryExecutor(builder: RelationQueryBuilder): RelationQueryBuilder {
    const patch = {};
    const ownerProp = this.relation.ownerProp;

    ownerProp.forEach((i) => {
      const relatedValue = this.ids[0][i];

      if (this.owner.isModels) {
        for (const owner of this.owner.modelArray) {
          ownerProp.setProp(owner, i, relatedValue);
        }
      }

      ownerProp.patch(patch, i, relatedValue);
    });

    const ownerIdProp = this.relation.ownerModelClass.getIdRelationProperty();
    const ownerIds = this.owner.getProps(this.relation, ownerIdProp);

    return this.relation.ownerModelClass
      .query()
      .childQueryOf(builder)
      .patch(patch)
      .whereInComposite(ownerIdProp.refs(builder), ownerIds);
  }
}

function assertOneId(ids: unknown[]): void {
  if (ids.length > 1) {
    throw new Error('can only relate one model to a BelongsToOneRelation');
  }
}

export { BelongsToOneRelateOperation };
