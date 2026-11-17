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
// Throws: offset() can't be used with a delete query.
// Deletes have no offset, so the query would delete the wrong rows.
await Person.query().delete().page(2, 10);

// MySQL: page 0 has no offset, so this works like limit(10).
// postgres and SQLite: knex rejects a limit on a delete with
// "Aborted query compilation: `limit` has no effect on a `delete` statement".
await Person.query().delete().page(0, 10);
```

## Cursor pagination

[cursorPage](/api/query-builder/other-methods.html#cursorpage) pages by the values of the sort columns instead of an offset. It runs one query and no count, and a page far into the result is as fast as the first one. Use it for infinite scrolling, APIs and exports, where the user goes to the next page rather than to page 2500:

```js
router.get('/persons', async (req, res) => {
  const page = await Person.query()
    .where('age', '>', 20)
    .orderBy('lastName')
    .cursorPage(50, req.query.after);

  res.send({ persons: page.results, next: page.next });
});
```

The client passes `next` back as `after` until it is `null`. An invalid `after` throws a `ValidationError` with status code 400, so it becomes a 400 response like any other invalid input.

Rows that are inserted or deleted between two requests don't shift the pages, as they do with an offset: no row is shown twice or skipped because another row was added before it.

`cursorPage()` has no total and can't jump to a page. Use `page()` when you need either, or count the rows once with [resultSize](/api/query-builder/other-methods.html#resultsize).

