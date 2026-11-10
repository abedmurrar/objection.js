import { isMariaDb } from './knexUtils';
import type { FieldExpressionAccess } from './parseFieldExpression';

// SQL types of `ReferenceBuilder` casts that MySQL's `CAST()` calls differently.
// `CAST(x AS integer)` for example is a syntax error on MySQL.
const MYSQL_CAST_TYPES: Record<string, string> = {
  text: 'CHAR',
  varchar: 'CHAR',
  integer: 'SIGNED',
  int: 'SIGNED',
  smallint: 'SIGNED',
  bigint: 'SIGNED',
  float: 'FLOAT',
  real: 'DOUBLE',
  double: 'DOUBLE',
  'double precision': 'DOUBLE',
  decimal: 'DECIMAL(65,30)',
  numeric: 'DECIMAL(65,30)',
  json: 'JSON',
  jsonb: 'JSON',
};

/**
 * Converts the `access` part of a parsed field expression into a MySQL JSON
 * path like `$."a"[1]."b.c"`. Keys are always quoted, so they can contain any
 * characters. The path must be passed to MySQL as a binding.
 */
function toMySqlJsonPath(access: readonly FieldExpressionAccess[]): string {
  return (
    '$' +
    access
      .map((it) => {
        if (it.type === 'array' && Number.isInteger(it.ref)) {
          return `[${it.ref}]`;
        } else {
          return `.${JSON.stringify(String(it.ref))}`;
        }
      })
      .join('')
  );
}

function toMySqlCastType(sqlType: string): string {
  return MYSQL_CAST_TYPES[sqlType.toLowerCase()] || sqlType;
}

function isBooleanType(sqlType: string): boolean {
  const type = sqlType.toLowerCase();
  return type === 'boolean' || type === 'bool';
}

// The SQL that makes `sql` a JSON value. MariaDB has no JSON type to cast to:
// its JSON columns are text. `JSON_COMPACT()` returns the value as JSON, which
// `JSON_SET()` nests instead of storing a string, and in the compact form
// objection stores JSON in, so comparisons with columns work.
function toJsonSql(sql: string, knex: unknown): string {
  return isMariaDb(knex) ? `JSON_COMPACT(${sql})` : `CAST(${sql} AS JSON)`;
}

const JSON_CAST = 'CAST(? AS JSON)';

// For SQL that objection generates before the knex instance is known, like the
// conditions of the `whereJson*` methods: replaces `CAST(? AS JSON)` with
// `JSON_COMPACT(?)` on MariaDB. The values are always bindings, so the text
// only contains what objection generated.
function jsonCastsForDialect(sql: string, knex: unknown): string {
  return isMariaDb(knex) ? sql.replaceAll(JSON_CAST, 'JSON_COMPACT(?)') : sql;
}

export {
  toMySqlJsonPath,
  toMySqlCastType,
  isBooleanType,
  toJsonSql,
  jsonCastsForDialect,
  JSON_CAST,
};
