import { isPostgres } from '../../../utils/knexUtils';
import { normalizeIds } from '../../../utils/normalizeIds';
import { RelateOperation } from '../../../queryBuilder/operations/RelateOperation';
import type { RelationModel, RelationOperationOptions, RelationQueryBuilder } from '../../Relation';
import type { RelationOwner } from '../../RelationOwner';
import type { ManyToManyRelation } from '../ManyToManyRelation';

class ManyToManyRelateOperation extends RelateOperation {
  declare opt: RelationOperationOptions<ManyToManyRelation>;
  declare relation: ManyToManyRelation;
  declare owner: RelationOwner;
  declare ids: object[];

  onAdd(builder: RelationQueryBuilder, args: unknown[]): boolean {
    this.input = args[0];
    // Without `arrayOutput`, these are id objects.
    this.ids = normalizeIds(args[0], this.relation.relatedProp) as object[];

    assertOwnerIsSingleItem(builder, this.owner, this.relation);
    return true;
  }

  queryExecutor(builder: RelationQueryBuilder): RelationQueryBuilder {
    const joinModelClass = this.relation.getJoinModelClass(builder.knex())!;
    const ownerValues = this.owner.getSplitProps(builder, this.relation);
    const joinModels: RelationModel[] = [];

    for (const ownerValue of ownerValues) {
      for (const relatedValue of this.ids) {
        joinModels.push(
          joinModelClass.fromJson(this.relation.createJoinModel(ownerValue, relatedValue)),
        );
      }
    }

    return joinModelClass
      .query()
      .childQueryOf(builder)
      .modify((query: RelationQueryBuilder) => {
        if (!this.opt.dontCopyReturning) {
          query.copyFrom(builder, /returning/);
        }

        if (!this.opt.dontCopyOnConflict) {
          query.copyFrom(builder, /onConflict|ignore|merge/);
        }
      })
      .runBefore((_: unknown, builder: RelationQueryBuilder) => {
        return this.relation.executeJoinTableBeforeInsert(joinModels, builder.context(), null);
      })
      .insert(joinModels)
      .runAfter((models: unknown) => {
        return Array.isArray(models) ? models.length : 1;
      });
  }
}

function assertOwnerIsSingleItem(
  builder: RelationQueryBuilder,
  owner: RelationOwner,
  relation: ManyToManyRelation,
): void {
  const { isModels, isIdentifiers, isQueryBuilder } = owner;
  const { ownerProp } = relation;

  const singleModel = isModels && owner.modelArray.length === 1;
  const singleId = isIdentifiers && owner.getNormalizedIdentifiers(ownerProp).length === 1;

  if (isPostgres(builder.unsafeKnex())) {
    if (!isModels && !isIdentifiers && !isQueryBuilder) {
      throw new Error(
        'Parent must be a list of identifiers or a list of models when relating a ManyToManyRelation',
      );
    }
  } else {
    if (!singleModel && !singleId && !isQueryBuilder) {
      throw new Error(
        [
          'Can only relate items for one parent at a time in case of ManyToManyRelation.',
          'Otherwise multiple insert queries would need to be created.',

          'If you need to relate items for multiple parents, simply loop through them.',
          `That's the most performant way.`,
        ].join(' '),
      );
    }
  }
}

export { ManyToManyRelateOperation };
