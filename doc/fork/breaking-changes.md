# Breaking changes

These changes alter how existing objection 3.1.5 code behaves at runtime. Most of them fix queries that read or changed the wrong rows. For the TypeScript changes, see [TypeScript](./typescript.md).

## Security: JSON field expression keys are escaped

Before, the keys of JSON field expressions (`'column:key'`) went into the SQL without escaping. A key containing `'` allowed SQL injection, and a key containing `?` was read as a binding placeholder ([#2077](https://github.com/Vincit/objection.js/issues/2077)):

```js
// Before: deleted every row.
await Person.query().delete().where(ref("data:x') or 1=1 --"), 'y');

// Before: exploitable when req.body has a `data:key` property.
await Person.query().patch(req.body).findById(id);
```

This affected `ref('col:key')`, `patch({ 'col:key': value })`, `update()`, `onConflict().merge()` and the `whereJson*` methods. Keys are now escaped, and the `whereJsonHas*` and `whereJsonNotObject` helpers send their values as bindings. The SQL for plain keys hasn't changed. Keys containing `,`, `{`, `}`, `"`, whitespace or `NULL` now refer to the actual key instead of being split.

The fork also requires ajv 8.20, which fixes the advisories of ajv and fast-uri.

## `orWhere` no longer escapes the conditions objection adds

Objection adds where clauses of its own: relation owner conditions, relation `filter`/`modify`, id conditions. Before, these were flattened into the same list as your own clauses. Since `and` binds tighter than `or`, an `orWhere` could match the rows of other owners ([#2191](https://github.com/Vincit/objection.js/issues/2191), [#1909](https://github.com/Vincit/objection.js/issues/1909)):

```js
await person.$relatedQuery('pets').where('a', 1).orWhere('b', 2).delete();
```

```sql
-- Before: deletes every row where b = 2, whoever owns it.
delete from "pets" where "pets"."ownerId" in (1) and "a" = 1 or "b" = 2

-- Now
delete from "pets" where "pets"."ownerId" in (1) and ("a" = 1 or "b" = 2)
```

Clauses from each source are now wrapped in parentheses whenever a query mixes them. This covers `$relatedQuery()`, the relation `filter`/`modify`, `joinTableModify`, `relate()`, `unrelate()`, `$query()`, `deleteById()`, `patchAndFetchById()`, `updateAndFetchById()` and subqueries of the static `relatedQuery()`. Queries without objection-generated clauses produce the same SQL as before. A `findById()` you call yourself isn't grouped, so `findById(1).orWhere(...)` still means "id = 1 or ...".

## `for()` is checked

Before, `for()` was ignored on queries that weren't made with the static `relatedQuery()`, and it was silently dropped after write methods ([#2185](https://github.com/Vincit/objection.js/issues/2185)):

```js
// OK
await Person.relatedQuery('pets').for(1).delete();

// Before: deleted every row in the table. Now rejected.
await Person.query().for(1).delete();

// Before: deleted nothing (delete) or inserted rows with null foreign keys (insert). Now rejected.
await Person.relatedQuery('pets').delete().for(1);
await Person.relatedQuery('pets').insert({ name: 'Doggo' }).for(1);
```

The query is rejected before any hooks run, and `toKnexQuery()` throws, so no SQL is generated. The errors are:

- `for() can only be used with queries created using the static relatedQuery() method`
- `for() must be called before the write methods (insert, update, patch, delete, relate, unrelate, increment, decrement)`

## JSON features throw on unsupported databases

JSON field expressions and the `whereJson*` methods only work on postgres and [MySQL](./mysql.md#json-field-expressions). On other databases they now throw. Before, they generated invalid SQL. On MySQL, the generated `#>` started a comment, which silently dropped the rest of the `where` clause.

## Patching a field of a `NULL` JSON column creates the object

```js
await Notification.query()
  .patch({ 'payload:courseName': 'Physics' })
  .findById(id);
```

If `payload` is `NULL`, it becomes `{ "courseName": "Physics" }`, or an array if the path starts with an index. Before, the column stayed `NULL` on postgres.

## Node.js 24 or newer is required

The fork supports the Node.js versions that are still maintained: 24 and 26, the two current LTS lines. Node.js 20 reached its end of life in April 2026 and 22 is close to it.

## MySQL 8.0.17 or newer is required

objection.js 3.1.5 didn't say which MySQL versions it supported. The fork is tested on MySQL 8.4, and its MySQL features (the JSON field expressions, the `whereJson*` methods, `fn.jsonValue()` and the JSON patches) need 8.0.17 or newer. MySQL 5.7 reached its end of life in October 2023 and isn't supported.

## knex 3.3 or newer is required

Older versions of knex compile some queries differently, so the queries objection builds depended on the knex version:

- `delete().limit(n)` on MySQL ignores the limit on knex 3.1 and deletes every matching row. knex 3.3 adds the limit, which only MySQL supports for deletes.
- `updateFrom()` with a raw query gets its bindings in the wrong order before knex 3.3.
- knex 3.2 and newer reject a limit on deletes on the databases that don't support it. That includes `page()` and `range()` on a delete query on postgres and SQLite, which used to ignore the limit.

## Graph operations run one query at a time on MySQL

The default [`concurrency`](../api/model/static-properties.md#static-concurrency) of graph writes (`insertGraph()`, `upsertGraph()`, ...) on MySQL is now 1, as it already was on mssql. Without a transaction, concurrent `upsertGraph()` updates deadlocked: MySQL wraps those updates in subqueries that lock the rows of the join tables they read. Queries that only read, like those of `withGraphFetched()` and `fetchGraph()`, still run 4 at a time. To run graph writes in parallel again, set `concurrency` on the model, which then applies to all queries:

```js
class BaseModel extends Model {
  static concurrency = 4;
}
```

## Bug fixes

- `andWhereJsonNotSupersetOf()` no longer recurses forever.
- `whereIn()`, `whereNotIn()` and `onIn()` with a raw column that has bindings, like `whereIn(fn.lower(ref('name')), names)`, got the wrong bindings: knex compiled the values before the column. See [Joins and model classes](./joins.md#raw-columns-in-wherein).
- Subqueries in join callbacks threw `parentQuery.isUpdate is not a function` on MySQL. See [Joins and model classes](./joins.md#subqueries-in-join-callbacks).
