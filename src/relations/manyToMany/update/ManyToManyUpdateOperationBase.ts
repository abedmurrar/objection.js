import { withWhereScope } from '../../../queryBuilder/whereScopes';
import { UpdateOperation } from '../../../queryBuilder/operations/UpdateOperation';
import type { RelationOperationOptions, RelationQueryBuilder } from '../../Relation';
import type { RelationOwner } from '../../RelationOwner';
import type { ManyToManyRelation } from '../ManyToManyRelation';

class ManyToManyUpdateOperationBase extends UpdateOperation {
  // Defined by `ManyToManyModifyMixin`, which every concrete class uses.
  declare applyModifyFilterForRelatedTable: (builder: RelationQueryBuilder) => RelationQueryBuilder;
  declare applyModifyFilterForJoinTable: (builder: RelationQueryBuilder) => RelationQueryBuilder;

  declare relation: ManyToManyRelation;
  declare owner: RelationOwner;

  declare hasExtraProps: boolean;
  declare joinTablePatch: Record<string, unknown>;
  declare skipRelationFilter: boolean;

  constructor(name: string, opt: RelationOperationOptions<ManyToManyRelation>) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;

    this.hasExtraProps = false;
    this.joinTablePatch = {};
    this.skipRelationFilter = false;
  }

  // Only patches with join table extras write join rows.
  get modifiesJoinTable(): boolean {
    return this.hasExtraProps;
  }

  get modifiesJoinTableOnly(): boolean {
    return false;
  }

  onAdd(builder: RelationQueryBuilder, args: unknown[]): boolean {
    const obj = args[0] as Record<string, unknown>;

    // The updated rows are known to be related to the owner, so they keep
    // their own filters, and the join rows are filtered by the ids of the
    // owner and the updated model. A subquery that joins the join table
    // deadlocks concurrent updates on MySQL (#135).
    this.skipRelationFilter = builder.internalOptions().skipRelationFilter;

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
    // A query resolved without updating anything, e.g. with `none()`, leaves
    // the join rows untouched too.
    if (this.hasExtraProps && !this.isResolvedWithoutUpdate(builder)) {
      const joinTableUpdateQuery = this.relation
        .getJoinModelClass(builder.knex())!
        .query()
        .childQueryOf(builder)
        .patch(this.joinTablePatch);

      withWhereScope(joinTableUpdateQuery, () => {
        if (this.skipRelationFilter) {
          this.applyIdFilterForJoinTable(joinTableUpdateQuery);
        } else {
          this.applyModifyFilterForJoinTable(joinTableUpdateQuery);
        }
      });
      withWhereScope(joinTableUpdateQuery, () => {
        joinTableUpdateQuery.modify(this.relation.joinTableModify);
      });

      await joinTableUpdateQuery;
      return result;
    } else {
      return result;
    }
  }

  // Filters the join rows by the ids of the owner and the updated model.
  applyIdFilterForJoinTable(builder: RelationQueryBuilder): RelationQueryBuilder {
    return builder
      .whereInComposite(
        this.relation.joinTableOwnerProp.refs(builder),
        this.owner.getProps(this.relation),
      )
      .whereComposite(
        this.relation.joinTableRelatedProp!.refs(builder),
        this.relation.relatedProp.getProps(this.model),
      );
  }

  clone(): this {
    const clone = super.clone();

    clone.hasExtraProps = this.hasExtraProps;
    clone.joinTablePatch = this.joinTablePatch;
    clone.skipRelationFilter = this.skipRelationFilter;

    return clone;
  }
}

export { ManyToManyUpdateOperationBase };
