'use strict';

// SQL types of `ReferenceBuilder` casts that MySQL's `CAST()` calls differently.
// `CAST(x AS integer)` for example is a syntax error on MySQL.
const MYSQL_CAST_TYPES = {
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
function toMySqlJsonPath(access) {
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

function toMySqlCastType(sqlType) {
  return MYSQL_CAST_TYPES[sqlType.toLowerCase()] || sqlType;
}

function isBooleanType(sqlType) {
  const type = sqlType.toLowerCase();
  return type === 'boolean' || type === 'bool';
}

module.exports = {
  toMySqlJsonPath,
  toMySqlCastType,
  isBooleanType,
};
