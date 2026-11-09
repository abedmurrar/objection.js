# MySQL

Objection 3.1.5 treated a lot of features as postgres-only. On MySQL 8.0.17 or newer (tested on 8.4 with `mysql2`), the fork supports them too. MySQL 5.7 and older, which reached their end of life, aren't supported.

## JSON field expressions

[Field expressions](../api/types/#type-fieldexpression) (`'column:path'`) now work on MySQL `json` columns: in selects, wheres, joins and orderBys, and as keys in `patch()`, `update()` and `onConflict().merge()`. The path is always sent as a binding.

```js
// `payload` is a json column like { "courseId": 5, "course": { "name": "..." } }.
await Notification.query()
  // castText() returns the string without its JSON quotes.
  .select(ref('payload:course.name').castText().as('courseName'))
  // castInt() makes the comparison numeric.
  .where(ref('payload:courseId').castInt(), 5);

// Only changes the courseName key. The rest of the payload is kept.
await Notification.query()
  .patch({ 'payload:courseName': 'Physics' })
  .where(ref('payload:courseId').castInt(), 5);
```

```sql
select JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$."course"."name"')) as `courseName`
from `notifications`
where CAST(JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$."courseId"')) AS SIGNED) = 5

update `notifications`
set `payload` = JSON_SET(COALESCE(`payload`, JSON_OBJECT()), '$."courseName"', CAST('"Physics"' AS JSON))
where CAST(JSON_UNQUOTE(JSON_EXTRACT(`payload`, '$."courseId"')) AS SIGNED) = 5
```

The paths, like `'$."courseId"'`, are sent as bindings. They are shown inline here.

A product search on a `json` column `attributes`, which holds objects like `{ "color": "red", "inStock": true, "tags": ["outdoor"], "dimensions": { "weightKg": 2.5 } }`:

```js
const products = await Product.query()
  .select(
    'id',
    'name',
    ref('attributes:color').castText().as('color'),
    ref('attributes:dimensions.weightKg').castDecimal().as('weightKg'),
  )
  .where(ref('attributes:color').castText(), 'red')
  // JSON true and the string 'true' both count as true.
  .where(ref('attributes:inStock').castBool(), true)
  // The tags array contains 'outdoor'.
  .whereJsonSupersetOf('attributes:tags', ['outdoor'])
  // The object has a discount or a clearance key.
  .whereJsonHasAny('attributes', ['discount', 'clearance'])
  // Sort as numbers, not as JSON text.
  .orderBy(ref('attributes:dimensions.weightKg').castDecimal(), 'desc');
```

```sql
select `id`, `name`,
  JSON_UNQUOTE(JSON_EXTRACT(`attributes`, '$."color"')) as `color`,
  CAST(JSON_UNQUOTE(JSON_EXTRACT(`attributes`, '$."dimensions"."weightKg"')) AS DECIMAL(65,30)) as `weightKg`
from `products`
where JSON_UNQUOTE(JSON_EXTRACT(`attributes`, '$."color"')) = 'red'
  and (JSON_UNQUOTE(JSON_EXTRACT(`attributes`, '$."inStock"')) IN ('true', '1')) = true
  and JSON_CONTAINS(JSON_EXTRACT(`attributes`, '$."tags"'), CAST('["outdoor"]' AS JSON))
  and (CASE JSON_TYPE(`attributes`)
    WHEN 'OBJECT' THEN JSON_CONTAINS_PATH(`attributes`, 'one', '$."discount"', '$."clearance"')
    WHEN 'ARRAY' THEN JSON_OVERLAPS(`attributes`, CAST('["discount","clearance"]' AS JSON))
    WHEN 'STRING' THEN (JSON_UNQUOTE(`attributes`) = 'discount' OR JSON_UNQUOTE(`attributes`) = 'clearance')
    ELSE FALSE END)
order by CAST(JSON_UNQUOTE(JSON_EXTRACT(`attributes`, '$."dimensions"."weightKg"')) AS DECIMAL(65,30)) desc
```

One patch can set several fields. Each one becomes a `JSON_SET()` around the previous one, so they are all written in one `UPDATE`:

```js
await Product.query()
  .patch({
    'attributes:inStock': false,
    'attributes:dimensions.weightKg': 2.5,
  })
  .findById(7);
```

```sql
update `products`
set `attributes` = JSON_SET(
  JSON_SET(COALESCE(`attributes`, JSON_OBJECT()), '$."inStock"', CAST('false' AS JSON)),
  '$."dimensions"."weightKg"', CAST('2.5' AS JSON))
where `products`.`id` = 7
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
// Rows whose tags are exactly ["a", "b"].
await Person.query().where('tags', val(['a', 'b']));
// select `persons`.* from `persons` where `tags` = CAST('["a","b"]' AS JSON)
```

## The `whereJson*` methods

`whereJsonSupersetOf()`, `whereJsonSubsetOf()`, `whereJsonIsArray()`, `whereJsonIsObject()`, `whereJsonHasAny()`, `whereJsonHasAll()` and their `or`/`not` variants work on MySQL. They compile to `JSON_CONTAINS()`, `JSON_TYPE()`, `JSON_CONTAINS_PATH()` and `JSON_OVERLAPS()`, and they find the same rows as on postgres.

- At the top level, an object only contains an object, as on postgres: `whereJsonSupersetOf('arrayColumn', { a: 1 })` doesn't find `[{ "a": 1 }]`. To enforce this, MySQL gets an extra `JSON_TYPE()` check. Below the top level, MySQL's own rules apply, which also find objects inside arrays.
- `whereJsonHasAny()` and `whereJsonHasAll()` match object keys, the string items of an array, or a string. To match array items of other types, use `whereJsonSupersetOf('numbers', [1, 2])`.

## `whereJsonOverlaps()` and `whereJsonNotOverlaps()`

These are new and MySQL-only. They use `JSON_OVERLAPS()`, which can use multi-valued indexes. Two values overlap when two arrays share an item, two objects share a key and value, or an array contains a scalar.

```js
// Jobs open to Finland or Sweden (or both).
const jobs = await Job.query().whereJsonOverlaps('attributes:countryCodes', [
  'FI',
  'SE',
]);
// select `jobs`.* from `jobs`
// where JSON_OVERLAPS(JSON_EXTRACT(`attributes`, '$."countryCodes"'), CAST('["FI","SE"]' AS JSON))

// A NULL or missing field doesn't overlap anything, so rows without the field are found.
const unrestricted = await Job.query().whereJsonNotOverlaps(
  'attributes:countryCodes',
  ['FI', 'SE'],
);
// select `jobs`.* from `jobs`
// where NOT COALESCE(JSON_OVERLAPS(JSON_EXTRACT(`attributes`, '$."countryCodes"'), CAST('["FI","SE"]' AS JSON)), FALSE)
```

On postgres, they throw `whereJsonOverlaps is only supported on mysql.`

`orWhereJsonOverlaps()` and `orWhereJsonNotOverlaps()` are also available. The second argument can be a value or another field expression.

## Batch inserts

`insert([...])`, `insertAndFetch([...])` and inserts through relations now accept arrays on MySQL and SQLite. Before, they threw `batch insert only works with Postgresql and SQL Server`.

```js
// One INSERT with two rows. The result is an array of Person models.
const people = await Person.query().insert([
  { firstName: 'Arnold', lastName: 'Schwarzenegger' },
  { firstName: 'Sylvester', lastName: 'Stallone' },
]);

people.map((it) => it.id); // the ids of both rows, like [1, 2]
```

- **SQLite** gets the ids with `returning()`, which needs SQLite 3.35 or newer.
- **MySQL** only returns the id of the first row. InnoDB gives the rows of one multi-row insert consecutive ids, `@@auto_increment_increment` apart, so objection computes the rest. It reads `@@auto_increment_increment` once per knex config.
- On MySQL, set the id on all rows or on none. A batch where only some rows have an id is rejected before anything is inserted: `batch insert on MySQL can't return ids when only some rows have an id. Set the id on all rows or none.`
- On MySQL, ids aren't set with `onConflict()`, because rows can be skipped or updated.
- Since 4.1.2, `insertGraph()` and `upsertGraph()` use batch inserts too: they insert the new rows of a table together, up to 100 at a time. Rows with an id and rows without one go in separate inserts.

## Many-to-many writes

`unrelate()` and patches with join table extras only modify the join rows that match the filters (since 4.1.4). The join rows are filtered by a subquery for each join row, which MySQL and MariaDB run in the same single statement as postgres:

```js
await course.$relatedQuery('students').unrelate().where('enrollments.status', 'dropped');
```

```sql
delete from `enrollments` where `enrollments`.`courseId` in (7) and exists (
  select 1 from `students` where `students`.`id` = `enrollments`.`studentId`
  and `enrollments`.`status` = 'dropped')
```

MySQL doesn't allow a statement to read the table it modifies in a subquery, so two cases take a second query that fetches the ids of the matching join rows first:

- Filters that may read the join table themselves: joins, `joinRelated()`, subqueries and raw SQL.
- A trigger on the join table that changes a table the subquery reads, which MySQL rejects with error 1442. The statement runs again with the ids, and the join table is remembered, so the next statements fetch the ids first. A failed statement doesn't roll back a MySQL transaction.

The ids can't tell apart join rows that differ only in their other columns, so in these two cases such duplicates are modified together.

## Upserts

`insert(...).onConflict(columns).merge()` compiles to `ON DUPLICATE KEY UPDATE` on MySQL. MySQL decides on its own which unique index conflicts, so the columns passed to `onConflict()` don't appear in the SQL. They are still needed for postgres and SQLite.

```js
// Insert the product, or add to its stock if a product with the sku exists.
await Product.query()
  .insert({ sku: 'A-1', name: 'Tent', stock: 5 })
  .onConflict('sku')
  .merge({ stock: Product.ref('stock').plus(fn.excluded('stock')) });
```

```sql
insert into `products` (`name`, `sku`, `stock`) values ('Tent', 'A-1', 5)
on duplicate key update `stock` = (`products`.`stock` + VALUES(`stock`))
```

`fn.excluded('stock')` is `VALUES(stock)` here. See [`fn.excluded()`](./expressions.md#fn-excluded) and [Upserts](./knex.md#upserts).

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

```sql
select DATE_FORMAT(`events`.`startsAt`, '%Y-%m') as `month`,
  GROUP_CONCAT(`events`.`name` ORDER BY `events`.`name` DESC SEPARATOR ', ') as `names`,
  JSON_ARRAYAGG(`events`.`id`) as `ids`
from `events`
where TIMESTAMPDIFF(DAY, `events`.`createdAt`, CURRENT_TIMESTAMP(6)) < 30
  and not JSON_OVERLAPS(`events`.`tags`, CAST('["hidden","draft"]' AS JSON)) = 1
group by `month`
```

This lists the events of the last 30 days per month, without the hidden and draft ones. The format string `'%Y-%m'` and the separator are bindings, and the unit `DAY` is a checked keyword.

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

In TypeScript, the helpers check the number of arguments and type the result as `FunctionBuilder<T>`. The expression methods use that type to check values: `fn.timestampDiff('day', a, b).gt('30')` is an error. See [TypeScript](./typescript.md#typed-fn-and-ref).

## mysql2's own connection pool

Since knex 3.3.0, knex can run its queries on a pool that you create with mysql2, instead of its own pool, through the `connectionPool` option. kysely uses mysql2's pool this way. We measured it with objection, and **don't recommend it yet**: it saves little time, and it breaks `withGraphJoined()`.

```js
const mysql2 = require('mysql2');

const pool = mysql2.createPool({ host, user, password, database, connectionLimit: 10 });
const knex = require('knex')({ client: 'mysql2', version: '8.4', connectionPool: pool });

// knex.destroy() doesn't end the pool.
await knex.destroy();
await pool.end();
```

What we measured with `bench/orms` (the `fork-native-pool` contender, 4 connections, MySQL 8.4 in Docker, 3 runs):

- Finds of one row by id were 2% to 17% faster.
- Finds of 100 rows were 3% to 5% faster.
- Everything else, from finds of 1000 rows to eager loading, writes and transactions, changed by less than the runs differed from each other.

What breaks or changes, checked with knex 3.3.0 and mysql2 3.24:

- **`withGraphJoined()` throws.** knex reads the database name from `connection`, which you can't pass with `connectionPool`. Without it, knex's `columnInfo()` returns no columns, and `withGraphJoined()` can't select the columns of the joined tables: `the id column(s) [id] of model Pet are missing from the result`.
- **`.timeout(ms, { cancel: true })` doesn't cancel.** It fails with `cancelling of query failed`, and the query keeps running on the server. Timeouts without `cancel` still reject.
- **Acquire timeouts are ignored.** knex's `acquireConnectionTimeout` and `pool` options don't apply. When all connections are busy, a query waits until one is free. Set mysql2's `queueLimit` and `connectTimeout` instead.
- **`knex.destroy()` doesn't end the pool.** End it yourself with `pool.end()`.
- **`connection` and `connectionPool` can't be used together.** knex throws: `'connectionPool' and 'connection' are mutually exclusive`.
- **knex 3.3.0 or newer is required.**

## MariaDB

The MySQL features work on MariaDB too. They are tested on MariaDB 10.6 and 11.4.

### Connecting

objection recognizes MariaDB in two ways:

- knex's `mariadb` client, which needs knex 3.3 and the `mariadb` driver. This is the recommended way.
- With the `mysql2` driver, a `version` that contains `MariaDB` in the knex config. Without it, objection treats the server as MySQL and generates SQL that MariaDB rejects in places.

```js
const knex = Knex({
  client: 'mariadb',
  // Optional with the mariadb client. objection uses it for the features
  // that need a newer MariaDB. knex needs all three parts of the version:
  // '11.4-MariaDB' makes it warn and assume the latest version.
  version: '11.4.0-MariaDB',
  connection: {
    host: '127.0.0.1',
    user: 'app',
    database: 'app',
    // The mariadb driver returns BIGINT values and insert ids as BigInt by
    // default, which JSON.stringify() can't handle.
    insertIdAsNumber: true,
    bigIntAsNumber: true,
    // Queries like `select t.*, t.a + 1 as a` return two columns with the same
    // name, which the driver rejects by default.
    checkDuplicate: false,
  },
});
```

### What is different

MariaDB has no JSON data type: its JSON columns are text. objection generates different SQL for it:

- `CAST(... AS JSON)` is `JSON_COMPACT(...)`, in `val()` of objects and arrays, `castJson()`, patches of JSON fields, the `whereJson*` methods and the arguments of the `fn` JSON helpers.
- Field expressions compared with values, like `where(ref('data:a'), val({ b: 1 }))`, are wrapped in `JSON_COMPACT()`, since MariaDB's `JSON_EXTRACT()` returns the JSON with spaces.
- `whereJsonHasAny()` checks arrays with `JSON_CONTAINS()`, so it also works before 10.9.

Comparisons of JSON objects compare the text. Objects with the same keys in a different order aren't equal on MariaDB, unlike on MySQL.

### What doesn't work

These throw an error that says so, instead of sending SQL that MariaDB rejects:

- `fn.regexpLike()`, `fn.memberOf()`, `fn.anyValue()`, `fn.grouping()`, `fn.uuidToBin()`, `fn.binToUuid()`, `fn.isUuid()`, `fn.icuVersion()`, `fn.rolesGraphml()`, `fn.statementDigest()`, `fn.statementDigestText()`, `fn.formatBytes()`, `fn.psCurrentThreadId()`, `fn.psThreadId()`, `fn.gtidSubset()`, `fn.gtidSubtract()`, `fn.waitForExecutedGtidSet()`, `fn.sourcePosWait()`, `fn.jsonSchemaValidationReport()`, `fn.jsonStorageFree()` and `fn.jsonStorageSize()`, which MariaDB doesn't have.
- More than 2 arguments to `fn.regexpInstr()` and `fn.regexpSubstr()`, and more than 3 to `fn.regexpReplace()`.
- The `returning` option of `fn.jsonValue()`.
- `whereJsonOverlaps()` and `whereJsonNotOverlaps()` when the `version` in the knex config is older than 10.9, which added `JSON_OVERLAPS()`.

`fn.jsonOverlaps()`, `fn.jsonSchemaValid()`, `fn.randomBytes()`, `fn.formatPicoTime()` and the extra arguments of `fn.aesEncrypt()` and `fn.aesDecrypt()` work on MariaDB 11.4, but not on 10.6. Ranking window functions like `fn.rank()` need an `orderBy` in `over()` on MariaDB.
