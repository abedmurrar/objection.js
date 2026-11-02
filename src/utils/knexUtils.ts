import { isObject, isFunction } from '../utils/objectUtils';

// The parts of a knex client that are read here.
interface KnexClientLike {
  dialect?: string;
  driverName?: string;
  config?: { version?: unknown };
}

// The parts of a knex instance that are read here. Anything can be passed in,
// and the functions check what they read.
interface KnexLike {
  client?: KnexClientLike;
}

// The parts of knex builders and raws that are read here.
interface KnexValueLike {
  select?: unknown;
  column?: unknown;
  grouping?: unknown;
  isRawInstance?: boolean;
}

function getDialect(knex: unknown): string | null {
  const type = typeof knex;
  const knexLike = knex as KnexLike;

  return (
    (knex !== null &&
      (type === 'object' || type === 'function') &&
      knexLike.client &&
      knexLike.client.dialect) ||
    null
  );
}

function isPostgres(knex: unknown): boolean {
  return getDialect(knex) === 'postgresql';
}

function isOracle(knex: unknown): boolean {
  const dialect = getDialect(knex);
  return dialect === 'oracledb';
}

function isMySql(knex: unknown): boolean {
  const dialect = getDialect(knex);
  return dialect === 'mysql' || dialect === 'mysql2';
}

// knex reports MariaDB as the `mysql` dialect. It's recognized from knex's
// `mariadb` client, or from a `version` like '11.4.0-MariaDB' in the knex config
// when the mysql2 driver is used. knex finds out about MariaDB itself only
// after connecting, which would build the first queries differently than the
// later ones, so that isn't used.
function isMariaDb(knex: unknown): boolean {
  if (!isMySql(knex)) {
    return false;
  }

  // isMySql() returned true, so the client exists.
  const client = (knex as KnexLike).client!;
  return client.driverName === 'mariadb' || /mariadb/i.test(configVersion(client));
}

// The MariaDB version as [major, minor], when it's known from the knex config.
function getMariaDbVersion(knex: unknown): [number, number] | null {
  if (!isMariaDb(knex)) {
    return null;
  }

  const match = /^(\d+)\.(\d+)/.exec(configVersion((knex as KnexLike).client!));
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function configVersion(client: KnexClientLike): string {
  const version = client.config && client.config.version;
  return typeof version === 'string' ? version : '';
}

function isSqlite(knex: unknown): boolean {
  return getDialect(knex) === 'sqlite3';
}

function isMsSql(knex: unknown): boolean {
  return getDialect(knex) === 'mssql';
}

function isKnexQueryBuilder(value: unknown): boolean {
  return (
    hasConstructor(value) &&
    isFunction(value.select) &&
    isFunction(value.column) &&
    value.select === value.column &&
    'client' in value
  );
}

function isKnexJoinBuilder(value: unknown): boolean {
  return hasConstructor(value) && value.grouping === 'join' && 'joinType' in value;
}

function isKnexRaw(value: unknown): boolean | undefined {
  return hasConstructor(value) && value.isRawInstance && 'client' in value;
}

function hasConstructor(value: unknown): value is KnexValueLike & object {
  return isObject(value) && isFunction(value.constructor);
}

export {
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
