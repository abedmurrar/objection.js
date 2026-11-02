import { withWhereScope } from '../../../queryBuilder/whereScopes';
import { UpdateOperation } from '../../../queryBuilder/operations/UpdateOperation';
import type { RelationOperationOptions, RelationQueryBuilder } from '../../Relation';
import type { RelationOwner } from '../../RelationOwner';
import type { ManyToManyRelation } from '../ManyToManyRelation';

class ManyToManyUpdateOperationBase extends UpdateOperation {
  declare relation: ManyToManyRelation;
  declare owner: RelationOwner;

  declare hasExtraProps: boolean;
  declare joinTablePatch: Record<string, unknown>;
  declare joinTablePatchFilterQuery: RelationQueryBuilder | null;

  constructor(name: string, opt: RelationOperationOptions<ManyToManyRelation>) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;

    this.hasExtraProps = false;
    this.joinTablePatch = {};
    this.joinTablePatchFilterQuery = null;
  }

  onAdd(builder: RelationQueryBuilder, args: unknown[]): boolean {
    const obj = args[0] as Record<string, unknown>;

    // Copy all extra properties to the `joinTablePatch` object.
    for (const extra of this.relation.joinTableExtras) {
      if (extra.aliasProp in obj) {
        this.hasExtraProps = true;
        this.joinTablePatch[extra.joinTableProp] = obj[extra.aliasProp];
      }
    }

    const res = super.onAdd(builder, args);

    if (this.hasExtraProps) {
      // Make sure we don't try to insert the extra properties
      // to the target table.
      this.relation.omitExtraProps([this.model]);
    }

    return res;
  }

  async onAfter1(builder: RelationQueryBuilder, result: unknown) {
    if (this.hasExtraProps) {
      const joinTableUpdateQuery = this.relation
        .getJoinModelClass(builder.knex())!
        .query()
        .childQueryOf(builder)
        .patch(this.joinTablePatch);

      withWhereScope(joinTableUpdateQuery, () => {
        this.applyModifyFilterForJoinTable(joinTableUpdateQuery);
      });

      await joinTableUpdateQuery.modify(this.relation.joinTableModify);
      return result;
    } else {
      return result;
    }
  }

  /* istanbul ignore next */
  applyModifyFilterForRelatedTable(builder: RelationQueryBuilder): RelationQueryBuilder {
    throw new Error('not implemented');
  }

  /* istanbul ignore next */
  applyModifyFilterForJoinTable(builder: RelationQueryBuilder): RelationQueryBuilder {
    throw new Error('not implemented');
  }

  clone(): this {
    const clone = super.clone();

    clone.hasExtraProps = this.hasExtraProps;
    clone.joinTablePatch = this.joinTablePatch;
    clone.joinTablePatchFilterQuery = this.joinTablePatchFilterQuery;

    return clone;
  }
}

export { ManyToManyUpdateOperationBase };
