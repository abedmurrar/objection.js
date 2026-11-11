import { isObject, asArray, uniqBy } from '../utils/objectUtils';
import { normalizeIds } from '../utils/normalizeIds';
import type { Relation, RelationModel, RelationQueryBuilder } from './Relation';
import type { ReferenceBuilder } from '../queryBuilder/ReferenceBuilder';
import type { RelationProperty } from './RelationProperty';

const Type = {
  Models: 'Models',
  Reference: 'Reference',
  QueryBuilder: 'QueryBuilder',
  Identifiers: 'Identifiers',
} as const;

type OwnerType = (typeof Type)[keyof typeof Type];

class RelationOwner {
  // One or more models, an array of references, a query builder or
  // identifiers. `type` tells which.
  declare owner: unknown;
  declare type: OwnerType;

  constructor(owner: unknown) {
    this.owner = owner;
    this.type = detectType(owner);
  }

  static create(owner: unknown): RelationOwner {
    return new RelationOwner(owner);
  }

  static createParentReference(builder: RelationQueryBuilder, relation: Relation): RelationOwner {
    return this.create(relation.ownerProp.refs(findFirstNonPartialAncestorQuery(builder)));
  }

  get isModels(): boolean {
    return this.type === Type.Models;
  }

  get isReference(): boolean {
    return this.type === Type.Reference;
  }

  get isQueryBuilder(): boolean {
    return this.type === Type.QueryBuilder;
  }

  get isIdentifiers(): boolean {
    return this.type === Type.Identifiers;
  }

  get modelArray(): RelationModel[] {
    return asArray(this.owner as RelationModel | RelationModel[]);
  }

  get reference(): ReferenceBuilder[] {
    return this.owner as ReferenceBuilder[];
  }

  get queryBuilder(): RelationQueryBuilder {
    return this.owner;
  }

  get identifiers(): unknown {
    return this.owner;
  }

  buildFindQuery(
    builder: RelationQueryBuilder,
    relation: Relation,
    relatedRefs: ReferenceBuilder[],
  ): RelationQueryBuilder {
    if (this.isReference) {
      relatedRefs.forEach((relatedRef, i) => {
        builder.where(relatedRef, this.reference[i]);
      });
    } else if (this.isModels || this.isIdentifiers || this.isQueryBuilder) {
      const values = this.getProps(relation);

      if (values) {
        builder.whereInComposite(relatedRefs, values);
      } else {
        builder.where(false).resolve([]);
      }
    } else {
      builder.where(false).resolve([]);
    }

    return builder;
  }

  // Returns an array of value arrays (one per owner), or a query builder
  // that selects them.
  getProps(relation: Relation, ownerProp: RelationProperty = relation.ownerProp) {
    if (this.isModels) {
      return this._getPropsFromModels(ownerProp);
    } else if (this.isIdentifiers) {
      return this._getPropsFromIdentifiers(relation, ownerProp);
    } else if (this.isQueryBuilder) {
      return this._getPropsFromQuery(relation, ownerProp);
    }
  }

  getSplitProps(builder: RelationQueryBuilder, relation: Relation) {
    const { ownerProp } = relation;
    const values = this.getProps(relation, relation.ownerProp);

    if (isQueryBuilder(values)) {
      if (ownerProp.size === 1) {
        return [[values]];
      } else {
        // For composite keys, we need to create a query builder for each
        // key. Each query builder only select that key.
        return [
          Array.from({ length: ownerProp.size }).map((_, i) => {
            return values.clone().clearSelect().select(ownerProp.ref(builder, i));
          }),
        ];
      }
    } else {
      return values;
    }
  }

  getNormalizedIdentifiers(ownerProp: RelationProperty) {
    return normalizeIds(this.identifiers, ownerProp, {
      arrayOutput: true,
    });
  }

  _getPropsFromModels(ownerProp: RelationProperty): unknown[][] | null {
    const props = this.modelArray.map((owner) => ownerProp.getProps(owner));

    if (!containsNonNull(props)) {
      return null;
    }

    return uniqBy(props, join);
  }

  _getPropsFromIdentifiers(relation: Relation, ownerProp: RelationProperty) {
    const ids = this.getNormalizedIdentifiers(ownerProp);

    if (isIdProp(ownerProp)) {
      return ids;
    } else {
      const query = relation.ownerModelClass.query();

      query.findByIds(ids);
      query.select(ownerProp.refs(query));

      return query;
    }
  }

  _getPropsFromQuery(relation: Relation, ownerProp: RelationProperty): RelationQueryBuilder {
    const query = this.queryBuilder.clone();

    if (isOwnerModelClassQuery(query, relation)) {
      query.clearSelect();
      query.select(ownerProp.refs(query));
    }

    return query;
  }
}

function detectType(owner: unknown): OwnerType {
  if (isModel(owner) || isModelArray(owner)) {
    return Type.Models;
  } else if (isReferenceArray(owner)) {
    return Type.Reference;
  } else if (isQueryBuilder(owner)) {
    return Type.QueryBuilder;
  } else {
    return Type.Identifiers;
  }
}

function isModel(item: unknown): boolean {
  return isObject(item) && !!(item as { $isObjectionModel?: boolean }).$isObjectionModel;
}

function isModelArray(item: unknown): boolean {
  return Array.isArray(item) && isModel(item[0]);
}

function isReference(item: unknown): boolean {
  return (
    isObject(item) &&
    !!(item as { isObjectionReferenceBuilder?: boolean }).isObjectionReferenceBuilder
  );
}

function isReferenceArray(item: unknown): boolean {
  return Array.isArray(item) && isReference(item[0]);
}

function isQueryBuilder(item: unknown): boolean {
  return (
    isObject(item) && !!(item as { isObjectionQueryBuilder?: boolean }).isObjectionQueryBuilder
  );
}

function findFirstNonPartialAncestorQuery(builder: RelationQueryBuilder): RelationQueryBuilder {
  builder = builder.parentQuery();
  if (!builder)
    throw Error(
      'query method `for` ommitted outside a subquery, can not figure out relation target',
    );
  while (builder.isPartial()) {
    if (!builder.parentQuery()) {
      break;
    }

    builder = builder.parentQuery();
  }

  return builder;
}

function containsNonNull(arr: unknown[]): boolean {
  for (let i = 0, l = arr.length; i < l; ++i) {
    const val = arr[i];

    if (Array.isArray(val)) {
      if (containsNonNull(val)) {
        return true;
      }
    } else if (val !== null && val !== undefined) {
      return true;
    }
  }

  return false;
}

function join(id: unknown[]): string {
  return id.map((x) => (Buffer.isBuffer(x) ? x.toString('hex') : x)).join(',');
}

function isIdProp(relationProp: RelationProperty): boolean {
  const idProp = relationProp.modelClass.getIdRelationProperty();
  return idProp.props.every((prop, i) => prop === relationProp.props[i]);
}

function isOwnerModelClassQuery(query: RelationQueryBuilder, relation: Relation): boolean {
  return query.modelClass().getTableName() === relation.ownerModelClass.getTableName();
}

// Inserting or relating through a has-many or many-to-many relation needs one
// owner: a single model, a single id, or a query that selects the owner.
function assertSingleOwner(
  owner: RelationOwner,
  relation: Relation,
  verb: string,
  relationName: string,
  queryKind: string,
): void {
  const singleModel = owner.isModels && owner.modelArray.length === 1;
  const singleId =
    owner.isIdentifiers && owner.getNormalizedIdentifiers(relation.ownerProp).length === 1;

  if (!singleModel && !singleId && !owner.isQueryBuilder) {
    throw new Error(
      [
        `Can only ${verb} items for one parent at a time in case of ${relationName}.`,
        `Otherwise multiple ${queryKind} queries would need to be created.`,

        `If you need to ${verb} items for multiple parents, simply loop through them.`,
        `That's the most performant way.`,
      ].join(' '),
    );
  }
}

export { RelationOwner, assertSingleOwner };
