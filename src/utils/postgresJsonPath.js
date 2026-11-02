'use strict';

const { getDialect } = require('./knexUtils');

// Characters that force an element of a postgres text array literal to be
// double quoted: the array syntax characters, whitespace and control chars.
const ARRAY_ELEMENT_NEEDS_QUOTES = /[{}",\\\s\x00-\x1f\x7f]|^$|^null$/i;
// Characters that can't appear as-is inside a plain '...' string literal
// without depending on the `standard_conforming_strings` setting.
const NEEDS_ESCAPE_STRING = /[\\\x00-\x1f\x7f]/;
const POSTGRES_DIALECTS = ['postgresql', 'redshift'];
const MYSQL_DIALECTS = ['mysql', 'mysql2'];

/**
 * Converts the `access` part of a parsed field expression into a postgres
 * text array literal like `{a,b,1}`. Elements are quoted and escaped so that
 * keys containing array syntax characters can't change the path.
 */
function toPgTextArray(access) {
  const elements = access.map((it) => {
    if (it.type === 'array' && Number.isInteger(it.ref)) {
      return String(it.ref);
    }

    const ref = String(it.ref);

    if (ARRAY_ELEMENT_NEEDS_QUOTES.test(ref)) {
      return `"${ref.replace(/[\\"]/g, '\\$&')}"`;
    } else {
      return ref;
    }
  });

  return `{${elements.join(',')}}`;
}

/**
 * Converts a string into a postgres string literal that is safe to embed
 * into a knex raw query. Single quotes are doubled and `?` characters are
 * escaped so that knex doesn't treat them as binding placeholders.
 *
 * If the string contains backslashes or control characters, an escape
 * string literal `E'...'` with octal escapes is used. This way the result
 * is the same regardless of `standard_conforming_strings` and no literal
 * backslash ever ends up next to a `?` (knex would eat it).
 */
function toPgStringLiteral(str) {
  let sql = str.replace(/'/g, "''");

  if (NEEDS_ESCAPE_STRING.test(sql)) {
    sql = sql.replace(/[\\\x00-\x1f\x7f]/g, (char) => {
      return '\\' + char.charCodeAt(0).toString(8).padStart(3, '0');
    });

    sql = `E'${sql}'`;
  } else {
    sql = `'${sql}'`;
  }

  return sql.replace(/\?/g, '\\?');
}

/**
 * Converts the `access` part of a parsed field expression into a string
 * literal that can be used as the right hand side of `#>`, `#>>` and as the
 * path argument of `jsonb_set`.
 */
function toPgJsonPathLiteral(access) {
  return toPgStringLiteral(toPgTextArray(access));
}

/**
 * Quotes a (possibly table qualified) column name like `Table.column` as
 * `"Table"."column"` for postgres.
 */
function toPgQuotedColumn(columnName) {
  return columnName
    .split('.')
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join('.')
    .replace(/\?/g, '\\?');
}

/**
 * Returns the flavor of JSON SQL to generate for field expressions: `'postgres'`
 * or `'mysql'`. Other databases throw, since postgres SQL is invalid at best and
 * dangerous at worst there (on MySQL `#` starts a comment). `knex` can be null,
 * when the query has no knex instance bound yet, in which case postgres is used.
 */
function getJsonDialect(knex, expression) {
  const dialect = knex ? getDialect(knex) : null;

  if (dialect === null || POSTGRES_DIALECTS.includes(dialect)) {
    return 'postgres';
  } else if (MYSQL_DIALECTS.includes(dialect)) {
    return 'mysql';
  } else {
    throw new Error(
      `JSON field expressions are only supported on postgres and mysql. Tried to use "${expression}" with dialect "${dialect}".`,
    );
  }
}

module.exports = {
  toPgTextArray,
  toPgStringLiteral,
  toPgJsonPathLiteral,
  toPgQuotedColumn,
  getJsonDialect,
};
