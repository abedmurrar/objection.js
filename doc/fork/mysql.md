# MySQL

Objection 3.1.5 treated a lot of features as postgres-only. On MySQL 8.0.17 or newer (tested on 8.4 with `mysql2`), the fork supports them too.

## JSON field expressions

[Field expressions](../api/types/#type-fieldexpression) (`'column:path'`) now work on MySQL `json` columns: in selects, wheres, joins and orderBys, and as keys in `patch()`, `update()` and `onConflict().merge()`. The path is always sent as a binding.

```js
await Notification.query()
  .select(ref('payload:course.name').castText().as('courseName'))
  .where(ref('payload:courseId').castInt(), 5);

await Notification.query()
  .patch({ 'payload:courseName': 'Physics' })
  .where(ref('payload:courseId').castInt(), 5);
```

| Expression          | postgres                                | MySQL                                              |
| ------------------- | --------------------------------------- | -------------------------------------------------- |
| `ref('payload:a')`  | `"payload"#>'{a}'`                      | `JSON_EXTRACT(payload, '$."a"')`                   |
| `.castText()`       | `CAST("payload"#>>'{a}' AS text)`       | `JSON_UNQUOTE(JSON_EXTRACT(payload, '$."a"'))`     |
| `.castInt()`        | `CAST("payload"#>>'{a}' AS integer)`    | `CAST(JSON_UNQUOTE(JSON_EXTRACT(…)) AS SIGNED)`    |
| `.castBool()`       | `CAST("payload"#>>'{a}' AS boolean)`    | `(JSON_UNQUOTE(JSON_EXTRACT(…)) IN ('true', '1'))` |
| patch `'payload:a'` | `jsonb_set(COALESCE(payload, '{}'), …)` | `JSON_SET(COALESCE(payload, JSON_OBJECT()), …)`    |

`castText()` of a JSON field only unquotes the value, so it keeps the same case-sensitive collation as MySQL's `->>` operator.

## Casts use MySQL types

The casts of `ref()` and `val()` now use types MySQL accepts. For example, `CAST(x AS integer)` is a syntax error on MySQL.

| Cast                        | MySQL type       |
| --------------------------- | ---------------- |
| `castInt()`, `castBigInt()` | `SIGNED`         |
| `castText()`                | `CHAR`           |
| `castDecimal()`             | `DECIMAL(65,30)` |
| `castReal()`                | `DOUBLE`         |
| `castJson()`                | `JSON`           |

## `val()` of objects and arrays

On MySQL, `val()` of an object or an array is cast to `JSON`. Without the cast, MySQL compares a JSON column with a string as two strings.

```js
await Person.query().where('tags', val(['a', 'b']));
```

## The `whereJson*` methods

`whereJsonSupersetOf()`, `whereJsonSubsetOf()`, `whereJsonIsArray()`, `whereJsonIsObject()`, `whereJsonHasAny()`, `whereJsonHasAll()` and their `or`/`not` variants work on MySQL. They compile to `JSON_CONTAINS()`, `JSON_TYPE()`, `JSON_CONTAINS_PATH()` and `JSON_OVERLAPS()`, and they find the same rows as on postgres.

- At the top level, an object only contains an object, as on postgres: `whereJsonSupersetOf('arrayColumn', { a: 1 })` doesn't find `[{ "a": 1 }]`. To enforce this, MySQL gets an extra `JSON_TYPE()` check. Below the top level, MySQL's own rules apply, which also find objects inside arrays.
- `whereJsonHasAny()` and `whereJsonHasAll()` match object keys, the string items of an array, or a string. To match array items of other types, use `whereJsonSupersetOf('numbers', [1, 2])`.

## `whereJsonOverlaps()` and `whereJsonNotOverlaps()`

These are new and MySQL-only. They use `JSON_OVERLAPS()`, which can use multi-valued indexes. Two values overlap when two arrays share an item, two objects share a key and value, or an array contains a scalar.

```js
const jobs = await Job.query().whereJsonOverlaps('attributes:countryCodes', [
  'FI',
  'SE',
]);

// A NULL or missing field doesn't overlap anything, so rows without the field are found.
const unrestricted = await Job.query().whereJsonNotOverlaps(
  'attributes:countryCodes',
  ['FI', 'SE'],
);
```

`orWhereJsonOverlaps()` and `orWhereJsonNotOverlaps()` are also available. The second argument can be a value or another field expression.

## Batch inserts

`insert([...])`, `insertAndFetch([...])` and inserts through relations now accept arrays on MySQL and SQLite. Before, they threw `batch insert only works with Postgresql and SQL Server`.

```js
const people = await Person.query().insert([
  { firstName: 'Arnold', lastName: 'Schwarzenegger' },
  { firstName: 'Sylvester', lastName: 'Stallone' },
]);

people.map((it) => it.id); // the ids of both rows
```

- **SQLite** gets the ids with `returning()`, which needs SQLite 3.35 or newer.
- **MySQL** only returns the id of the first row. InnoDB gives the rows of one multi-row insert consecutive ids, `@@auto_increment_increment` apart, so objection computes the rest. It reads `@@auto_increment_increment` once per knex config.
- On MySQL, set the id on all rows or on none. A batch where only some rows have an id is rejected before anything is inserted: `batch insert on MySQL can't return ids when only some rows have an id. Set the id on all rows or none.`
- On MySQL, ids aren't set with `onConflict()`, because rows can be skipped or updated.

## Graph operations run one query at a time

On MySQL the default [`concurrency`](../api/model/static-properties.md#static-concurrency) of graph writes is 1, and eager loading still runs 4 queries at a time. See [Breaking changes](./breaking-changes.md#graph-operations-run-one-query-at-a-time-on-mysql).

## `fn` helpers for MySQL functions

`fn` has a helper for every MySQL 8.4 built-in function (about 230 of them), with camel-case names. For example, `fn.dateFormat()` calls `DATE_FORMAT()` and `fn.jsonArrayAgg()` calls `JSON_ARRAYAGG()`. Arguments are bindings, so strings are values. Pass columns with `ref()` or `Model.ref()`.

```js
const { fn, ref } = require('objection');

await Event.query()
  .select(
    fn.dateFormat(Event.ref('startsAt'), '%Y-%m').as('month'),
    fn
      .groupConcat(Event.ref('name'), {
        orderBy: [Event.ref('name'), 'desc'],
        separator: ', ',
      })
      .as('names'),
    fn.jsonArrayAgg(Event.ref('id')).as('ids'),
  )
  .where(fn.timestampDiff('day', Event.ref('createdAt'), fn.now()), '<', 30)
  .whereNot(fn.jsonOverlaps(Event.ref('tags'), ['hidden', 'draft']), 1)
  .groupBy('month');
```

| Category                | Examples                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| String                  | `concatWs`, `findInSet`, `lpad`, `regexpLike`, `substringIndex`, `toBase64`, `trim`, `position`                |
| Numeric                 | `abs`, `ceil`, `floor`, `mod`, `pow`, `rand`, `round`, `truncate`                                              |
| Date and time           | `curDate`, `dateAdd`, `dateDiff`, `dateFormat`, `extract`, `lastDay`, `timestampDiff`, `unixTimestamp`         |
| Aggregate               | `countDistinct`, `groupConcat`, `jsonArrayAgg`, `jsonObjectAgg`, `std`, `variance`, `bitOr`                    |
| Window                  | `rowNumber`, `rank`, `denseRank`, `lag`, `lead`, ... (see [Expressions](./expressions.md#window-functions))    |
| Comparison and flow     | `greatest`, `least`, `if`, `ifNull`, `nullIf`, `isNull`, `interval`                                            |
| Cast                    | `cast`, `convert`                                                                                              |
| JSON                    | `jsonArray`, `jsonObject`, `jsonContains`, `jsonExtract`, `jsonSet`, `jsonMergePatch`, `jsonValue`, `memberOf` |
| Information             | `database`, `lastInsertId`, `rowCount`, `version`, `currentUser`                                               |
| Encryption, compression | `aesEncrypt`, `aesDecrypt`, `md5`, `sha2`, `randomBytes`, `compress`                                           |
| Locking                 | `getLock`, `releaseLock`, `isFreeLock`, `releaseAllLocks`                                                      |
| Miscellaneous           | `uuid`, `uuidToBin`, `binToUuid`, `inet6Aton`, `anyValue`, `sleep`                                             |

The full list is in [`lib/queryBuilder/functions/mysql.js`](https://github.com/abedmurrar/objection.js/blob/main/lib/queryBuilder/functions/mysql.js). Not included: spatial functions, `JSON_TABLE()`, and deprecated functions. For those, use `fn('NAME', ...args)`.

### JSON arguments

Objects and arrays passed as JSON documents are cast to JSON:

```js
fn.jsonObject({ id: ref('id'), name: ref('name') }); // JSON_OBJECT('id', `id`, 'name', `name`)
fn.jsonContains(ref('tags'), ['a']); // JSON_CONTAINS(`tags`, CAST('["a"]' AS JSON))
fn.memberOf('a', ref('tags')); // ('a' MEMBER OF(`tags`))
```

### Keyword arguments

Some functions have keywords in their syntax. Their helpers take the keyword as an argument. Keywords can't be bindings, so each one is checked against the list MySQL accepts. Anything else throws, for example `fn.dateAdd(): invalid unit "days"`.

| Call                                                                                                                 | SQL                                                             |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `fn.dateAdd(ref('d'), 7, 'day')`                                                                                     | `DATE_ADD(d, INTERVAL 7 DAY)`                                   |
| `fn.subDate(ref('d'), 3, 'MONTH')`                                                                                   | `SUBDATE(d, INTERVAL 3 MONTH)`                                  |
| `fn.timestampDiff('day', ref('a'), fn.now())`                                                                        | `TIMESTAMPDIFF(DAY, a, CURRENT_TIMESTAMP(6))`                   |
| `fn.timestampAdd('week', 2, ref('a'))`                                                                               | `TIMESTAMPADD(WEEK, 2, a)`                                      |
| `fn.extract('year_month', ref('d'))`                                                                                 | `EXTRACT(YEAR_MONTH FROM d)`                                    |
| `fn.getFormat('date', 'EUR')`                                                                                        | `GET_FORMAT(DATE, 'EUR')`                                       |
| `fn.cast(ref('x'), 'decimal(10, 2)')`                                                                                | `CAST(x AS DECIMAL(10, 2))`                                     |
| `fn.convert(ref('x'), { using: 'utf8mb4' })`                                                                         | `CONVERT(x USING utf8mb4)`                                      |
| `fn.trim(ref('s'), { side: 'leading' })`                                                                             | `TRIM(LEADING FROM s)`                                          |
| `fn.trim(ref('s'), { remove: 'x' })`                                                                                 | `TRIM(BOTH 'x' FROM s)`                                         |
| `fn.position('a', ref('s'))`                                                                                         | `POSITION('a' IN s)`                                            |
| `fn.char(77, { using: 'utf8mb4' })`                                                                                  | `CHAR(77 USING utf8mb4)`                                        |
| `fn.match([ref('title'), ref('body')], '+x -y', { mode: 'boolean' })`                                                | `MATCH(title, body) AGAINST('+x -y' IN BOOLEAN MODE)`           |
| `fn.groupConcat([ref('a'), ref('b')], { distinct: true, orderBy: [[ref('a'), 'desc'], ref('b')], separator: '; ' })` | `GROUP_CONCAT(DISTINCT a, b ORDER BY a DESC, b SEPARATOR '; ')` |
| `fn.countDistinct(ref('a'), ref('b'))`                                                                               | `COUNT(DISTINCT a, b)`                                          |
| `fn.jsonValue(ref('p'), '$.a', { returning: 'decimal(4,2)' })`                                                       | `JSON_VALUE(p, '$.a' RETURNING DECIMAL(4,2))`                   |

### Portability

Helpers for functions that only exist on MySQL throw when used with another database. Standard functions like `fn.round()`, `fn.length()` and `fn.trim()` work everywhere.

In TypeScript, the helpers check the number of arguments and type the result as `FunctionBuilder<T>`. `select(fn.x().as('alias'))` uses that type. See [TypeScript](./typescript.md#typed-fn-and-ref).
