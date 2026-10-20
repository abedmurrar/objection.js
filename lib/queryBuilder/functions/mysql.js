'use strict';

const { ref } = require('../ReferenceBuilder');

// The MySQL 8.4 built-in functions, as `fn.*` helpers.
//
// Each entry is `[name, sql, params, result, options]`:
//
//   name     the name of the helper: `fn.dateFormat()`
//   sql      the name of the SQL function: `DATE_FORMAT`
//   params   the parameters, as TypeScript
//   result   the type of the result, as TypeScript
//   options  `json`: the arguments that are JSON documents. Objects and arrays
//                    passed to them are cast to JSON. An array of indexes,
//                    'all', or 'even' (0, 2, 4, ...) / 'odd' (1, 3, 5, ...).
//            `portable`: the function works the same on postgres, so it
//                    isn't limited to MySQL.
//            `build`: a function that builds the sql for functions with
//                    keywords in their syntax, like `TIMESTAMPDIFF(DAY, ?, ?)`.
//            `aggregate`: the function is an aggregate that `filter()` works
//                    with. `true` when every argument is aggregated, or a
//                    function that returns how many of the first arguments are.
//            `window`: the function is a window function, which needs `over()`.
//
// The arguments are bindings, so strings are values. Columns are passed with
// `ref()` or `Model.ref()`.
//
// The typings in `typings/objection/index.d.ts` are generated from this list
// with `node scripts/generate-fn-typings.js`.
//
// Not included: spatial functions, operators, `CASE`, `JSON_TABLE()`, internal functions and functions
// that are deprecated (`JSON_MERGE()`, `FOUND_ROWS()`, `VALUES()`,
// `MASTER_POS_WAIT()`) or that need a component (`VALIDATE_PASSWORD_STRENGTH()`).
// `fn('NAME', ...args)` calls any function.

const STR = 'string | null';
const NUM = 'number | null';
const DEC = 'FnNumeric | null';
const BOOL = '0 | 1 | null';
const DATE = 'Date | string | null';
const TIME = 'string | null';
const BIN = 'Buffer | null';
const ANY = 'unknown';

const X = 'x: FnArg';
const STRING = 'str: FnArg';
const DATE_ARG = 'date: FnArg';
const FSP = 'fsp?: number';
const LAG_PARAMS = 'x: FnArg, offset?: number, defaultValue?: FnArg';
const WINDOW = { portable: true, window: true };

const INTERVAL_UNITS = [
  'MICROSECOND',
  'SECOND',
  'MINUTE',
  'HOUR',
  'DAY',
  'WEEK',
  'MONTH',
  'QUARTER',
  'YEAR',
  'SECOND_MICROSECOND',
  'MINUTE_MICROSECOND',
  'MINUTE_SECOND',
  'HOUR_MICROSECOND',
  'HOUR_SECOND',
  'HOUR_MINUTE',
  'DAY_MICROSECOND',
  'DAY_SECOND',
  'DAY_MINUTE',
  'DAY_HOUR',
  'YEAR_MONTH',
];

const TIMESTAMP_UNITS = INTERVAL_UNITS.slice(0, 9);
const CAST_TYPE =
  /^((BINARY|CHAR|NCHAR)(\(\d+\))?( CHARACTER SET \w+)?|DATE|(DATETIME|TIME)(\(\d\))?|DECIMAL(\(\d+(, ?\d+)?\))?|DOUBLE|FLOAT(\(\d+\))?|JSON|REAL|(SIGNED|UNSIGNED)( INTEGER)?|YEAR)$/i;
const CHARSET = /^\w+$/;
const MATCH_MODES = {
  natural: 'IN NATURAL LANGUAGE MODE',
  'natural with query expansion': 'IN NATURAL LANGUAGE MODE WITH QUERY EXPANSION',
  boolean: 'IN BOOLEAN MODE',
  'with query expansion': 'WITH QUERY EXPANSION',
};
const TRIM_SIDES = ['BOTH', 'LEADING', 'TRAILING'];
const DIRECTIONS = ['ASC', 'DESC'];
const FORMAT_TYPES = ['DATE', 'TIME', 'DATETIME', 'TIMESTAMP'];

const FUNCTIONS = [
  // String functions.
  ['ascii', 'ASCII', STRING, NUM, { portable: true }],
  ['bin', 'BIN', 'n: FnArg', STR],
  ['bitLength', 'BIT_LENGTH', STRING, NUM, { portable: true }],
  [
    'char',
    'CHAR',
    'codes: FnArg | FnArg[], options?: { using?: string }',
    BIN,
    { build: buildChar },
  ],
  ['charLength', 'CHAR_LENGTH', STRING, NUM, { portable: true }],
  ['characterLength', 'CHARACTER_LENGTH', STRING, NUM, { portable: true }],
  ['concatWs', 'CONCAT_WS', 'separator: FnArg, ...strs: FnArg[]', STR, { portable: true }],
  ['elt', 'ELT', 'n: FnArg, ...strs: FnArg[]', STR],
  [
    'exportSet',
    'EXPORT_SET',
    'bits: FnArg, on: FnArg, off: FnArg, separator?: FnArg, numberOfBits?: FnArg',
    STR,
  ],
  ['field', 'FIELD', 'str: FnArg, ...strs: FnArg[]', NUM],
  ['findInSet', 'FIND_IN_SET', 'str: FnArg, strList: FnArg', NUM],
  ['format', 'FORMAT', 'x: FnArg, decimals: FnArg, locale?: FnArg', STR],
  ['fromBase64', 'FROM_BASE64', STRING, BIN],
  ['hex', 'HEX', X, STR],
  ['insert', 'INSERT', 'str: FnArg, pos: FnArg, len: FnArg, newStr: FnArg', STR],
  ['instr', 'INSTR', 'str: FnArg, substr: FnArg', NUM],
  ['lcase', 'LCASE', STRING, STR],
  ['left', 'LEFT', 'str: FnArg, len: FnArg', STR, { portable: true }],
  ['length', 'LENGTH', STRING, NUM, { portable: true }],
  ['locate', 'LOCATE', 'substr: FnArg, str: FnArg, pos?: FnArg', NUM],
  ['lpad', 'LPAD', 'str: FnArg, len: FnArg, padStr: FnArg', STR, { portable: true }],
  ['ltrim', 'LTRIM', STRING, STR, { portable: true }],
  ['makeSet', 'MAKE_SET', 'bits: FnArg, ...strs: FnArg[]', STR],
  ['mid', 'MID', 'str: FnArg, pos: FnArg, len?: FnArg', STR],
  ['oct', 'OCT', 'n: FnArg', STR],
  ['octetLength', 'OCTET_LENGTH', STRING, NUM, { portable: true }],
  ['ord', 'ORD', STRING, NUM],
  [
    'position',
    'POSITION',
    'substr: FnArg, str: FnArg',
    NUM,
    { portable: true, build: buildPosition },
  ],
  ['quote', 'QUOTE', STRING, STR],
  [
    'regexpInstr',
    'REGEXP_INSTR',
    'expr: FnArg, pattern: FnArg, pos?: FnArg, occurrence?: FnArg, returnOption?: FnArg, matchType?: FnArg',
    NUM,
  ],
  ['regexpLike', 'REGEXP_LIKE', 'expr: FnArg, pattern: FnArg, matchType?: FnArg', BOOL],
  [
    'regexpReplace',
    'REGEXP_REPLACE',
    'expr: FnArg, pattern: FnArg, replacement: FnArg, pos?: FnArg, occurrence?: FnArg, matchType?: FnArg',
    STR,
  ],
  [
    'regexpSubstr',
    'REGEXP_SUBSTR',
    'expr: FnArg, pattern: FnArg, pos?: FnArg, occurrence?: FnArg, matchType?: FnArg',
    STR,
  ],
  ['repeat', 'REPEAT', 'str: FnArg, count: FnArg', STR, { portable: true }],
  ['replace', 'REPLACE', 'str: FnArg, from: FnArg, to: FnArg', STR, { portable: true }],
  ['reverse', 'REVERSE', STRING, STR, { portable: true }],
  ['right', 'RIGHT', 'str: FnArg, len: FnArg', STR, { portable: true }],
  ['rpad', 'RPAD', 'str: FnArg, len: FnArg, padStr: FnArg', STR, { portable: true }],
  ['rtrim', 'RTRIM', STRING, STR, { portable: true }],
  ['soundex', 'SOUNDEX', STRING, STR],
  ['space', 'SPACE', 'n: FnArg', STR],
  ['strcmp', 'STRCMP', 'a: FnArg, b: FnArg', '-1 | 0 | 1 | null'],
  ['substr', 'SUBSTR', 'str: FnArg, pos: FnArg, len?: FnArg', STR, { portable: true }],
  ['substring', 'SUBSTRING', 'str: FnArg, pos: FnArg, len?: FnArg', STR, { portable: true }],
  ['substringIndex', 'SUBSTRING_INDEX', 'str: FnArg, delimiter: FnArg, count: FnArg', STR],
  ['toBase64', 'TO_BASE64', STRING, STR],
  [
    'trim',
    'TRIM',
    "str: FnArg, options?: { side?: 'both' | 'leading' | 'trailing'; remove?: FnArg }",
    STR,
    { portable: true, build: buildTrim },
  ],
  ['ucase', 'UCASE', STRING, STR],
  ['unhex', 'UNHEX', STRING, BIN],
  ['weightString', 'WEIGHT_STRING', STRING, BIN],
  [
    'match',
    'MATCH',
    "columns: FnArg | FnArg[], search: FnArg, options?: { mode?: 'natural' | 'natural with query expansion' | 'boolean' | 'with query expansion' }",
    NUM,
    { build: buildMatch },
  ],

  // Numeric functions.
  ['abs', 'ABS', X, DEC, { portable: true }],
  ['acos', 'ACOS', X, NUM, { portable: true }],
  ['asin', 'ASIN', X, NUM, { portable: true }],
  ['atan', 'ATAN', 'x: FnArg, y?: FnArg', NUM],
  ['atan2', 'ATAN2', 'y: FnArg, x: FnArg', NUM, { portable: true }],
  ['ceil', 'CEIL', X, DEC, { portable: true }],
  ['ceiling', 'CEILING', X, DEC, { portable: true }],
  ['conv', 'CONV', 'n: FnArg, fromBase: FnArg, toBase: FnArg', STR],
  ['cos', 'COS', X, NUM, { portable: true }],
  ['cot', 'COT', X, NUM, { portable: true }],
  ['crc32', 'CRC32', X, NUM],
  ['degrees', 'DEGREES', X, NUM, { portable: true }],
  ['exp', 'EXP', X, NUM, { portable: true }],
  ['floor', 'FLOOR', X, DEC, { portable: true }],
  ['ln', 'LN', X, NUM, { portable: true }],
  ['log', 'LOG', 'baseOrX: FnArg, x?: FnArg', NUM],
  ['log10', 'LOG10', X, NUM],
  ['log2', 'LOG2', X, NUM],
  ['mod', 'MOD', 'n: FnArg, m: FnArg', DEC, { portable: true }],
  ['pi', 'PI', '', NUM, { portable: true }],
  ['pow', 'POW', 'x: FnArg, y: FnArg', NUM],
  ['power', 'POWER', 'x: FnArg, y: FnArg', NUM, { portable: true }],
  ['radians', 'RADIANS', X, NUM, { portable: true }],
  ['rand', 'RAND', 'seed?: FnArg', NUM],
  ['round', 'ROUND', 'x: FnArg, decimals?: FnArg', DEC, { portable: true }],
  ['sign', 'SIGN', X, NUM, { portable: true }],
  ['sin', 'SIN', X, NUM, { portable: true }],
  ['sqrt', 'SQRT', X, NUM, { portable: true }],
  ['tan', 'TAN', X, NUM, { portable: true }],
  ['truncate', 'TRUNCATE', 'x: FnArg, decimals: FnArg', DEC],

  // Date and time functions.
  [
    'addDate',
    'ADDDATE',
    'date: FnArg, amount: FnArg, unit?: FnIntervalUnit',
    DATE,
    { build: buildDateAdd },
  ],
  ['addTime', 'ADDTIME', 'datetime: FnArg, time: FnArg', DATE],
  ['convertTz', 'CONVERT_TZ', 'datetime: FnArg, fromTz: FnArg, toTz: FnArg', DATE],
  ['curDate', 'CURDATE', '', DATE],
  ['currentDate', 'CURRENT_DATE', '', DATE],
  ['currentTime', 'CURRENT_TIME', FSP, TIME],
  ['currentTimestamp', 'CURRENT_TIMESTAMP', FSP, DATE],
  ['curTime', 'CURTIME', FSP, TIME],
  ['date', 'DATE', X, DATE],
  [
    'dateAdd',
    'DATE_ADD',
    'date: FnArg, amount: FnArg, unit: FnIntervalUnit',
    DATE,
    { build: buildDateAdd },
  ],
  ['dateDiff', 'DATEDIFF', 'a: FnArg, b: FnArg', NUM],
  ['dateFormat', 'DATE_FORMAT', 'date: FnArg, format: FnArg', STR],
  [
    'dateSub',
    'DATE_SUB',
    'date: FnArg, amount: FnArg, unit: FnIntervalUnit',
    DATE,
    { build: buildDateAdd },
  ],
  ['day', 'DAY', DATE_ARG, NUM],
  ['dayName', 'DAYNAME', DATE_ARG, STR],
  ['dayOfMonth', 'DAYOFMONTH', DATE_ARG, NUM],
  ['dayOfWeek', 'DAYOFWEEK', DATE_ARG, NUM],
  ['dayOfYear', 'DAYOFYEAR', DATE_ARG, NUM],
  ['extract', 'EXTRACT', 'unit: FnIntervalUnit, date: FnArg', NUM, { build: buildExtract }],
  ['fromDays', 'FROM_DAYS', 'days: FnArg', DATE],
  ['fromUnixTime', 'FROM_UNIXTIME', 'timestamp: FnArg, format?: FnArg', DATE],
  [
    'getFormat',
    'GET_FORMAT',
    "type: 'DATE' | 'TIME' | 'DATETIME' | 'TIMESTAMP', locale: FnArg",
    STR,
    { build: buildGetFormat },
  ],
  ['hour', 'HOUR', 'time: FnArg', NUM],
  ['lastDay', 'LAST_DAY', DATE_ARG, DATE],
  ['localTime', 'LOCALTIME', FSP, DATE],
  ['localTimestamp', 'LOCALTIMESTAMP', FSP, DATE],
  ['makeDate', 'MAKEDATE', 'year: FnArg, dayOfYear: FnArg', DATE],
  ['makeTime', 'MAKETIME', 'hour: FnArg, minute: FnArg, second: FnArg', TIME],
  ['microsecond', 'MICROSECOND', 'time: FnArg', NUM],
  ['minute', 'MINUTE', 'time: FnArg', NUM],
  ['month', 'MONTH', DATE_ARG, NUM],
  ['monthName', 'MONTHNAME', DATE_ARG, STR],
  ['periodAdd', 'PERIOD_ADD', 'period: FnArg, months: FnArg', NUM],
  ['periodDiff', 'PERIOD_DIFF', 'a: FnArg, b: FnArg', NUM],
  ['quarter', 'QUARTER', DATE_ARG, NUM],
  ['second', 'SECOND', 'time: FnArg', NUM],
  ['secToTime', 'SEC_TO_TIME', 'seconds: FnArg', TIME],
  ['strToDate', 'STR_TO_DATE', 'str: FnArg, format: FnArg', DATE],
  [
    'subDate',
    'SUBDATE',
    'date: FnArg, amount: FnArg, unit?: FnIntervalUnit',
    DATE,
    { build: buildDateAdd },
  ],
  ['subTime', 'SUBTIME', 'datetime: FnArg, time: FnArg', DATE],
  ['sysdate', 'SYSDATE', FSP, DATE],
  ['time', 'TIME', X, TIME],
  ['timeDiff', 'TIMEDIFF', 'a: FnArg, b: FnArg', TIME],
  ['timestamp', 'TIMESTAMP', 'x: FnArg, time?: FnArg', DATE],
  [
    'timestampAdd',
    'TIMESTAMPADD',
    'unit: FnTimestampUnit, amount: FnArg, date: FnArg',
    DATE,
    { build: buildTimestampFunction },
  ],
  [
    'timestampDiff',
    'TIMESTAMPDIFF',
    'unit: FnTimestampUnit, from: FnArg, to: FnArg',
    NUM,
    { build: buildTimestampFunction },
  ],
  ['timeFormat', 'TIME_FORMAT', 'time: FnArg, format: FnArg', STR],
  ['timeToSec', 'TIME_TO_SEC', 'time: FnArg', NUM],
  ['toDays', 'TO_DAYS', DATE_ARG, NUM],
  ['toSeconds', 'TO_SECONDS', DATE_ARG, NUM],
  ['unixTimestamp', 'UNIX_TIMESTAMP', 'date?: FnArg', DEC],
  ['utcDate', 'UTC_DATE', '', DATE],
  ['utcTime', 'UTC_TIME', FSP, TIME],
  ['utcTimestamp', 'UTC_TIMESTAMP', FSP, DATE],
  ['week', 'WEEK', 'date: FnArg, mode?: FnArg', NUM],
  ['weekday', 'WEEKDAY', DATE_ARG, NUM],
  ['weekOfYear', 'WEEKOFYEAR', DATE_ARG, NUM],
  ['year', 'YEAR', DATE_ARG, NUM],
  ['yearWeek', 'YEARWEEK', 'date: FnArg, mode?: FnArg', NUM],

  // Aggregate functions. `fn.count()`, `fn.sum()`, `fn.avg()`, `fn.min()` and
  // `fn.max()` already exist.
  ['bitAnd', 'BIT_AND', X, DEC, { aggregate: true }],
  ['bitOr', 'BIT_OR', X, DEC, { aggregate: true }],
  ['bitXor', 'BIT_XOR', X, DEC, { aggregate: true }],
  [
    'countDistinct',
    'COUNT',
    '...exprs: FnArg[]',
    'number',
    { build: buildCountDistinct, aggregate: true, portable: true },
  ],
  [
    'groupConcat',
    'GROUP_CONCAT',
    'exprs: FnArg | FnArg[], options?: { distinct?: boolean; orderBy?: FnOrderBy | FnOrderBy[]; separator?: string }',
    STR,
    { build: buildGroupConcat, aggregate: ([exprs]) => (Array.isArray(exprs) ? exprs.length : 1) },
  ],
  ['jsonArrayAgg', 'JSON_ARRAYAGG', X, 'unknown[] | null', { aggregate: true }],
  ['jsonObjectAgg', 'JSON_OBJECTAGG', 'key: FnArg, value: FnArg', 'Record<string, unknown> | null'],
  ['std', 'STD', X, NUM, { aggregate: true }],
  ['stddev', 'STDDEV', X, NUM, { portable: true, aggregate: true }],
  ['stddevPop', 'STDDEV_POP', X, NUM, { portable: true, aggregate: true }],
  ['stddevSamp', 'STDDEV_SAMP', X, NUM, { portable: true, aggregate: true }],
  ['variance', 'VARIANCE', X, NUM, { portable: true, aggregate: true }],
  ['varPop', 'VAR_POP', X, NUM, { portable: true, aggregate: true }],
  ['varSamp', 'VAR_SAMP', X, NUM, { portable: true, aggregate: true }],

  // Window functions. They need `over()`: `fn.rowNumber().over({ orderBy })`.
  // Aggregate functions work as window functions too.
  ['rowNumber', 'ROW_NUMBER', '', 'number', WINDOW],
  ['rank', 'RANK', '', 'number', WINDOW],
  ['denseRank', 'DENSE_RANK', '', 'number', WINDOW],
  ['percentRank', 'PERCENT_RANK', '', 'number', WINDOW],
  ['cumeDist', 'CUME_DIST', '', 'number', WINDOW],
  ['ntile', 'NTILE', 'buckets: number', 'number', { ...WINDOW, build: buildNtile }],
  ['lag', 'LAG', LAG_PARAMS, ANY, { ...WINDOW, build: buildLagOrLead }],
  ['lead', 'LEAD', LAG_PARAMS, ANY, { ...WINDOW, build: buildLagOrLead }],
  ['firstValue', 'FIRST_VALUE', X, ANY, WINDOW],
  ['lastValue', 'LAST_VALUE', X, ANY, WINDOW],
  ['nthValue', 'NTH_VALUE', 'x: FnArg, n: number', ANY, { ...WINDOW, build: buildNthValue }],

  // Comparison and flow control functions. `fn.coalesce()` already exists.
  ['greatest', 'GREATEST', '...values: FnArg[]', ANY, { portable: true }],
  ['if', 'IF', 'condition: FnArg, then: FnArg, otherwise: FnArg', ANY],
  ['ifNull', 'IFNULL', 'value: FnArg, otherwise: FnArg', ANY],
  ['interval', 'INTERVAL', 'n: FnArg, ...ns: FnArg[]', NUM],
  ['isNull', 'ISNULL', X, BOOL],
  ['least', 'LEAST', '...values: FnArg[]', ANY, { portable: true }],
  ['nullIf', 'NULLIF', 'a: FnArg, b: FnArg', ANY, { portable: true }],

  // Cast functions.
  ['cast', 'CAST', 'x: FnArg, type: string', ANY, { build: buildCast }],
  [
    'convert',
    'CONVERT',
    'x: FnArg, type: string | { using: string }',
    ANY,
    { build: buildConvert },
  ],

  // Information functions.
  ['charset', 'CHARSET', STRING, STR],
  ['coercibility', 'COERCIBILITY', STRING, NUM],
  ['collation', 'COLLATION', STRING, STR],
  ['connectionId', 'CONNECTION_ID', '', NUM],
  ['currentRole', 'CURRENT_ROLE', '', STR],
  ['currentUser', 'CURRENT_USER', '', STR],
  ['database', 'DATABASE', '', STR],
  ['icuVersion', 'ICU_VERSION', '', STR],
  ['lastInsertId', 'LAST_INSERT_ID', 'x?: FnArg', NUM],
  ['rolesGraphml', 'ROLES_GRAPHML', '', STR],
  ['rowCount', 'ROW_COUNT', '', NUM],
  ['schema', 'SCHEMA', '', STR],
  ['sessionUser', 'SESSION_USER', '', STR],
  ['systemUser', 'SYSTEM_USER', '', STR],
  ['user', 'USER', '', STR],
  ['version', 'VERSION', '', STR],

  // Encryption and compression functions.
  ['aesDecrypt', 'AES_DECRYPT', 'crypt: FnArg, key: FnArg, ...options: FnArg[]', BIN],
  ['aesEncrypt', 'AES_ENCRYPT', 'str: FnArg, key: FnArg, ...options: FnArg[]', BIN],
  ['compress', 'COMPRESS', STRING, BIN],
  ['md5', 'MD5', STRING, STR, { portable: true }],
  ['randomBytes', 'RANDOM_BYTES', 'length: FnArg', BIN],
  ['sha1', 'SHA1', STRING, STR],
  ['sha2', 'SHA2', 'str: FnArg, hashLength: FnArg', STR],
  ['statementDigest', 'STATEMENT_DIGEST', 'statement: FnArg', STR],
  ['statementDigestText', 'STATEMENT_DIGEST_TEXT', 'statement: FnArg', STR],
  ['uncompress', 'UNCOMPRESS', STRING, BIN],
  ['uncompressedLength', 'UNCOMPRESSED_LENGTH', STRING, NUM],

  // Locking functions.
  ['getLock', 'GET_LOCK', 'name: FnArg, timeout: FnArg', BOOL],
  ['isFreeLock', 'IS_FREE_LOCK', 'name: FnArg', BOOL],
  ['isUsedLock', 'IS_USED_LOCK', 'name: FnArg', NUM],
  ['releaseAllLocks', 'RELEASE_ALL_LOCKS', '', NUM],
  ['releaseLock', 'RELEASE_LOCK', 'name: FnArg', BOOL],

  // Miscellaneous functions.
  ['anyValue', 'ANY_VALUE', X, ANY],
  ['binToUuid', 'BIN_TO_UUID', 'bin: FnArg, swap?: FnArg', STR],
  ['default', 'DEFAULT', 'column: FnArg', ANY],
  ['grouping', 'GROUPING', '...exprs: FnArg[]', NUM],
  ['inet6Aton', 'INET6_ATON', 'address: FnArg', BIN],
  ['inet6Ntoa', 'INET6_NTOA', 'address: FnArg', STR],
  ['inetAton', 'INET_ATON', 'address: FnArg', NUM],
  ['inetNtoa', 'INET_NTOA', 'address: FnArg', STR],
  ['isIpv4', 'IS_IPV4', 'address: FnArg', BOOL],
  ['isIpv4Compat', 'IS_IPV4_COMPAT', 'address: FnArg', BOOL],
  ['isIpv4Mapped', 'IS_IPV4_MAPPED', 'address: FnArg', BOOL],
  ['isIpv6', 'IS_IPV6', 'address: FnArg', BOOL],
  ['isUuid', 'IS_UUID', 'uuid: FnArg', BOOL],
  ['sleep', 'SLEEP', 'seconds: FnArg', NUM],
  ['uuid', 'UUID', '', 'string'],
  ['uuidShort', 'UUID_SHORT', '', 'FnNumeric'],
  ['uuidToBin', 'UUID_TO_BIN', 'uuid: FnArg, swap?: FnArg', BIN],

  // Bit, performance schema, GTID and XML functions.
  ['bitCount', 'BIT_COUNT', X, NUM],
  ['formatBytes', 'FORMAT_BYTES', 'bytes: FnArg', STR],
  ['formatPicoTime', 'FORMAT_PICO_TIME', 'time: FnArg', STR],
  ['psCurrentThreadId', 'PS_CURRENT_THREAD_ID', '', NUM],
  ['psThreadId', 'PS_THREAD_ID', 'connectionId: FnArg', NUM],
  ['gtidSubset', 'GTID_SUBSET', 'set1: FnArg, set2: FnArg', BOOL],
  ['gtidSubtract', 'GTID_SUBTRACT', 'set1: FnArg, set2: FnArg', STR],
  ['sourcePosWait', 'SOURCE_POS_WAIT', 'logName: FnArg, logPos: FnArg, ...options: FnArg[]', NUM],
  ['waitForExecutedGtidSet', 'WAIT_FOR_EXECUTED_GTID_SET', 'gtidSet: FnArg, timeout?: FnArg', NUM],
  ['extractValue', 'EXTRACTVALUE', 'xml: FnArg, xpath: FnArg', STR],
  ['updateXml', 'UPDATEXML', 'xml: FnArg, xpath: FnArg, newXml: FnArg', STR],

  // JSON functions. Objects and arrays passed as JSON documents are cast to JSON.
  ['jsonArray', 'JSON_ARRAY', '...values: FnJsonArg[]', 'unknown[]', { json: 'all' }],
  [
    'jsonArrayAppend',
    'JSON_ARRAY_APPEND',
    'doc: FnJsonArg, path: FnArg, value: FnJsonArg, ...pathsAndValues: FnJsonArg[]',
    ANY,
    { json: 'even' },
  ],
  [
    'jsonArrayInsert',
    'JSON_ARRAY_INSERT',
    'doc: FnJsonArg, path: FnArg, value: FnJsonArg, ...pathsAndValues: FnJsonArg[]',
    ANY,
    { json: 'even' },
  ],
  [
    'jsonContains',
    'JSON_CONTAINS',
    'target: FnJsonArg, candidate: FnJsonArg, path?: FnArg',
    BOOL,
    { json: [0, 1] },
  ],
  [
    'jsonContainsPath',
    'JSON_CONTAINS_PATH',
    "doc: FnJsonArg, oneOrAll: 'one' | 'all', ...paths: FnArg[]",
    BOOL,
    { json: [0] },
  ],
  ['jsonDepth', 'JSON_DEPTH', 'doc: FnJsonArg', NUM, { json: [0] }],
  ['jsonExtract', 'JSON_EXTRACT', 'doc: FnJsonArg, ...paths: FnArg[]', ANY, { json: [0] }],
  [
    'jsonInsert',
    'JSON_INSERT',
    'doc: FnJsonArg, path: FnArg, value: FnJsonArg, ...pathsAndValues: FnJsonArg[]',
    ANY,
    { json: 'even' },
  ],
  ['jsonKeys', 'JSON_KEYS', 'doc: FnJsonArg, path?: FnArg', 'string[] | null', { json: [0] }],
  ['jsonLength', 'JSON_LENGTH', 'doc: FnJsonArg, path?: FnArg', NUM, { json: [0] }],
  ['jsonMergePatch', 'JSON_MERGE_PATCH', '...docs: FnJsonArg[]', ANY, { json: 'all' }],
  ['jsonMergePreserve', 'JSON_MERGE_PRESERVE', '...docs: FnJsonArg[]', ANY, { json: 'all' }],
  [
    'jsonObject',
    'JSON_OBJECT',
    'objectOrKeysAndValues?: { [key: string]: FnJsonArg } | FnJsonArg, ...keysAndValues: FnJsonArg[]',
    'Record<string, unknown>',
    { json: 'odd', build: buildJsonObject },
  ],
  ['jsonOverlaps', 'JSON_OVERLAPS', 'a: FnJsonArg, b: FnJsonArg', BOOL, { json: [0, 1] }],
  ['jsonPretty', 'JSON_PRETTY', 'doc: FnJsonArg', STR, { json: [0] }],
  ['jsonQuote', 'JSON_QUOTE', STRING, STR],
  ['jsonRemove', 'JSON_REMOVE', 'doc: FnJsonArg, ...paths: FnArg[]', ANY, { json: [0] }],
  [
    'jsonReplace',
    'JSON_REPLACE',
    'doc: FnJsonArg, path: FnArg, value: FnJsonArg, ...pathsAndValues: FnJsonArg[]',
    ANY,
    { json: 'even' },
  ],
  [
    'jsonSchemaValid',
    'JSON_SCHEMA_VALID',
    'schema: FnJsonArg, doc: FnJsonArg',
    BOOL,
    { json: [0, 1] },
  ],
  [
    'jsonSchemaValidationReport',
    'JSON_SCHEMA_VALIDATION_REPORT',
    'schema: FnJsonArg, doc: FnJsonArg',
    'Record<string, unknown> | null',
    { json: [0, 1] },
  ],
  [
    'jsonSearch',
    'JSON_SEARCH',
    "doc: FnJsonArg, oneOrAll: 'one' | 'all', search: FnArg, escape?: FnArg, ...paths: FnArg[]",
    'string | string[] | null',
    { json: [0] },
  ],
  [
    'jsonSet',
    'JSON_SET',
    'doc: FnJsonArg, path: FnArg, value: FnJsonArg, ...pathsAndValues: FnJsonArg[]',
    ANY,
    { json: 'even' },
  ],
  ['jsonStorageFree', 'JSON_STORAGE_FREE', 'doc: FnJsonArg', NUM, { json: [0] }],
  ['jsonStorageSize', 'JSON_STORAGE_SIZE', 'doc: FnJsonArg', NUM, { json: [0] }],
  ['jsonType', 'JSON_TYPE', 'value: FnJsonArg', STR, { json: [0] }],
  ['jsonUnquote', 'JSON_UNQUOTE', STRING, STR],
  ['jsonValid', 'JSON_VALID', 'value: FnArg', BOOL],
  [
    'jsonValue',
    'JSON_VALUE',
    'doc: FnJsonArg, path: FnArg, options?: { returning?: string }',
    ANY,
    { json: [0], build: buildJsonValue },
  ],
  [
    'memberOf',
    'MEMBER OF',
    'value: FnJsonArg, array: FnJsonArg',
    BOOL,
    { json: [0, 1], build: buildMemberOf },
  ],
];

// Builders for the functions with keywords in their syntax. They return
// `[sql, args]`. Keywords are checked against lists, since they can't be bindings.

function buildDateAdd(name, sql, [date, amount, unit]) {
  if (unit === undefined && (sql === 'ADDDATE' || sql === 'SUBDATE')) {
    // The `ADDDATE(date, days)` form.
    return [`${sql}(?, ?)`, [date, amount]];
  }

  return [`${sql}(?, INTERVAL ? ${keyword(name, 'unit', unit, INTERVAL_UNITS)})`, [date, amount]];
}

function buildTimestampFunction(name, sql, [unit, a, b]) {
  return [`${sql}(${keyword(name, 'unit', unit, TIMESTAMP_UNITS)}, ?, ?)`, [a, b]];
}

function buildExtract(name, sql, [unit, date]) {
  return [`EXTRACT(${keyword(name, 'unit', unit, INTERVAL_UNITS)} FROM ?)`, [date]];
}

function buildGetFormat(name, sql, [type, locale]) {
  return [`GET_FORMAT(${keyword(name, 'type', type, FORMAT_TYPES)}, ?)`, [locale]];
}

function buildCast(name, sql, [value, type]) {
  if (typeof type !== 'string' || !CAST_TYPE.test(type.trim())) {
    throw new Error(`fn.cast(): invalid type ${JSON.stringify(type)}`);
  }

  return [`CAST(? AS ${type.trim().toUpperCase()})`, [value]];
}

function buildConvert(name, sql, [value, type]) {
  if (type !== null && typeof type === 'object') {
    if (typeof type.using !== 'string' || !CHARSET.test(type.using)) {
      throw new Error(`fn.convert(): invalid character set ${JSON.stringify(type.using)}`);
    }

    return [`CONVERT(? USING ${type.using})`, [value]];
  }

  if (typeof type !== 'string' || !CAST_TYPE.test(type.trim())) {
    throw new Error(`fn.convert(): invalid type ${JSON.stringify(type)}`);
  }

  return [`CONVERT(?, ${type.trim().toUpperCase()})`, [value]];
}

function buildPosition(name, sql, [substr, str]) {
  return ['POSITION(? IN ?)', [substr, str]];
}

function buildTrim(name, sql, [str, options = {}]) {
  if (options.side === undefined && options.remove === undefined) {
    return ['TRIM(?)', [str]];
  }

  const side =
    options.side === undefined ? 'BOTH' : keyword(name, 'side', options.side, TRIM_SIDES);

  if (options.remove === undefined) {
    return [`TRIM(${side} FROM ?)`, [str]];
  } else {
    return [`TRIM(${side} ? FROM ?)`, [options.remove, str]];
  }
}

function buildChar(name, sql, [codes, options = {}]) {
  codes = Array.isArray(codes) ? codes : [codes];
  const placeholders = codes.map(() => '?').join(', ');

  if (options.using === undefined) {
    return [`CHAR(${placeholders})`, codes];
  }

  if (typeof options.using !== 'string' || !CHARSET.test(options.using)) {
    throw new Error(`fn.char(): invalid character set ${JSON.stringify(options.using)}`);
  }

  return [`CHAR(${placeholders} USING ${options.using})`, codes];
}

function buildMatch(name, sql, [columns, search, options = {}]) {
  columns = Array.isArray(columns) ? columns : [columns];
  let mode = '';

  if (options.mode !== undefined) {
    mode = MATCH_MODES[options.mode];

    if (!mode) {
      throw new Error(`fn.match(): invalid mode ${JSON.stringify(options.mode)}`);
    }

    mode = ` ${mode}`;
  }

  return [`MATCH(${columns.map(() => '?').join(', ')}) AGAINST(?${mode})`, [...columns, search]];
}

function buildCountDistinct(name, sql, exprs) {
  return [`COUNT(DISTINCT ${exprs.map(() => '?').join(', ')})`, exprs];
}

function buildGroupConcat(name, sql, [exprs, options = {}]) {
  exprs = Array.isArray(exprs) ? exprs : [exprs];

  let text = `GROUP_CONCAT(${options.distinct ? 'DISTINCT ' : ''}${exprs.map(() => '?').join(', ')}`;
  const args = [...exprs];

  if (options.orderBy !== undefined) {
    const [orderBySql, orderByArgs] = buildOrderBy(name, options.orderBy);
    text += ` ORDER BY ${orderBySql}`;
    args.push(...orderByArgs);
  }

  if (options.separator !== undefined) {
    text += ' SEPARATOR ?';
    args.push(options.separator);
  }

  return [`${text})`, args];
}

// `orderBy` of `groupConcat()` and `over()`: a column, `[column, 'desc']` or a
// list of them. Strings are column names.
function buildOrderBy(name, orderBy) {
  const list = Array.isArray(orderBy) && !isOrderByPair(orderBy) ? orderBy : [orderBy];
  const args = [];

  const sql = list
    .map((it) => {
      if (!Array.isArray(it)) {
        args.push(toColumn(it));
        return '?';
      }

      if (it.length !== 2) {
        throw new Error(
          `${label(name)}: invalid orderBy item. Use a column or [column, 'asc' | 'desc'].`,
        );
      }

      args.push(toColumn(it[0]));
      return `? ${keyword(name, 'direction', it[1], DIRECTIONS)}`;
    })
    .join(', ');

  return [sql, args];
}

function toColumn(column) {
  return typeof column === 'string' ? ref(column) : column;
}

function buildNtile(name, sql, [buckets]) {
  return [`NTILE(${integer(name, 'buckets', buckets, 1)})`, []];
}

function buildLagOrLead(name, sql, [value, offset, defaultValue]) {
  if (offset === undefined && defaultValue === undefined) {
    return [`${sql}(?)`, [value]];
  }

  offset = offset === undefined ? 1 : integer(name, 'offset', offset, 0);

  if (defaultValue === undefined) {
    return [`${sql}(?, ${offset})`, [value]];
  }

  return [`${sql}(?, ${offset}, ?)`, [value, defaultValue]];
}

function buildNthValue(name, sql, [value, n]) {
  return [`NTH_VALUE(?, ${integer(name, 'n', n, 1)})`, [value]];
}

// The integer arguments of window functions are checked and written into the
// sql, since they are part of the syntax rather than values.
function integer(name, what, value, min) {
  if (!Number.isInteger(value) || value < min) {
    throw new Error(
      `fn.${name}(): ${what} must be an integer >= ${min}, got ${JSON.stringify(value)}`,
    );
  }

  return value;
}

// `[column, 'desc']`, as opposed to a list of two columns.
function isOrderByPair(it) {
  return (
    Array.isArray(it) &&
    it.length === 2 &&
    typeof it[1] === 'string' &&
    DIRECTIONS.includes(it[1].trim().toUpperCase())
  );
}

function buildJsonValue(name, sql, [doc, path, options = {}]) {
  if (options.returning === undefined) {
    return ['JSON_VALUE(?, ?)', [doc, path]];
  }

  if (typeof options.returning !== 'string' || !CAST_TYPE.test(options.returning.trim())) {
    throw new Error(`fn.jsonValue(): invalid type ${JSON.stringify(options.returning)}`);
  }

  return [`JSON_VALUE(?, ? RETURNING ${options.returning.trim().toUpperCase()})`, [doc, path]];
}

function buildMemberOf(name, sql, [value, array]) {
  return ['(? MEMBER OF(?))', [value, array]];
}

function buildJsonObject(name, sql, args) {
  // `fn.jsonObject({ a: ref('a'), b: 1 })` is `JSON_OBJECT('a', a, 'b', 1)`.
  if (args.length === 1 && isPlainObjectArg(args[0])) {
    args = Object.entries(args[0]).flat();
  }

  return [`JSON_OBJECT(${args.map(() => '?').join(', ')})`, args];
}

function isPlainObjectArg(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value.constructor === Object || value.constructor === undefined)
  );
}

// `name` is the name of an `fn` helper, or a method like `over()`.
function label(name) {
  return name.endsWith('()') ? name : `fn.${name}()`;
}

function keyword(name, what, value, allowed) {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : null;

  if (!allowed.includes(upper)) {
    throw new Error(
      `${label(name)}: invalid ${what} ${JSON.stringify(value)}. Use one of ${allowed.join(', ')}.`,
    );
  }

  return upper;
}

module.exports = {
  FUNCTIONS,
  buildOrderBy,
  INTERVAL_UNITS,
  TIMESTAMP_UNITS,
};
