import { RelationInsertOperation } from '../RelationInsertOperation';
import { BelongsToOneRelateOperation } from './BelongsToOneRelateOperation';
import { InsertGraphOperation } from '../../queryBuilder/operations/InsertGraphOperation';
import type { RelationQueryBuilder } from '../Relation';

class BelongsToOneInsertOperation extends RelationInsertOperation {
  onAdd(builder: RelationQueryBuilder, args: unknown[]): boolean {
    const retVal = super.onAdd(builder, args);

    if (this.models.length > 1) {
      throw this.relation.createError('can only insert one model to a BelongsToOneRelation');
    }

    return retVal;
  }

  async onAfter1(builder: RelationQueryBuilder, ret: unknown) {
    const inserted = await super.onAfter1(builder, ret);

    // A query resolved without executing it, e.g. with `resolve()`, inserted
    // nothing. `insertGraph()` resolves the query itself, but always inserts
    // the graph.
    if (!builder.isExecutable() && !builder.has(InsertGraphOperation)) {
      return inserted;
    }

    const relateOp = new BelongsToOneRelateOperation('relate', {
      relation: this.relation,
      owner: this.owner,
    });

    if (this.assignResultToOwner && this.owner.isModels) {
      for (const owner of this.owner.modelArray) {
        owner.$setRelated(this.relation, inserted);
      }
    }

    relateOp.onAdd(builder, [inserted]);
    await relateOp.queryExecutor(builder);

    return inserted;
  }
}

export { BelongsToOneInsertOperation };
