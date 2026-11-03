# Paging

Most of the queries can be paged using the [page](/api/query-builder/other-methods.html#page) or [range](/api/query-builder/other-methods.html#range) method.

```js
const result = await Person.query()
  .where('age', '>', 20)
  .page(5, 100);

console.log(result.results.length); // --> 100
console.log(result.total); // --> 3341
```

There are some cases where [page](/api/query-builder/other-methods.html#page) and [range](/api/query-builder/other-methods.html#range) don't work.

1. In [modifyGraph](/api/query-builder/eager-methods.html#modifygraph) or modifiers:

```js
// This doesn't work because the query `qb` fetches the
// `children` for all parents at once. Paging that query
//  will have not fetch 10 results for all parents, but
// instead 10 results in total.
const result = await Person.query()
  .withGraphFetched('children')
  .modifyGraph('children', qb => qb.page(0, 10));
```

2. When `withGraphJoined` is used:

```js
// This doesn't work because of the way SQL joins work.
// Databases return the nested relations as a flattened
// list of records. Paging the query will page the
// flattened results which has alot more rows than
// the root query.
const result = await Person.query()
  .withGraphJoined('children')
  .page(0, 10);
```

3. On delete queries:

```js
// postgres and SQLite: knex rejects a limit on a delete with
// "Aborted query compilation: `limit` has no effect on a `delete` statement".
// MySQL supports a limit on deletes, but not an offset. This deletes
// the first 10 rows: delete from `persons` limit 10
await Person.query().delete().page(2, 10);
```
