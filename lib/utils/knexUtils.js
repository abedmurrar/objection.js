'use strict';

const { isObject, isFunction } = require('../utils/objectUtils');

function getDialect(knex) {
  const type = typeof knex;

  return (
    (knex !== null &&
      (type === 'object' || type === 'function') &&
      knex.client &&
      knex.client.dialect) ||
    null
  );
}

function isPostgres(knex) {
  return getDialect(knex) === 'postgresql';
}

function isOracle(knex) {
  const dialect = getDialect(knex);
  return dialect === 'oracledb';
}

function isMySql(knex) {
  const dialect = getDialect(knex);
  return dialect === 'mysql' || dialect === 'mysql2';
}

// knex reports MariaDB as the `mysql` dialect. It's recognized from knex's
// `mariadb` client, or from a `version` like '11.4-MariaDB' in the knex config
// when the mysql2 driver is used. knex finds out about MariaDB itself only
// after connecting, which would build the first queries differently than the
// later ones, so that isn't used.
function isMariaDb(knex) {
  if (!isMySql(knex)) {
    return false;
  }

  const client = knex.client;
  return client.driverName === 'mariadb' || /mariadb/i.test(configVersion(client));
}

// The MariaDB version as [major, minor], when it's known from the knex config.
function getMariaDbVersion(knex) {
  if (!isMariaDb(knex)) {
    return null;
  }

  const match = /^(\d+)\.(\d+)/.exec(configVersion(knex.client));
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function configVersion(client) {
  const version = client.config && client.config.version;
  return typeof version === 'string' ? version : '';
}

function isSqlite(knex) {
  return getDialect(knex) === 'sqlite3';
}

function isMsSql(knex) {
  return getDialect(knex) === 'mssql';
}

function isKnexQueryBuilder(value) {
  return (
    hasConstructor(value) &&
    isFunction(value.select) &&
    isFunction(value.column) &&
    value.select === value.column &&
    'client' in value
  );
}

function isKnexJoinBuilder(value) {
  return hasConstructor(value) && value.grouping === 'join' && 'joinType' in value;
}

function isKnexRaw(value) {
  return hasConstructor(value) && value.isRawInstance && 'client' in value;
}

function hasConstructor(value) {
  return isObject(value) && isFunction(value.constructor);
}

module.exports = {
  getDialect,
  isPostgres,
  isMySql,
  isMariaDb,
  getMariaDbVersion,
  isSqlite,
  isMsSql,
  isOracle,
  isKnexQueryBuilder,
  isKnexJoinBuilder,
  isKnexRaw,
};
