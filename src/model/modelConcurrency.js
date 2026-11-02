'use strict';

const { isMsSql } = require('../utils/knexUtils');

const DEFAULT_CONCURRENCY = 4;
let defaultGetConcurrency = null;

// Called by Model.js with Model.getConcurrency.
function setDefaultGetConcurrency(getConcurrency) {
  defaultGetConcurrency = getConcurrency;
}

// The concurrency of the queries that only read, like the queries of
// `withGraphFetched()`. By default `getConcurrency()` is 1 on MySQL, because
// concurrent graph updates and deletes deadlock there, but reads don't. The
// concurrency a model sets with `concurrency` or `getConcurrency()` is used as
// is.
function getReadConcurrency(modelClass, knex) {
  if (modelClass.concurrency !== null || modelClass.getConcurrency !== defaultGetConcurrency) {
    return modelClass.getConcurrency(knex);
  }

  // The mssql driver can't run concurrent queries.
  return knex && isMsSql(knex) ? 1 : DEFAULT_CONCURRENCY;
}

module.exports = {
  setDefaultGetConcurrency,
  getReadConcurrency,
};
