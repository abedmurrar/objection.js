import type { Relation, RelationModelClass } from './Relation';
import type { RelationProperty } from './RelationProperty';

// The indexes of the key columns of `prop` that `unrelate()` sets to null:
// the ones that aren't part of the id of `modelClass`, the model whose rows it
// updates. A column can be in both, like a `tenantId` of a multi-tenant schema
// that both keys start with. Setting it to null would change the id of the
// row, not only remove the relation, and fail on a primary key column (or, in
// MySQL's non-strict mode, change it to 0).
function unrelateKeyIndexes(
  relation: Relation,
  prop: RelationProperty,
  modelClass: RelationModelClass,
): number[] {
  const idProps = new Set(modelClass.getIdPropertyArray());
  const indexes: number[] = [];

  prop.forEach((i) => {
    if (!idProps.has(prop.props[i])) {
      indexes.push(i);
    }
  });

  if (indexes.length === 0) {
    const props = prop.props.map((it) => `${modelClass.name}.${it}`).join(', ');

    throw relation.createError(
      `can't unrelate: the key ${props} is part of the id of ${modelClass.name}. Delete the rows instead.`,
    );
  }

  return indexes;
}

export { unrelateKeyIndexes };
