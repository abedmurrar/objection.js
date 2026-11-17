# Tracing

Objection publishes every query it runs on the tracing channel `objection:query` of Node's built-in [diagnostics_channel](https://nodejs.org/api/diagnostics_channel.html#class-tracingchannel) module. Tracing and monitoring tools can subscribe to it to see each query with its model, its relation and its SQL, without wrapping objection or knex. Nothing is installed or configured for it, and without a subscriber a query only checks whether there is one. With a subscriber, a query costs a little more, because its SQL is compiled once more for the message: a `findById()` on MySQL took 122 to 127 µs instead of 119 to 121 µs.

```js
const diagnosticsChannel = require('node:diagnostics_channel');

diagnosticsChannel.tracingChannel('objection:query').subscribe({
  start(query) {
    query.startedAt = performance.now();
  },
  end() {},
  asyncStart() {},
  asyncEnd(query) {
    const ms = (performance.now() - query.startedAt).toFixed(1);
    console.log(`${query.operation} ${query.tableName}: ${ms} ms`);
  },
  error(query) {
    console.log(`${query.operation} ${query.tableName} failed: ${query.error.code ?? query.error.name}`);
  },
});
```

Each query publishes `start` before it runs, `end` when the call that started it returns, and `asyncStart` and `asyncEnd` when the database has answered. A failing query publishes `error` before `asyncStart`. The events of one query get the same message object, so a subscriber can keep its own data on it, like `startedAt` above.

## The message

| Property     | Type                                         | Description                                                                                                                                  |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelClass` | `ModelClass`                                 | The model class of the query.                                                                                                                |
| `tableName`  | `string`                                     | The table of the model class.                                                                                                                |
| `operation`  | `string`                                     | `'find'`, `'insert'`, `'update'`, `'patch'`, `'delete'`, `'relate'`, `'unrelate'`, or `'count'` for the count query of `page()` and `resultSize()`. |
| `relation`   | `{ name, ownerModelClass }` or `null`        | The relation of `$relatedQuery()`, `relatedQuery()` and eager loading, like `{ name: 'pets', ownerModelClass: Person }`.                      |
| `eager`      | `boolean`                                    | `true` for the queries of `withGraphFetched()`.                                                                                              |
| `sql`        | `string`                                     | The SQL, with placeholders.                                                                                                                  |
| `error`      | `Error`                                      | On `error`: the error of the database driver.                                                                                                |

The values of the query and the rows it returns are never in the message: they are your users' data, and tracing tools send what they record to other services. The `sql` has `?` or `$1` where the values go, which is also what [OpenTelemetry](https://opentelemetry.io/docs/specs/semconv/database/database-spans/) expects as the query text.

The `error` is the error that the database driver threw, before objection wraps it in a [DBError](/recipes/error-handling.html). knex writes the values of the query into the message of its errors, like `where email = 'jennifer@example.com' - ER_BAD_FIELD_ERROR`, so record the error's code (like `ER_BAD_FIELD_ERROR`) or name rather than its message, as the examples here do.

Queries are published by [stream()](/api/query-builder/other-methods.html#stream) too: `asyncEnd` comes when the stream closes, after the last row or when the loop stops. Queries that objection runs for its own bookkeeping, like reading the columns of a table for `withGraphJoined()`, and the queries of a transaction itself (`BEGIN`, `COMMIT`) aren't published. knex's own [query events](https://knexjs.org/guide/interfaces.html#events) have those.

## OpenTelemetry

A span for each query, as a child of the span that is active when the query starts, like the span of an HTTP request:

```js
const diagnosticsChannel = require('node:diagnostics_channel');
const { trace, SpanKind, SpanStatusCode } = require('@opentelemetry/api');

const tracer = trace.getTracer('objection');
const spans = new WeakMap();

diagnosticsChannel.tracingChannel('objection:query').subscribe({
  start(query) {
    const span = tracer.startSpan(`${query.operation} ${query.tableName}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'db.operation.name': query.operation,
        'db.collection.name': query.tableName,
        'db.query.text': query.sql,
      },
    });

    spans.set(query, span);
  },
  end() {},
  asyncStart() {},
  asyncEnd(query) {
    spans.get(query)?.end();
  },
  error(query) {
    spans.get(query)?.setStatus({
      code: SpanStatusCode.ERROR,
      message: query.error.code ?? query.error.name,
    });
  },
});
```

## TypeScript

The message is the `QueryTraceContext` type:

```ts
import diagnosticsChannel from 'node:diagnostics_channel';
import type { QueryTraceContext } from '@abedmurrar/objection';

const channel = diagnosticsChannel.tracingChannel<unknown, QueryTraceContext>('objection:query');
```

## Node.js versions

`tracingChannel()` is in every Node.js version that this package supports. It is marked stable since Node.js 26.8, and experimental before, in the 22 and 24 lines, without a change to how it works. The tests of the tracing run on Node.js 22, 24 and 26.
