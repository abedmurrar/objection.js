import { withWhereScope } from '../../queryBuilder/whereScopes';
import { normalizeIds } from '../../utils/normalizeIds';
import { RelateOperation } from '../../queryBuilder/operations/RelateOperation';
import type { Relation, RelationQueryBuilder } from '../Relation';
import type { RelationOwner } from '../RelationOwner';

class HasManyRelateOperation extends RelateOperation {
  declare relation: Relation;
  declare owner: RelationOwner;

  onAdd(_: RelationQueryBuilder, args: unknown[]): boolean {
    this.input = args[0];

    this.ids = normalizeIds(args[0], this.relation.relatedModelClass.getIdRelationProperty(), {
      arrayOutput: true,
    });

    assertOwnerIsSingleItem(this.owner, this.relation);
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

function assertOwnerIsSingleItem(owner: RelationOwner, relation: Relation): void {
  const { isModels, isIdentifiers, isQueryBuilder } = owner;
  const { ownerProp } = relation;

  const singleModel = isModels && owner.modelArray.length === 1;
  const singleId = isIdentifiers && owner.getNormalizedIdentifiers(ownerProp).length === 1;

  if (!singleModel && !singleId && !isQueryBuilder) {
    throw new Error(
      [
        'Can only relate items for one parent at a time in case of HasManyRelation.',
        'Otherwise multiple update queries would need to be created.',

        'If you need to relate items for multiple parents, simply loop through them.',
        `That's the most performant way.`,
      ].join(' '),
    );
  }
}

export { HasManyRelateOperation };
