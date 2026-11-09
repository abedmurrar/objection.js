import { FindOperation } from '../queryBuilder/operations/FindOperation';
import { RangeOperation } from '../queryBuilder/operations/RangeOperation';
import { asArray } from '../utils/objectUtils';
import type {
  Relation,
  RelationModel,
  RelationModelClass,
  RelationOperationOptions,
  RelationQueryBuilder,
} from './Relation';
import type { RelationOwner } from './RelationOwner';

class RelationFindOperation extends FindOperation {
  declare relation: Relation;
  declare owner: RelationOwner;
  declare alwaysReturnArray: boolean;
  declare assignResultToOwner: boolean;
  declare relationProperty: string;
  declare omitProps: string[];
  declare alias: string | null;
  // Set by `withGraphFetched()` for related model classes with
  // `useAfterFindInGraphs`: the related models are assigned to the owners by
  // `assignResult()`, after the hooks of the query.
  declare assignAfterHooks: boolean;
  // Shared with the clones that execute the query.
  declare ownerKeyByRelated: Map<RelationModel, string>;

  constructor(name: string, opt: RelationOperationOptions) {
    super(name, opt);

    this.relation = opt.relation;
    this.owner = opt.owner;
    this.alwaysReturnArray = false;
    this.assignResultToOwner = true;
    this.relationProperty = this.relation.name;
    this.omitProps = [];
    this.alias = null;
    this.assignAfterHooks = false;
    this.ownerKeyByRelated = new Map();
  }

  onBuild(builder: RelationQueryBuilder): void {
    this.maybeApplyAlias(builder);
    this.relation.findQuery(builder, this.owner);

    if (this.assignResultToOwner && this.owner.isModels) {
      this.selectMissingJoinColumns(builder);
    }
  }

  onAfter2(_: RelationQueryBuilder, related: RelationModel[]): RelationModel[] {
    if (this.assignResultToOwner && this.owner.isModels) {
      if (this.assignAfterHooks) {
        // Read the owner keys now, before the join columns that were only
        // selected for them are omitted from the related models.
        for (const rel of related) {
          this.ownerKeyByRelated.set(rel, this.getOwnerKey(rel));
        }
      } else {
        this.assignToOwners(related, (rel) => this.getOwnerKey(rel));
      }
    }

    return related;
  }

  // Assigns what the query returns to the owners, after the `afterFind()` hooks
  // and `runAfter()` callbacks of the query, which may filter or reorder the
  // related models. Used with `useAfterFindInGraphs`.
  assignResult(builder: RelationQueryBuilder, result: unknown): unknown {
    if (this.assignAfterHooks && this.assignResultToOwner && this.owner.isModels) {
      // `range()` and `page()` wrap the models in `{ results, total }`.
      const models = builder.has(RangeOperation)
        ? (result as { results: RelationModel[] }).results
        : (result as RelationModel | RelationModel[] | null | undefined);
      const related = asArray(models).filter((rel) => rel !== null && rel !== undefined);

      this.assignToOwners(related, (rel) => {
        const key = this.ownerKeyByRelated.get(rel);

        if (key === undefined) {
          throw new Error(
            `Unable to assign the result to relation "${this.relation.name}" of ` +
              `${this.relation.ownerModelClass.name}: afterFind() and runAfter() can only ` +
              'return the related models that the query found, filtered or reordered.',
          );
        }

        return key;
      });
    }

    return result;
  }

  assignToOwners(related: RelationModel[], ownerKeyOf: (rel: RelationModel) => string): void {
    const isOneToOne = this.relation.isOneToOne();
    const relatedByOwnerKey = new Map<string, RelationModel[]>();

    for (const rel of related) {
      const key = ownerKeyOf(rel);
      const arr = relatedByOwnerKey.get(key);

      if (arr) {
        arr.push(rel);
      } else {
        relatedByOwnerKey.set(key, [rel]);
      }
    }

    for (const owner of this.owner.modelArray) {
      const related = relatedByOwnerKey.get(this.relation.ownerProp.propKey(owner));

      if (isOneToOne) {
        owner[this.relationProperty] = (related && related[0]) || null;
      } else {
        owner[this.relationProperty] = related || [];
      }
    }
  }

  // The key of the owner that a related model belongs to.
  getOwnerKey(related: RelationModel): string {
    return this.relation.relatedProp.propKey(related);
  }

  // `related` is the array of the found models. It becomes a single model
  // (or undefined) for one-to-one relations.
  onAfter3(builder: RelationQueryBuilder, related: any) {
    const isOneToOne = this.relation.isOneToOne();
    const intOpt = builder.internalOptions();

    if (!intOpt.keepImplicitJoinProps) {
      this.omitImplicitJoinProps(related);
    }

    if (!this.alwaysReturnArray && isOneToOne && related.length <= 1) {
      related = related[0] || undefined;
    }

    return super.onAfter3(builder, related);
  }

  selectMissingJoinColumns(builder: RelationQueryBuilder): void {
    const relatedProp = this.relation.relatedProp;
    const addedSelects: string[] = [];

    for (let c = 0, lc = relatedProp.size; c < lc; ++c) {
      const fullCol = relatedProp.ref(builder, c).fullColumn(builder);
      const prop = relatedProp.props[c];
      const col = relatedProp.cols[c];

      if (!builder.hasSelectionAs(fullCol, col) && addedSelects.indexOf(fullCol) === -1) {
        this.omitProps.push(prop);
        addedSelects.push(fullCol);
      }
    }

    if (addedSelects.length) {
      builder.select(addedSelects);
    }
  }

  maybeApplyAlias(builder: RelationQueryBuilder): void {
    if (!builder.alias() && this.alias) {
      builder.alias(this.alias);
    }
  }

  omitImplicitJoinProps(
    related: RelationModel[] | RelationModel | undefined,
  ): RelationModel[] | RelationModel | undefined {
    const relatedModelClass = this.relation.relatedModelClass;

    if (!this.omitProps.length || !related) {
      return related;
    }

    if (!Array.isArray(related)) {
      return this.omitImplicitJoinPropsFromOne(relatedModelClass, related);
    }

    if (!related.length) {
      return related;
    }

    for (let i = 0, l = related.length; i < l; ++i) {
      this.omitImplicitJoinPropsFromOne(relatedModelClass, related[i]);
    }

    return related;
  }

  omitImplicitJoinPropsFromOne(
    relatedModelClass: RelationModelClass,
    model: RelationModel,
  ): RelationModel {
    for (let c = 0, lc = this.omitProps.length; c < lc; ++c) {
      relatedModelClass.omitImpl(model, this.omitProps[c]);
    }

    return model;
  }

  clone(): this {
    const clone = super.clone();

    clone.alwaysReturnArray = this.alwaysReturnArray;
    clone.assignResultToOwner = this.assignResultToOwner;
    clone.relationProperty = this.relationProperty;
    clone.omitProps = this.omitProps.slice();
    clone.alias = this.alias;
    clone.assignAfterHooks = this.assignAfterHooks;
    clone.ownerKeyByRelated = this.ownerKeyByRelated;

    return clone;
  }
}

export { RelationFindOperation };
