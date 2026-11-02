import * as parser from '../../../utils/parseFieldExpression';
import { asArray, isObject, isString } from '../../../utils/objectUtils';
import { toPgJsonPathLiteral, toPgQuotedColumn } from '../../../utils/postgresJsonPath';
import type { KnexBuilder, KnexInstance } from '../types';

// The arguments of a knex `whereRaw()` call.
type RawQueryParams = [sql: string] | [sql: string, binding: string];

/**
 * @typedef {String} FieldExpression
 *
 * Field expressions allow one to refer to separate JSONB fields inside columns.
 *
 * Syntax: <column reference>[:<json field reference>]
 *
 * e.g. `Person.jsonColumnName:details.names[1]` would refer to value `'Second'`
 * in column `Person.jsonColumnName` which has
 * `{ details: { names: ['First', 'Second', 'Last'] } }` object stored in it.
 *
 * First part `<column reference>` is compatible with column references used in
 * knex e.g. `MyFancyTable.tributeToThBestColumnNameEver`.
 *
 * Second part describes a path to an attribute inside the referred column.
 * It is optional and it always starts with colon which follows directly with
 * first path element. e.g. `Table.jsonObjectColumnName:jsonFieldName` or
 * `Table.jsonArrayColumn:[321]`.
 *
 * Syntax supports `[<key or index>]` and `.<key or index>` flavors of reference
 * to json keys / array indexes:
 *
 * e.g. both `Table.myColumn:[1][3]` and `Table.myColumn:1.3` would access correctly
 * both of the following objects `[null, [null,null,null, "I was accessed"]]` and
 * `{ "1": { "3" : "I was accessed" } }`
 *
 * Caveats when using special characters in keys:
 *
 * 1. `objectColumn.key` This is the most common syntax, good if you are
 *    not using dots or square brackets `[]` in your json object key name.
 * 2. Keys containing dots `objectColumn:[keywith.dots]` Column `{ "keywith.dots" : "I was referred" }`
 * 3. Keys containing square brackets `column['[]']` `{ "[]" : "This is getting ridiculous..." }`
 * 4. Keys containing square brackets and quotes
 *    `objectColumn:['Double."Quote".[]']` and `objectColumn:["Sinlge.'Quote'.[]"]`
 *    Column `{ "Double.\"Quote\".[]" : "I was referred",  "Single.'Quote'.[]" : "Mee too!" }`
 * 99. Keys containing dots, square brackets, single quotes and double quotes in one json key is
 *     not currently supported
 */

function parseFieldExpression(expression: string, extractAsText?: boolean): string {
  const parsed = parser.parseFieldExpression(expression);
  const extractor = extractAsText ? '#>>' : '#>';
  return `${toPgQuotedColumn(parsed.columnName)}${extractor}${toPgJsonPathLiteral(parsed.access)}`;
}

function whereJsonbRefOnLeftJsonbValOrRefOnRight(
  builder: KnexBuilder,
  fieldExpression: string,
  operator: string,
  jsonObjectOrFieldExpression: unknown,
  queryPrefix?: string,
): KnexBuilder {
  const queryParams = whereJsonbRefOnLeftJsonbValOrRefOnRightRawQueryParams(
    fieldExpression,
    operator,
    jsonObjectOrFieldExpression,
    queryPrefix,
  );
  return builder.whereRaw.apply(builder, queryParams);
}

function whereJsonbRefOnLeftJsonbValOrRefOnRightRawQueryParams(
  fieldExpression: string,
  operator: string,
  jsonObjectOrFieldExpression: unknown,
  queryPrefix?: string,
): RawQueryParams {
  const fieldReference = parseFieldExpression(fieldExpression);

  if (isString(jsonObjectOrFieldExpression)) {
    const rightHandReference = parseFieldExpression(jsonObjectOrFieldExpression);
    const refRefQuery = [
      '(',
      fieldReference,
      ')::jsonb',
      operator,
      '(',
      rightHandReference,
      ')::jsonb',
    ];
    if (queryPrefix) {
      refRefQuery.unshift(queryPrefix);
    }
    return [refRefQuery.join(' ')];
  } else if (isObject(jsonObjectOrFieldExpression)) {
    const refValQuery = ['(', fieldReference, ')::jsonb', operator, '?::jsonb'];
    if (queryPrefix) {
      refValQuery.unshift(queryPrefix);
    }
    return [refValQuery.join(' '), JSON.stringify(jsonObjectOrFieldExpression)];
  }

  throw new Error('Invalid right hand expression.');
}

function whereJsonFieldRightStringArrayOnLeftQuery(
  knex: KnexInstance,
  fieldExpression: string,
  operator: string,
  // A key or an array of keys, made an array below.
  keys: string | string[],
): [sql: string, bindings: unknown[]] {
  const fieldReference = parseFieldExpression(fieldExpression);
  keys = asArray(keys);

  const questionMarksArray = keys.map((key) => {
    if (!isString(key)) {
      throw new Error('All keys to find must be strings.');
    }
    return '?';
  });

  const rightHandExpression = 'array[' + questionMarksArray.join(',') + ']';

  return [`${fieldReference} ${operator.replace('?', '\\?')} ${rightHandExpression}`, keys];
}

function whereJsonFieldQuery(
  knex: KnexInstance,
  fieldExpression: string,
  operator: string,
  value: unknown,
): [sql: string, bindings: unknown[]] {
  const fieldReference = parseFieldExpression(fieldExpression, true);
  const normalizedOperator = normalizeOperator(knex, operator);

  // json type comparison takes json type in string format
  let cast: string;
  let valuePlaceholder = '?';
  let bindings: unknown[] = [value];
  const type = typeof value;

  if (type === 'number') {
    cast = '::NUMERIC';
  } else if (type === 'boolean') {
    cast = '::BOOLEAN';
  } else if (type === 'string') {
    cast = '::TEXT';
  } else if (value === null) {
    cast = '::TEXT';
    valuePlaceholder = 'NULL';
    bindings = [];
  } else {
    throw new Error('Value must be string, number, boolean or null.');
  }

  return [`(${fieldReference})${cast} ${normalizedOperator} ${valuePlaceholder}`, bindings];
}

function normalizeOperator(knex: KnexInstance, operator: string): string {
  const trimmedLowerCase = operator.trim().toLowerCase();

  switch (trimmedLowerCase) {
    case 'is':
    case 'is not':
      return trimmedLowerCase;
    default:
      // knex has no public way to check an operator, and only `is` is used.
      throw new Error(`unsupported operator "${operator}" in a JSON field query`);
  }
}

export {
  parseFieldExpression,
  whereJsonbRefOnLeftJsonbValOrRefOnRight,
  whereJsonbRefOnLeftJsonbValOrRefOnRightRawQueryParams,
  whereJsonFieldRightStringArrayOnLeftQuery,
  whereJsonFieldQuery,
};
