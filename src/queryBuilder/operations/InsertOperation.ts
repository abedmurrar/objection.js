/* global BigInt */

import { QueryBuilderOperation } from './QueryBuilderOperation';
import { callStaticBeforeHook, callStaticAfterHook } from '../StaticHookArguments';
import { after, mapAfterAllReturn } from '../../utils/promiseUtils';
import { isSqlite, isMySql } from '../../utils/knexUtils';
import { isObject, isString } from '../../utils/objectUtils';
import type { KnexBuilder, Model, ModelOptions, OperationOptions, QueryBuilder } from './types';

// The id of an inserted row as the database driver returns it.
type InsertedId = number | bigint | string;

// `@@auto_increment_increment` for each MySQL knex instance, keyed by the knex config,
// which transactions share with the knex they were started from.
const autoIncrementIncrements = new WeakMap<object, number>();

// Base class for all insert operations.
class InsertOperation extends QueryBuilderOperation {
  // `null` until `onAdd()`, which runs before all the other hooks.
  declare models: Model[];
  declare isArray: boolean;
  declare modelOptions: ModelOptions;
  declare autoIncrementIncrement: number | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);

    this.models = null!;
    this.isArray = false;
    this.modelOptions = Object.assign({}, this.opt.modelOptions || {});
    this.autoIncrementIncrement = null;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    const json = args[0];
    const modelClass = builder.modelClass();

    this.isArray = Array.isArray(json);
    this.models = modelClass.ensureModelArray(json, this.modelOptions);

    return true;
  }

  // Returns synchronously when no hook returns a promise and no query is
  // needed, so that the query doesn't wait for promises it doesn't need.
  onBefore2(builder: QueryBuilder, result: unknown): unknown {
    const maybePromise = callBeforeInsert(builder, this.models);

    if (this.models.length > 1 && isMySql(builder.knex())) {
      return after(
        after(maybePromise, () => this.prepareMySqlBatchInsert(builder)),
        () => result,
      );
    }

    return after(maybePromise, () => result);
  }

  // MySQL only returns the id of the first row of a multi-row insert. InnoDB
  // gives the rows of one multi-row VALUES insert consecutive ids (in every
  // `innodb_autoinc_lock_mode`), so the other ids can be computed from it and
  // `@@auto_increment_increment`.
  // Only queries `@@auto_increment_increment` once per knex instance, and
  // returns synchronously after that.
  prepareMySqlBatchInsert(builder: QueryBuilder): void | Promise<void> {
    const withId = this.models.filter((model) => model.$hasId()).length;

    if (withId === this.models.length) {
      return;
    }

    if (withId > 0) {
      throw new Error(
        `batch insert on MySQL can't return ids when only some rows have an id. Set the id on all rows or none.`,
      );
    }

    if (Array.isArray(builder.modelClass().getIdColumn())) {
      return;
    }

    const knex = builder.knex();
    const increment = autoIncrementIncrements.get(knex.client.config);

    if (increment !== undefined) {
      this.autoIncrementIncrement = increment;
      return;
    }

    return knex.raw('select @@auto_increment_increment as increment').then(([rows]: any) => {
      const increment = Number(rows[0].increment);
      autoIncrementIncrements.set(knex.client.config, increment);
      this.autoIncrementIncrement = increment;
    });
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const knex = builder.knex();
    // SQLite only returns the id of the last row of an insert without a
    // `returning` clause. That isn't needed if every row has an id.
    const returnsIds =
      !isMySql(knex) &&
      (!isSqlite(knex) ||
        (this.models.length > 1 && !this.models.every((model) => model.$hasId())));

    if (!builder.has(/returning/)) {
      if (returnsIds) {
        // If the user hasn't specified a `returning` clause, we make sure
        // that at least the identifier is returned. SQLite only returns the
        // id of the last row without one. With `onConflict()` the conflict
        // columns are returned too, so that the returned rows can be matched
        // to the models when some of the rows are ignored.
        knexBuilder = knexBuilder.returning(getDefaultReturning(builder));
      } else if (isSqlite(knex) && builder.has('onConflict')) {
        // Without a `returning` clause, SQLite returns the id of the last
        // inserted row, which belongs to a previous insert if the row was
        // ignored. Use `returning` to find out what was actually inserted.
        knexBuilder = knexBuilder.returning(getDefaultReturning(builder));
      }
    }

    return knexBuilder.insert(this.models.map((model) => model.$toDatabaseJson(builder)));
  }

  // The subclasses may be async.
  onAfter1(builder: QueryBuilder, ret: unknown): Model[] | PromiseLike<Model[]> {
    if (!Array.isArray(ret) || !ret.length || ret === this.models) {
      // Early exit if there is nothing to do.
      return this.models;
    }

    const isOnConflict = builder.has('onConflict');

    if (isObject(ret[0])) {
      if (isOnConflict && ret.length !== this.models.length) {
        // With `onConflict()`, ignored rows (and rows not updated because of a
        // `where` clause after `merge()`) are not returned, so the returned rows
        // can't be merged to the models based on their position.
        mergeMatchingRows(builder, this.models, ret as Record<string, unknown>[]);
      } else if (isSqlite(builder.knex()) && this.models.length > 1 && !isOnConflict) {
        mergeSqliteRows(builder, this.models, ret as Record<string, unknown>[]);
      } else {
        // If the user specified a `returning` clause the result may be an array of objects.
        // Merge all values of the objects to our models.
        for (let i = 0, l = this.models.length; i < l; ++i) {
          this.models[i].$setDatabaseJson(ret[i]);
        }
      }
    } else if (ret.length === 1 && this.models.length > 1) {
      this.setMySqlBatchInsertIds(builder, ret[0]);
    } else {
      // If the return value is not an array of objects, we assume it is an array of identifiers.
      for (let i = 0, l = this.models.length; i < l; ++i) {
        const model = this.models[i];

        // Don't set the id if the model already has one. MySQL and Sqlite don't return the correct
        // primary key value if the id is not generated in db, but given explicitly. With
        // `onConflict()`, MySQL returns `0` for ignored rows, which is not a valid id.
        if (!model.$id() && !(isOnConflict && !ret[i])) {
          model.$id(ret[i]);
        }
      }
    }

    return this.models;
  }

  setMySqlBatchInsertIds(builder: QueryBuilder, firstId: InsertedId): void {
    const increment = this.autoIncrementIncrement;

    // `onConflict()` may skip or update rows, which breaks the id sequence.
    if (increment === null || builder.has(/onConflict/) || !firstId) {
      return;
    }

    for (let i = 0, l = this.models.length; i < l; ++i) {
      this.models[i].$id(addToId(firstId, i * increment));
    }
  }

  onAfter2(builder: QueryBuilder, models: Model[]): unknown {
    const result = this.isArray ? models : models[0] || null;
    return callAfterInsert(builder, this.models, result);
  }

  toFindOperation(): QueryBuilderOperation | null {
    return null;
  }

  clone(): this {
    const clone = super.clone();

    clone.models = this.models;
    clone.isArray = this.isArray;
    clone.autoIncrementIncrement = this.autoIncrementIncrement;

    return clone;
  }
}

// The id can be a string or a BigInt when the driver is configured to
// return big numbers that way.
function addToId(id: InsertedId, amount: number): InsertedId {
  if (typeof id === 'number') {
    return id + amount;
  } else if (typeof id === 'bigint') {
    return id + BigInt(amount);
  } else {
    return String(BigInt(id) + BigInt(amount));
  }
}

// SQLite doesn't guarantee the order of the rows that `returning` returns.
// The rows of an insert are inserted in the order of the input though, and the
// rows without an id get increasing ids. So the rows of the models with an id
// are matched by that id, and the other rows, ordered by their ids, are merged
// into the models without an id in their order. Without a single numeric id
// column, the rows are merged by position.
function mergeSqliteRows(
  builder: QueryBuilder,
  models: Model[],
  rows: Record<string, unknown>[],
): void {
  const idColumnOrColumns = builder.modelClass().getIdColumn();
  const idColumn = typeof idColumnOrColumns === 'string' ? idColumnOrColumns : null;
  const isNumericId = (row: Record<string, unknown>): boolean =>
    typeof row[idColumn!] === 'number' || typeof row[idColumn!] === 'bigint';

  if (idColumn === null || rows.length !== models.length || !rows.every(isNumericId)) {
    for (let i = 0, l = models.length; i < l; ++i) {
      models[i].$setDatabaseJson(rows[i]);
    }

    return;
  }

  const modelsById = new Map<string, Model>();
  const modelsWithoutId: Model[] = [];

  for (const model of models) {
    if (model.$hasId()) {
      modelsById.set(String(model.$id()), model);
    } else {
      modelsWithoutId.push(model);
    }
  }

  const rowsWithoutModel: Record<string, unknown>[] = [];

  for (const row of rows) {
    const model = modelsById.get(String(row[idColumn]));

    if (model) {
      modelsById.delete(String(row[idColumn]));
      model.$setDatabaseJson(row);
    } else {
      rowsWithoutModel.push(row);
    }
  }

  rowsWithoutModel.sort((a, b) => {
    const idA = a[idColumn] as number | bigint;
    const idB = b[idColumn] as number | bigint;
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  for (let i = 0, l = modelsWithoutId.length; i < l; ++i) {
    if (rowsWithoutModel[i]) {
      modelsWithoutId[i].$setDatabaseJson(rowsWithoutModel[i]);
    }
  }
}

function getDefaultReturning(builder: QueryBuilder): string | string[] {
  const conflictColumns = getConflictColumns(builder);

  if (conflictColumns.length === 0) {
    // As before `onConflict()` support: a model without an id column (`null`)
    // was passed to `returning()` as is.
    return builder.modelClass().getIdColumn() as string | string[];
  }

  const idColumns = builder.modelClass().getIdColumnArray();
  const columns = Array.from(new Set(idColumns.concat(conflictColumns)));

  return columns.length === 1 ? columns[0] : columns;
}

function getConflictColumns(builder: QueryBuilder): string[] {
  // `onConflict` is a `KnexOperation`, which has `args`.
  const op = builder.findOperation('onConflict') as { args?: unknown[] } | null;

  if (!op) {
    return [];
  }

  const arg = op.args ? op.args[0] : undefined;
  const columns = Array.isArray(arg) ? arg : [arg];

  // Raw conflict targets (or no target at all) can't be used for matching.
  return columns.every(isString) ? (columns as string[]) : [];
}

// Merges the rows returned by an insert with `onConflict()` into the models with
// matching key values. Models whose rows were not returned are left untouched.
function mergeMatchingRows(
  builder: QueryBuilder,
  models: Model[],
  rows: Record<string, unknown>[],
): void {
  const jsons = models.map((model) => model.$toDatabaseJson(builder) as Record<string, unknown>);
  const idColumns = builder.modelClass().getIdColumnArray();

  // Use the conflict columns, or else the identifiers, to match the rows to
  // the models. The columns must be present in the input and the result.
  const keyColumns = [getConflictColumns(builder), idColumns].find((columns) => {
    return (
      columns.length > 0 &&
      columns.every((col) => {
        return (
          rows.every((row) => row[col] !== undefined) &&
          jsons.every((json) => json[col] !== undefined)
        );
      })
    );
  });

  if (!keyColumns) {
    throw createMatchError();
  }

  const createKey = (obj: Record<string, unknown>): string =>
    JSON.stringify(keyColumns.map((col) => normalizeKey(obj[col])));
  const indicesByKey = new Map<string, number[]>();

  jsons.forEach((json, index) => {
    const key = createKey(json);
    const indices = indicesByKey.get(key);

    if (indices) {
      indices.push(index);
    } else {
      indicesByKey.set(key, [index]);
    }
  });

  for (const row of rows) {
    const indices = indicesByKey.get(createKey(row));
    const index = indices ? indices.shift() : undefined;

    if (index === undefined) {
      throw createMatchError();
    }

    models[index].$setDatabaseJson(row);
  }
}

function normalizeKey(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  } else if (isObject(value)) {
    return JSON.stringify(value);
  } else {
    return String(value);
  }
}

function createMatchError(): Error {
  return new Error(
    'Could not match the rows returned by an insert with `onConflict()` to the inserted models. ' +
      'Pass the conflict columns to `onConflict()` and make sure they are returned, or provide ' +
      'the identifiers of the inserted models.',
  );
}

function callBeforeInsert(builder: QueryBuilder, models: Model[]): unknown {
  const maybePromise = callInstanceBeforeInsert(builder, models);
  return after(maybePromise, () => callStaticBeforeHook(builder, 'beforeInsert'));
}

function callInstanceBeforeInsert(builder: QueryBuilder, models: Model[]): unknown {
  return mapAfterAllReturn(
    models,
    (model: Model) => model.$beforeInsert(builder.context()),
    models,
  );
}

function callAfterInsert(builder: QueryBuilder, models: Model[], result: unknown): unknown {
  const maybePromise = callInstanceAfterInsert(builder, models);
  return after(maybePromise, () => callStaticAfterHook(builder, 'afterInsert', result));
}

function callInstanceAfterInsert(builder: QueryBuilder, models: Model[]): unknown {
  return mapAfterAllReturn(models, (model: Model) => model.$afterInsert(builder.context()), models);
}

export { InsertOperation };
