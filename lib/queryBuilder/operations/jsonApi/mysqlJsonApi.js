'use strict';

const { parseFieldExpression } = require('../../../utils/parseFieldExpression');
const { asArray, isObject, isPlainObject, isString } = require('../../../utils/objectUtils');
const { toMySqlJsonPath } = require('../../../utils/mysqlJsonPath');

// The MySQL versions of the `whereJson*` methods. They mirror the postgres
// operators (`@>`, `<@`, `?|`, `?&`) so that the methods find the same rows on
// both databases.
//
// The parts of the queries are `{ sql, bindings, type }` objects. `type` is
// `'object'` or `'nonObject'` when the JSON type of the part is known.

// Joins sql parts: sql`JSON_CONTAINS(${target}, ${candidate})`.
function sql(strings, ...parts) {
  let text = strings[0];
  const bindings = [];

  parts.forEach((part, i) => {
    text += part.sql + strings[i + 1];
    bindings.push(...part.bindings);
  });

  return { sql: text, bindings };
}

function literal(text) {
  return { sql: text, bindings: [] };
}

// A field expression like `Table.column:a.b[0]`.
function field(expression) {
  const parsed = parseFieldExpression(expression);

  if (parsed.access.length === 0) {
    return { sql: '??', bindings: [parsed.columnName] };
  } else {
    return {
      sql: 'JSON_EXTRACT(??, ?)',
      bindings: [parsed.columnName, toMySqlJsonPath(parsed.access)],
    };
  }
}

function jsonValue(value) {
  return {
    sql: 'CAST(? AS JSON)',
    bindings: [JSON.stringify(value)],
    type: isPlainObject(value) ? 'object' : 'nonObject',
  };
}

// The right hand side of the methods: a field expression or a JSON value.
function fieldOrValue(value) {
  if (isString(value)) {
    return field(value);
  } else if (isObject(value)) {
    return jsonValue(value);
  } else {
    throw new Error('Invalid right hand expression.');
  }
}

// `target @> candidate`. On postgres an object is only contained in an object, but
// MySQL's `JSON_CONTAINS()` also finds objects inside arrays.
function contains(target, candidate) {
  const containsSql = sql`JSON_CONTAINS(${target}, ${candidate})`;
  let guard = null;

  if (candidate.type === 'nonObject' || target.type === 'object') {
    guard = null;
  } else if (candidate.type === 'object') {
    guard = target.type === 'nonObject' ? literal('FALSE') : sql`JSON_TYPE(${target}) = 'OBJECT'`;
  } else if (target.type === 'nonObject') {
    guard = sql`JSON_TYPE(${candidate}) <> 'OBJECT'`;
  } else {
    guard = sql`(JSON_TYPE(${candidate}) <> 'OBJECT' OR JSON_TYPE(${target}) = 'OBJECT')`;
  }

  return guard ? sql`(${containsSql} AND ${guard})` : containsSql;
}

function not(part, prefix) {
  return prefix === 'not' ? sql`NOT ${part}` : part;
}

function toRawArgs(part) {
  return [part.sql, part.bindings];
}

// `whereJsonSupersetOf` (`@>`) and `whereJsonSubsetOf` (`<@`).
function whereJsonContains(fieldExpression, operator, jsonObjectOrFieldExpression, prefix) {
  const left = field(fieldExpression);
  const right = fieldOrValue(jsonObjectOrFieldExpression);
  const condition = operator === '@>' ? contains(left, right) : contains(right, left);

  return toRawArgs(not(condition, prefix));
}

// `whereJsonNotArray` and `whereJsonNotObject`. Like on postgres, NULL is neither
// an array nor an object.
function whereJsonNotContains(fieldExpression, compareValue) {
  const left = field(fieldExpression);
  return toRawArgs(sql`(NOT ${contains(left, jsonValue(compareValue))} OR ${left} IS NULL)`);
}

// `whereJsonHasAny` (`?|`) and `whereJsonHasAll` (`?&`). Like on postgres, the keys
// are looked for in the keys of objects, in the string items of arrays and in
// strings.
function whereJsonHas(fieldExpression, operator, keys) {
  const left = field(fieldExpression);
  const all = operator === '?&';

  keys = asArray(keys);

  for (const key of keys) {
    if (!isString(key)) {
      throw new Error('All keys to find must be strings.');
    }
  }

  if (keys.length === 0) {
    return toRawArgs(all ? sql`${left} IS NOT NULL` : literal('FALSE'));
  }

  const paths = {
    sql: keys.map(() => '?').join(', '),
    bindings: keys.map((key) => toMySqlJsonPath([{ type: 'object', ref: key }])),
  };

  const keysJson = jsonValue(keys);
  const stringChecks = keys.map((key) => ({
    sql: `JSON_UNQUOTE(${left.sql}) = ?`,
    bindings: [...left.bindings, key],
  }));

  const stringCheck = {
    sql: `(${stringChecks.map((it) => it.sql).join(all ? ' AND ' : ' OR ')})`,
    bindings: stringChecks.flatMap((it) => it.bindings),
  };

  const objectCheck = sql`JSON_CONTAINS_PATH(${left}, ${literal(all ? "'all'" : "'one'")}, ${paths})`;
  const arrayCheck = all
    ? sql`JSON_CONTAINS(${left}, ${keysJson})`
    : sql`JSON_OVERLAPS(${left}, ${keysJson})`;

  return toRawArgs(
    sql`(CASE JSON_TYPE(${left}) WHEN 'OBJECT' THEN ${objectCheck} WHEN 'ARRAY' THEN ${arrayCheck} WHEN 'STRING' THEN ${stringCheck} ELSE FALSE END)`,
  );
}

// `whereJsonOverlaps`. A NULL or missing field doesn't overlap anything, so
// `whereJsonNotOverlaps` finds it.
function whereJsonOverlaps(fieldExpression, jsonObjectOrFieldExpression, prefix) {
  const overlaps = sql`JSON_OVERLAPS(${field(fieldExpression)}, ${fieldOrValue(
    jsonObjectOrFieldExpression,
  )})`;

  return toRawArgs(prefix === 'not' ? sql`NOT COALESCE(${overlaps}, FALSE)` : overlaps);
}

module.exports = {
  whereJsonContains,
  whereJsonNotContains,
  whereJsonHas,
  whereJsonOverlaps,
};
