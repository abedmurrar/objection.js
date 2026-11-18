import { withWhereScope } from '../../queryBuilder/whereScopes';
import { UnrelateOperation } from '../../queryBuilder/operations/UnrelateOperation';
import type { Relation, RelationQueryBuilder } from '../Relation';
import type { RelationOwner } from '../RelationOwner';
import { copyRelatedFilters } from './copyRelatedFilters';

class HasManyUnrelateOperation extends UnrelateOperation {
  declare relation: Relation;
  declare owner: RelationOwner;

  queryExecutor(builder: RelationQueryBuilder): RelationQueryBuilder {
    const patch = {};
    const relatedProp = this.relation.relatedProp;
    const ownerValues = this.owner.getProps(this.relation);
    const relatedRefs = relatedProp.refs(builder);

    relatedProp.forEach((i) => {
      relatedProp.patch(patch, i, null);
    });

    const query = this.relation.relatedModelClass.query().childQueryOf(builder).patch(patch);

    copyRelatedFilters(builder, query, this.relation);
    withWhereScope(query, () => query.whereInComposite(relatedRefs, ownerValues));
    withWhereScope(query, () => query.modify(this.relation.modify));

    return query;
  }
}

export { HasManyUnrelateOperation };
