import { RelationDeleteOperation } from '../RelationDeleteOperation';
import type { RelationQueryBuilder } from '../Relation';

class BelongsToOneDeleteOperation extends RelationDeleteOperation {
  onAfter1(_: RelationQueryBuilder, result: unknown): unknown {
    if (this.owner.isModels) {
      const ownerProp = this.relation.ownerProp;

      for (const owner of this.owner.modelArray) {
        ownerProp.forEach((i) => {
          ownerProp.setProp(owner, i, null);
        });
      }
    }

    return result;
  }
}

export { BelongsToOneDeleteOperation };
