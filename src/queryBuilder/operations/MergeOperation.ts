import { isFunction, isEmpty, isObject } from '../../utils/objectUtils';
import { QueryBuilderOperation } from './QueryBuilderOperation';
import { convertFieldExpressionsToRaw } from './UpdateOperation';
import { InsertOperation } from './InsertOperation';
import { DelegateOperation } from './DelegateOperation';
import type { KnexBuilder, Model, OperationOptions, QueryBuilder } from './types';

class MergeOperation extends QueryBuilderOperation {
  declare model: Model | null;
  declare args: unknown[] | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.model = null;
    this.args = null;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    this.args = args;

    if (!isEmpty(args) && isObject(args[0]) && !Array.isArray(args[0])) {
      const json = args[0];
      const modelClass = builder.modelClass();

      this.model = modelClass.ensureModel(json, { patch: true });
    }

    return true;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    if (!isFunction(knexBuilder.merge)) {
      throw new Error('merge method can only be chained right after onConflict method');
    }

    const insertOp = findInsertOperation(builder);
    // An `AUTO_INCREMENT` id column on MySQL. See `prepareMySqlMerge()`.
    const idColumn = insertOp !== null ? insertOp.mergeIdColumn : null;

    if (this.model) {
      const json = this.model.$toDatabaseJson(builder);
      const convertedJson = convertFieldExpressionsToRaw(builder, json);

      return knexBuilder.merge(
        idColumn !== null ? withLastInsertId(builder, convertedJson, idColumn) : convertedJson,
      );
    }

    if (idColumn !== null) {
      const updates = (this.args as unknown[])[0];
      // The columns that knex updates with `merge([columns])`, or with `merge()`
      // all the inserted ones, as `col = values(col)`.
      const columns = Array.isArray(updates)
        ? (updates as string[])
        : updates === undefined
          ? Object.keys(insertOp!.models[0].$toDatabaseJson(builder))
          : null;

      if (columns !== null) {
        const knex = builder.knex();
        const json: Record<string, unknown> = {};

        for (const column of columns) {
          json[column] = knex.raw('values(??)', [column]);
        }

        return knexBuilder.merge(withLastInsertId(builder, json, idColumn));
      }
    }

    return knexBuilder.merge(...(this.args as unknown[]));
  }

  toFindOperation(): QueryBuilderOperation | null {
    return null;
  }

  clone(): this {
    const clone = super.clone();
    clone.model = this.model;
    clone.args = this.args;
    return clone;
  }
}

// The insert operation, also when an operation like `insertAndFetch()`
// delegates to it.
function findInsertOperation(builder: QueryBuilder): InsertOperation | null {
  let op = builder.findOperation(InsertOperation) as QueryBuilderOperation | null;

  while (op instanceof DelegateOperation && !(op instanceof InsertOperation)) {
    op = op.delegate;
  }

  return op instanceof InsertOperation ? op : null;
}

// `id = LAST_INSERT_ID(id)` after the updates, unless they set the id
// themselves. Makes MySQL report the id of the existing row.
function withLastInsertId(
  builder: QueryBuilder,
  json: Record<string, unknown>,
  idColumn: string,
): Record<string, unknown> {
  if (Object.hasOwn(json, idColumn)) {
    return json;
  }

  return { ...json, [idColumn]: builder.knex().raw('LAST_INSERT_ID(??)', [idColumn]) };
}

export { MergeOperation };
