import { RelationDeleteOperation } from '../RelationDeleteOperation';
import type { RelationQueryBuilder } from '../Relation';

class BelongsToOneDeleteOperation extends RelationDeleteOperation {
  onAfter1(builder: RelationQueryBuilder, result: unknown): unknown {
    // A query resolved without executing it, e.g. with `none()`, deleted
    // nothing, so the owners are left untouched.
    if (this.owner.isModels && !builder.isExplicitlyResolvedOrRejected()) {
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
