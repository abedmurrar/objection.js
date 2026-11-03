import { withWhereScope } from '../../queryBuilder/whereScopes';
import { ManyToManyFindOperation } from './find/ManyToManyFindOperation';
import type { RelationOperationOptions, RelationQueryBuilder } from '../Relation';
import type { RelationOwner } from '../RelationOwner';
import type { ManyToManyRelation } from './ManyToManyRelation';

// What the mixin needs from the operation class it extends (one of the
// ManyToMany*OperationBase classes).
interface ManyToManyModifyOperation {
  relation: ManyToManyRelation;
  owner: RelationOwner;
  // Whether the operation writes join rows (unrelate, or a patch with join
  // table extras), and whether it writes only those (unrelate).
  readonly modifiesJoinTable: boolean;
  readonly modifiesJoinTableOnly: boolean;
  onBuild(builder: RelationQueryBuilder): void;
  clone(): this;
  applyModifyFilterForRelatedTable(builder: RelationQueryBuilder): RelationQueryBuilder;
  applyModifyFilterForJoinTable(builder: RelationQueryBuilder): RelationQueryBuilder;
}

// A mixin's base class must have a constructor that takes `...args: any[]`.
export type ManyToManyModifyOperationClass = new (...args: any[]) => ManyToManyModifyOperation;

// This mixin contains the shared code for all modify operations (update, delete, relate, unrelate)
// for ManyToManyRelation operations.
//
// The most important thing this mixin does is that it moves the filters from the main query
// into a subquery and then adds a single where clause that uses the subquery. This is done so
// that we are able to `innerJoin` the join table to the query. Most SQL engines don't allow
// joins in updates or deletes. Join table is joined so that queries can reference the join
// table columns.
//
// The join rows are filtered separately, by a subquery for each join row, so
// that only the join rows that match the filters are modified (#1853).
const ManyToManyModifyMixin = <T extends ManyToManyModifyOperationClass>(Operation: T) => {
  return class extends Operation {
    declare modifyFilterSubquery: RelationQueryBuilder | null;
    declare joinRowFilterSubquery: RelationQueryBuilder | null;
    declare skipRelationFilter: boolean;

    // The arguments of the operation class this mixin is applied to.
    constructor(...args: any[]) {
      super(...args);
      this.modifyFilterSubquery = null;
      this.joinRowFilterSubquery = null;
      this.skipRelationFilter = false;
    }

    // Unrelate doesn't execute the main query, and updates of rows that are
    // known to be related, like the patches of `upsertGraph()`, keep their own
    // filters (#135).
    get modifyMainQuery(): boolean {
      return !this.modifiesJoinTableOnly && !this.skipRelationFilter;
    }

    // At this point `builder` should only have the user's own wheres and joins. There can
    // be other operations (like orderBy) too, but those are meaningless with modify operations.
    onBuild(builder: RelationQueryBuilder) {
      if (this.modifiesJoinTable && !this.skipRelationFilter) {
        this.joinRowFilterSubquery = this.createJoinRowFilterSubquery(builder);
      }

      if (this.modifyMainQuery) {
        this.modifyFilterSubquery = this.createModifyFilterSubquery(builder);

        // We can now remove the where and join statements from the main query.
        this.removeFiltersFromMainQuery(builder);

        // Add a single where clause that uses the created subquery.
        withWhereScope(builder, () => this.applyModifyFilterForRelatedTable(builder));
      }

      return super.onBuild(builder);
    }

    createModifyFilterSubquery(builder: RelationQueryBuilder): RelationQueryBuilder {
      const relatedModelClass = this.relation.relatedModelClass;
      const builderClass = builder.constructor;

      // Create an empty subquery.
      const modifyFilterSubquery = relatedModelClass.query().childQueryOf(builder);

      // Add the necessary joins and wheres so that only rows related to
      // `this.owner` are selected.
      this.relation.findQuery(modifyFilterSubquery, this.owner);

      // Copy all where and join statements from the main query to the subquery.
      modifyFilterSubquery
        .copyFrom(builder, builderClass.WhereSelector)
        .copyFrom(builder, builderClass.JoinSelector);

      return modifyFilterSubquery.clearSelect();
    }

    removeFiltersFromMainQuery(builder: RelationQueryBuilder): void {
      const builderClass = builder.constructor;

      builder.clear(builderClass.WhereSelector);
      builder.clear(builderClass.JoinSelector);
    }

    applyModifyFilterForRelatedTable(builder: RelationQueryBuilder): RelationQueryBuilder {
      const idRefs = this.relation.relatedModelClass.getIdRelationProperty().refs(builder);
      const subquery = this.modifyFilterSubquery!.clone().select(idRefs);

      return builder.whereInComposite(idRefs, subquery);
    }

    // Only modifies the join rows of the owner whose related row matches the
    // filters (#1853).
    applyModifyFilterForJoinTable(builder: RelationQueryBuilder): RelationQueryBuilder {
      const joinTableOwnerRefs = this.relation.joinTableOwnerProp.refs(builder);
      const ownerValues = this.owner.getProps(this.relation);

      return builder
        .whereInComposite(joinTableOwnerRefs, ownerValues)
        .whereExists(this.joinRowFilterSubquery!);
    }

    // Selects the related row of a join row if it matches the filters. The
    // join table isn't joined, so that the filters on its columns apply to the
    // join row of the outer query.
    createJoinRowFilterSubquery(builder: RelationQueryBuilder): RelationQueryBuilder {
      const { relation } = this;
      const builderClass = builder.constructor;
      const subquery = relation.relatedModelClass.query().childQueryOf(builder);
      const joinTableRef = builder.tableRefFor(relation.joinTable!);

      withWhereScope(subquery, () => {
        relation.relatedProp.forEach((i: number) => {
          const relatedRef = relation.relatedProp.ref(subquery, i);
          const joinTableRelatedRef = relation.joinTableRelatedProp!.ref(subquery, i);

          subquery.where(relatedRef, joinTableRelatedRef.table(joinTableRef));
        });
      });

      return relation
        .applyModify(subquery)
        .copyFrom(builder, builderClass.WhereSelector)
        .copyFrom(builder, builderClass.JoinSelector)
        .select(1);
    }

    toFindOperation(): ManyToManyFindOperation {
      const opt = {
        relation: this.relation,
        owner: this.owner,
      };

      if (this.modifyMainQuery && this.modifyFilterSubquery) {
        // `onBuild()` has already moved the main query's filters into the
        // subquery and removed them. Apply them to the find query too (#2266).
        // The options are kept by clones of the operation.
        return new ManyToManyModifyFindOperation('find', {
          ...opt,
          modifyOperation: this,
        } as RelationOperationOptions<ManyToManyRelation>);
      } else {
        return new ManyToManyFindOperation('find', opt);
      }
    }

    clone(): this {
      const clone = super.clone();
      clone.modifyFilterSubquery = this.modifyFilterSubquery;
      clone.joinRowFilterSubquery = this.joinRowFilterSubquery;
      clone.skipRelationFilter = this.skipRelationFilter;
      return clone;
    }
  };
};

// The find query of `asFindQuery()`, with the filters that the modify
// operation moved into its subquery.
class ManyToManyModifyFindOperation extends ManyToManyFindOperation {
  onBuild(builder: RelationQueryBuilder): void {
    super.onBuild(builder);

    const { modifyOperation } = this.opt as { modifyOperation: ManyToManyModifyOperation };
    withWhereScope(builder, () => modifyOperation.applyModifyFilterForRelatedTable(builder));
  }
}

export { ManyToManyModifyMixin };
