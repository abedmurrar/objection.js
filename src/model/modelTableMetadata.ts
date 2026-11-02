import { defineNonEnumerableProperty } from './modelUtils';
import { isPromise } from '../utils/promiseUtils';
import type { Knex } from 'knex';
import type { ModelClass } from './Model';
import type { QueryBuilder } from '../queryBuilder/QueryBuilder';

const TABLE_METADATA = '$$tableMetadata';

interface TableMetadata {
  columns: string[];
}

interface FetchTableMetadataOptions {
  parentBuilder?: QueryBuilder | null;
  knex?: Knex | null;
  force?: boolean;
  table?: string | null;
}

interface TableMetadataOptions {
  table?: string;
}

function fetchTableMetadata(
  modelClass: ModelClass,
  {
    parentBuilder = null,
    knex = null,
    force = false,
    table = null,
  }: FetchTableMetadataOptions = {},
): Promise<TableMetadata> {
  // The table isn't necessarily same as `modelClass.getTableName()` for example if
  // a view is queried instead.
  if (!table) {
    if (parentBuilder) {
      table = parentBuilder.tableNameFor(modelClass);
    } else {
      table = modelClass.getTableName();
    }
  }

  // Call tableMetadata first instead of accessing the cache directly beause
  // tableMetadata may have been overriden.
  let metadata: TableMetadata | Promise<TableMetadata> | null | undefined =
    modelClass.tableMetadata({ table });

  if (!force && metadata) {
    return Promise.resolve(metadata);
  }

  // Memoize metadata but only for modelClass. The hasOwnProperty check
  // will fail for subclasses and the value gets recreated.
  if (!Object.hasOwn(modelClass, TABLE_METADATA)) {
    defineNonEnumerableProperty(modelClass, TABLE_METADATA, new Map());
  }

  // The cache needs to be checked in addition to calling tableMetadata
  // because the cache may contain a temporary promise in which case
  // tableMetadata returns null.
  metadata = modelClass[TABLE_METADATA].get(table);

  if (!force && metadata) {
    return Promise.resolve(metadata);
  } else {
    const promise = modelClass
      .query(knex)
      .childQueryOf(parentBuilder)
      .columnInfo({ table })
      .then((columnInfo: Record<string, unknown>) => {
        const metadata = {
          columns: Object.keys(columnInfo),
        };

        modelClass[TABLE_METADATA].set(table, metadata);
        return metadata;
      })
      .catch((err: unknown) => {
        modelClass[TABLE_METADATA].delete(table);
        throw err;
      });

    modelClass[TABLE_METADATA].set(table, promise);
    return promise;
  }
}

function tableMetadata(
  modelClass: ModelClass,
  { table }: TableMetadataOptions = {},
): TableMetadata | null | undefined {
  if (Object.hasOwn(modelClass, TABLE_METADATA)) {
    const metadata = modelClass[TABLE_METADATA].get(table || modelClass.getTableName());

    if (isPromise(metadata)) {
      return null;
    } else {
      return metadata as TableMetadata | undefined;
    }
  } else {
    return null;
  }
}

export { fetchTableMetadata, tableMetadata };
export type { TableMetadata, FetchTableMetadataOptions, TableMetadataOptions };
