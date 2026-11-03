import { ManyToManyModifyMixin } from './ManyToManyModifyMixin';
import { isPlainObject } from '../../utils/objectUtils';
import type { ManyToManyModifyOperationClass } from './ManyToManyModifyMixin';
import type { RelationQueryBuilder } from '../Relation';
import type { ObjectionToKnexConvertingOperation } from '../../queryBuilder/operations/ObjectionToKnexConvertingOperation';

// The join rows are filtered by a correlated subquery of the related table, as
// on the other databases: MySQL and MariaDB run `delete from joinTable where
// exists (select 1 from related where related.id = joinTable.relatedId and ...)`
// in one query.
//
// MySQL doesn't allow a statement to read the table it modifies in a subquery
// (ER_UPDATE_TABLE_USED), or a table that a trigger of it modifies
// (ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG). The filters can read the join table
// in many ways: joins, `joinRelated()`, subqueries in `whereIn()` or
// `whereExists()`, raw SQL. So unless the filters only compare columns with
// values or other columns, or a trigger conflicts, the owner and related ids of
// the matching join rows are fetched in a separate query first, and the
// statement only modifies the join rows with these ids. Unlike the subquery,
// the ids can't tell apart join rows that differ only in their other columns
// (#1853, #2127, #2406).
const ManyToManyMySqlModifyMixin = <T extends ManyToManyModifyOperationClass>(Operation: T) => {
  return class extends ManyToManyModifyMixin(Operation) {
    applyModifyFilterForJoinTable(builder: RelationQueryBuilder): RelationQueryBuilder {
      const { joinTableOwnerProp } = this.relation;
      const readsJoinTable = this.joinRowFilterReadsJoinTable(builder);
      const original = builder;

      builder.whereInComposite(
        joinTableOwnerProp.refs(builder),
        this.owner.getProps(this.relation),
      );

      // Decided for each execution, since a retry below takes the other path.
      builder.runBefore(async (_: unknown, builder: RelationQueryBuilder) => {
        if (readsJoinTable || hasTriggerConflict(builder, this.relation.joinTable!)) {
          await this.filterJoinRowsByIds(builder);
        } else {
          builder.whereExists(this.joinRowFilterSubquery!);
        }
      });

      if (!readsJoinTable) {
        // A trigger of the join table that modifies a table the subquery
        // reads makes MySQL reject the statement. Remember the join table and
        // run the statement again with the ids (#2406). A failed statement
        // doesn't roll back the transaction on MySQL.
        builder.onError((err: unknown, builder: RelationQueryBuilder) => {
          const joinTable = this.relation.joinTable!;

          if (isTriggerConflictError(err) && !hasTriggerConflict(builder, joinTable)) {
            rememberTriggerConflict(builder, joinTable);
            return original.execute();
          }

          throw err;
        });
      }

      return builder;
    }

    async filterJoinRowsByIds(builder: RelationQueryBuilder): Promise<void> {
      const { joinTableOwnerProp, joinTableRelatedProp } = this.relation;
      const idRefs = [...joinTableOwnerProp.refs(builder), ...joinTableRelatedProp!.refs(builder)];

      // The raw rows: no models, so that no hooks run for them.
      const rows: Record<string, unknown>[] = await builder
        .modelClass()
        .query()
        .childQueryOf(builder)
        .copyFrom(builder, builder.constructor.WhereSelector)
        .whereExists(this.joinRowFilterSubquery!)
        .select(idRefs)
        .toKnexQuery();

      // An empty list still runs the statement, so that it returns what the
      // statement returns, e.g. a count of 0 for deletes.
      builder.whereInComposite(
        idRefs,
        rows.map((row) => Object.values(row)),
      );
    }

    // Whether the filter subquery may read the join table, see above.
    joinRowFilterReadsJoinTable(builder: RelationQueryBuilder): boolean {
      const subquery = this.joinRowFilterSubquery!;
      const builderClass = subquery.constructor;

      if (
        builder.tableNameFor(this.relation.relatedModelClass) ===
        builder.tableNameFor(this.relation.joinTable!)
      ) {
        return true;
      }

      if (subquery.has(builderClass.JoinSelector)) {
        return true;
      }

      let readsTables = false;

      subquery.forEachOperation(builderClass.WhereSelector, (op: unknown): boolean | void => {
        const { args } = op as ObjectionToKnexConvertingOperation;

        if (!args || !args.every(isSimpleFilterArg)) {
          readsTables = true;
          return false;
        }
      });

      return readsTables;
    }
  };
};

// The join tables known to have triggers that conflict with the subquery, for
// each knex configuration (transactions share the configuration of their knex).
const triggerConflicts = new WeakMap<object, Set<string>>();

function hasTriggerConflict(builder: RelationQueryBuilder, joinTable: string): boolean {
  const tables = triggerConflicts.get(builder.knex().client.config);
  return tables !== undefined && tables.has(joinTable);
}

function rememberTriggerConflict(builder: RelationQueryBuilder, joinTable: string): void {
  const config = builder.knex().client.config;
  let tables = triggerConflicts.get(config);

  if (!tables) {
    tables = new Set();
    triggerConflicts.set(config, tables);
  }

  tables.add(joinTable);
}

// ER_CANT_UPDATE_USED_TABLE_IN_SF_OR_TRG, from mysql2 and mariadb.
function isTriggerConflictError(err: unknown): boolean {
  const nativeError = (err as { nativeError?: { errno?: number } } | null)?.nativeError;
  return nativeError?.errno === 1442;
}

// A value, a column reference, or an array or object of those: arguments that
// can't contain a subquery or raw SQL.
function isSimpleFilterArg(arg: unknown): boolean {
  if (arg === null || arg === undefined) {
    return true;
  }

  switch (typeof arg) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
      return true;
    case 'object':
      if (arg instanceof Date || Buffer.isBuffer(arg)) {
        return true;
      } else if ((arg as { isObjectionReferenceBuilder?: boolean }).isObjectionReferenceBuilder) {
        return true;
      } else if (Array.isArray(arg)) {
        return arg.every(isSimpleFilterArg);
      } else if (isPlainObject(arg)) {
        return Object.values(arg).every(isSimpleFilterArg);
      } else {
        return false;
      }
    default:
      // Functions (where groups and subquery callbacks) and symbols.
      return false;
  }
}

export { ManyToManyMySqlModifyMixin };
