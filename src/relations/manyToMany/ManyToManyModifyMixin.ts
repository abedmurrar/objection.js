import { withWhereScope } from '../../queryBuilder/whereScopes';
import { ManyToManyFindOperation } from './find/ManyToManyFindOperation';
import type { RelationQueryBuilder } from '../Relation';
import type { RelationOwner } from '../RelationOwner';
import type { ManyToManyRelation } from './ManyToManyRelation';

// What the mixin needs from the operation class it extends (one of the
// ManyToMany*OperationBase classes).
interface ManyToManyModifyOperation {
  relation: ManyToManyRelation;
  owner: RelationOwner;
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
const ManyToManyModifyMixin = <T extends ManyToManyModifyOperationClass>(Operation: T) => {
  return class extends Operation {
    declare modifyFilterSubquery: RelationQueryBuilder | null;

    // The arguments of the operation class this mixin is applied to.
    constructor(...args: any[]) {
      super(...args);
      this.modifyFilterSubquery = null;
    }

    get modifyMainQuery(): boolean {
      return true;
    }

    // At this point `builder` should only have the user's own wheres and joins. There can
    // be other operations (like orderBy) too, but those are meaningless with modify operations.
    onBuild(builder: RelationQueryBuilder) {
      this.modifyFilterSubquery = this.createModifyFilterSubquery(builder);

      if (this.modifyMainQuery) {
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
      const subquery = this.modifyFilterSubquery.clone().select(idRefs);

      return builder.whereInComposite(idRefs, subquery);
    }

    applyModifyFilterForJoinTable(builder: RelationQueryBuilder): RelationQueryBuilder {
      const joinTableOwnerRefs = this.relation.joinTableOwnerProp.refs(builder);
      const joinTableRelatedRefs = this.relation.joinTableRelatedProp.refs(builder);

      const relatedRefs = this.relation.relatedProp.refs(builder);
      const ownerValues = this.owner.getProps(this.relation);

      const subquery = this.modifyFilterSubquery.clone().select(relatedRefs);

      return builder
        .whereInComposite(joinTableRelatedRefs, subquery)
        .whereInComposite(joinTableOwnerRefs, ownerValues);
    }

    toFindOperation(): ManyToManyFindOperation {
      return new ManyToManyFindOperation('find', {
        relation: this.relation,
        owner: this.owner,
      });
    }

    clone(): this {
      const clone = super.clone();
      clone.modifyFilterSubquery = this.modifyFilterSubquery;
      return clone;
    }
  };
};

export { ManyToManyModifyMixin };
