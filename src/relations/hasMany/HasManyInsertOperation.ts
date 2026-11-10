import { RelationInsertOperation } from '../RelationInsertOperation';
import type { RelationQueryBuilder } from '../Relation';
import { assertSingleOwner } from '../RelationOwner';

class HasManyInsertOperation extends RelationInsertOperation {
  onAdd(builder: RelationQueryBuilder, args: unknown[]): boolean {
    const retVal = super.onAdd(builder, args);
    assertSingleOwner(this.owner, this.relation, 'insert', 'HasManyRelation', 'insert');

    const ownerValues = this.owner.getSplitProps(builder, this.relation);
    const relatedProp = this.relation.relatedProp;

    for (const model of this.models) {
      for (let j = 0, lp = relatedProp.size; j < lp; ++j) {
        relatedProp.setProp(model, j, ownerValues[0][j]);
      }
    }

    return retVal;
  }

  async onAfter1(builder: RelationQueryBuilder, ret: unknown) {
    const inserted = await super.onAfter1(builder, ret);

    if (!this.assignResultToOwner) {
      return inserted;
    }

    if (this.owner.isModels) {
      for (const owner of this.owner.modelArray) {
        owner.$appendRelated(this.relation, inserted);
      }
    }

    return inserted;
  }
}

export { HasManyInsertOperation };
