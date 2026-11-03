import { RelationFindOperation } from '../../RelationFindOperation';
import { getTempColumn } from '../../../utils/tmpColumnUtils';
import type { RelationModel, RelationOperationOptions, RelationQueryBuilder } from '../../Relation';
import type { ManyToManyRelation } from '../ManyToManyRelation';

class ManyToManyFindOperation extends RelationFindOperation {
  declare relation: ManyToManyRelation;
  declare ownerJoinColumnAlias: string[];

  constructor(name: string, opt: RelationOperationOptions<ManyToManyRelation>) {
    super(name, opt);

    this.ownerJoinColumnAlias = new Array<string>(this.relation.joinTableOwnerProp.size);

    for (let i = 0, l = this.ownerJoinColumnAlias.length; i < l; ++i) {
      this.ownerJoinColumnAlias[i] = getTempColumn(i);
    }
  }

  onBuild(builder: RelationQueryBuilder): void {
    const relatedModelClass = this.relation.relatedModelClass;

    this.maybeApplyAlias(builder);
    this.relation.findQuery(builder, this.owner);

    if (!builder.hasSelects()) {
      const table = builder.tableRefFor(relatedModelClass);

      // If the user hasn't specified a select clause, select the related model's columns.
      // If we don't do this we also get the join table's columns.
      builder.select(`${table}.*`);

      // Also select all extra columns.
      for (const extra of this.relation.joinTableExtras) {
        const joinTable = builder.tableRefFor(this.relation.joinTable);
        builder.select(`${joinTable}.${extra.joinTableCol} as ${extra.aliasCol}`);
      }
    }

    if (this.assignResultToOwner && this.owner.isModels) {
      this.selectMissingJoinColumns(builder);
    }
  }

  // The owner keys of the related rows are in the selected join columns.
  getOwnerKey(related: RelationModel): string {
    return related.$propKey(this.ownerJoinColumnAlias);
  }

  clone(): this {
    const clone = super.clone();
    clone.ownerJoinColumnAlias = this.ownerJoinColumnAlias.slice();
    return clone;
  }

  selectMissingJoinColumns(builder: RelationQueryBuilder): void {
    const { relatedModelClass, joinTableOwnerProp } = this.relation;

    // We must select the owner join columns so that we know for which owner model the related
    // models belong to after the requests.
    joinTableOwnerProp.forEach((i) => {
      const joinTableOwnerRef = joinTableOwnerProp.ref(builder, i);
      const propName = relatedModelClass.columnNameToPropertyName(this.ownerJoinColumnAlias[i]);

      builder.select(joinTableOwnerRef.as(this.ownerJoinColumnAlias[i]));
      // Mark them to be omitted later.
      this.omitProps.push(propName);
    });

    super.selectMissingJoinColumns(builder);
  }
}

export { ManyToManyFindOperation };
