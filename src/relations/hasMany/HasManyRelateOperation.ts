import { withWhereScope } from '../../queryBuilder/whereScopes';
import { normalizeIds } from '../../utils/normalizeIds';
import { RelateOperation } from '../../queryBuilder/operations/RelateOperation';
import type { Relation, RelationQueryBuilder } from '../Relation';
import { assertSingleOwner } from '../RelationOwner';
import type { RelationOwner } from '../RelationOwner';

class HasManyRelateOperation extends RelateOperation {
  declare relation: Relation;
  declare owner: RelationOwner;

  onAdd(_: RelationQueryBuilder, args: unknown[]): boolean {
    this.input = args[0];

    this.ids = normalizeIds(args[0], this.relation.relatedModelClass.getIdRelationProperty(), {
      arrayOutput: true,
    });

    assertSingleOwner(this.owner, this.relation, 'relate', 'HasManyRelation', 'update');
    return true;
  }

  queryExecutor(builder: RelationQueryBuilder): RelationQueryBuilder {
    const patch = {};
    const relatedProp = this.relation.relatedProp;
    const ownerValues = this.owner.getSplitProps(builder, this.relation);

    relatedProp.forEach((i) => {
      relatedProp.patch(patch, i, ownerValues[0][i]);
    });

    const query = this.relation.relatedModelClass
      .query()
      .childQueryOf(builder)
      .patch(patch)
      .copyFrom(builder, builder.constructor.JoinSelector)
      .copyFrom(builder, builder.constructor.WhereSelector);

    withWhereScope(query, () => query.findByIds(this.ids));
    withWhereScope(query, () => query.modify(this.relation.modify));

    return query;
  }
}

export { HasManyRelateOperation };
