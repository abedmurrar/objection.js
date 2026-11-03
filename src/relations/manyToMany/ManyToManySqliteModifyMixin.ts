import { ManyToManyModifyMixin } from './ManyToManyModifyMixin';
import type { ManyToManyModifyOperationClass } from './ManyToManyModifyMixin';
import type { RelationQueryBuilder } from '../Relation';

const SQLITE_BUILTIN_ROW_ID = '_rowid_';

// We need to override this mixin for sqlite because sqlite doesn't support
// multi-column where in statements with subqueries. We need to use the
// internal _rowid_ column instead. The join rows are filtered by the shared
// correlated subquery of `ManyToManyModifyMixin`.
const ManyToManySqliteModifyMixin = <T extends ManyToManyModifyOperationClass>(Operation: T) => {
  return class extends ManyToManyModifyMixin(Operation) {
    applyModifyFilterForRelatedTable(builder: RelationQueryBuilder): RelationQueryBuilder {
      const tableRef = builder.tableRefFor(this.relation.relatedModelClass);
      const rowIdRef = `${tableRef}.${SQLITE_BUILTIN_ROW_ID}`;
      const subquery = this.modifyFilterSubquery.clone().select(rowIdRef);

      return builder.whereInComposite(rowIdRef, subquery);
    }
  };
};

export { ManyToManySqliteModifyMixin };
