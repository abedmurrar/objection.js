# Streaming

[stream()](/api/query-builder/other-methods.html#stream) runs a query and yields the found models one at a time, as the database sends the rows. Use it for results too large to hold in memory at once, like an export:

```js
const out = fs.createWriteStream('people.csv');

for await (const person of Person.query().where('active', true).orderBy('id').stream()) {
  if (!out.write(`${person.id},${person.lastName}\n`)) {
    await once(out, 'drain');
  }
}

out.end();
```

The query reads the next rows only as the loop asks for them, so a slow loop body slows the query down instead of filling up the memory. In a test with 200,000 rows on MySQL 8.4, `stream()` used at most 10 MB of heap where awaiting the query used 48 MB, and the difference grows with the number of rows. `stream()` took 1.6 times as long as awaiting the query, so await the query when the result fits in memory.

The models are created and their `$afterFind()` hooks run as when the query is awaited. Breaking out of the loop, or an error, ends the query and releases the connection. Iterate with `for await`, or call `return()` on the iterator if you stop calling `next()`, so that the connection is released.

## Drivers

| Driver                         | Notes                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `mysql2`, `mariadb`            | The rows are streamed from the server.                                                                  |
| `pg`                           | Needs the [pg-query-stream](https://www.npmjs.com/package/pg-query-stream) package: `npm install pg-query-stream`. Without it, knex throws when the query runs. |
| `sqlite3`, `better-sqlite3`    | Works, but knex reads all the rows before it yields the first one, so the memory isn't saved.           |

## What can't be streamed

`stream()` throws for queries that need the whole result before they can return anything:

- writes, like `insert()`, `patch()` and `delete()`;
- `first()`, and `findById()` and `findOne()`, which use it;
- `page()` and `range()`, which count the rows;
- `runAfter()`, `throwIfNotFound()` and `runAfter` in the context, which get the whole result;
- `withGraphFetched()` and `withGraphJoined()`, which load the relations of all the models together;
- a model class with a static `afterFind()` hook, which gets the whole result;
- `$relatedQuery()` of a model class with `relatedFindQueryMutates`, which assigns the result to the owner. Use the static `relatedQuery()` with `for()` instead.

To load relations for streamed models, fetch them for each batch of models yourself, with [fetchGraph](/api/model/static-methods.html#static-fetchgraph):

```js
let batch = [];

for await (const person of Person.query().orderBy('id').stream()) {
  batch.push(person);

  if (batch.length === 500) {
    await Person.fetchGraph(batch, 'pets');
    await exportPeople(batch);
    batch = [];
  }
}

await Person.fetchGraph(batch, 'pets');
await exportPeople(batch);
```

The connection of the stream is busy until the loop ends, so the other queries inside the loop use other connections of the pool. Make sure the pool has more than one connection.

## In a transaction

A stream can run in a transaction like any other query. It uses the connection of the transaction until the loop ends, and the database driver queues the other queries of that connection until then. So a query of the same transaction inside the loop waits for the loop, which waits for the query: it hangs, on MySQL, MariaDB and PostgreSQL alike.

```js
await Person.transaction(async (trx) => {
  for await (const person of Person.query(trx).stream()) {
    // Hangs: `trx` is busy with the stream.
    await person.$query(trx).patch({ exported: true });
  }
});
```

Read the rows first and write them after the loop, or run the writes outside the transaction of the stream.
