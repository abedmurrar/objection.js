import { isMsSql } from '../utils/knexUtils';
import type { Knex } from 'knex';
import type { ModelClass } from './Model';

type GetConcurrency = (this: ModelClass, knex?: Knex | null) => number;

const DEFAULT_CONCURRENCY = 4;
let defaultGetConcurrency: GetConcurrency | null = null;

// Called by Model.js with Model.getConcurrency.
function setDefaultGetConcurrency(getConcurrency: GetConcurrency): void {
  defaultGetConcurrency = getConcurrency;
}

// The concurrency of the queries that only read, like the queries of
// `withGraphFetched()`. By default `getConcurrency()` is 1 on MySQL, because
// concurrent graph updates and deletes deadlock there, but reads don't. The
// concurrency a model sets with `concurrency` or `getConcurrency()` is used as
// is.
function getReadConcurrency(modelClass: ModelClass, knex?: Knex | null): number {
  if (modelClass.concurrency !== null || modelClass.getConcurrency !== defaultGetConcurrency) {
    return modelClass.getConcurrency(knex);
  }

  // The mssql driver can't run concurrent queries.
  return knex && isMsSql(knex) ? 1 : DEFAULT_CONCURRENCY;
}

export { setDefaultGetConcurrency, getReadConcurrency };
