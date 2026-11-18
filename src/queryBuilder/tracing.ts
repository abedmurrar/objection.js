import diagnosticsChannel from 'node:diagnostics_channel';
import { UpdateOperation } from './operations/UpdateOperation';
import type { KnexLike, ModelClass, Operation } from './QueryBuilderOperationSupport';
import type { QueryBuilder } from './QueryBuilder';

// Objection publishes every query it runs on the tracing channel
// `objection:query` of `node:diagnostics_channel`: `start` before the query,
// `end` when the call that started it returns, `asyncStart` and `asyncEnd`
// when the query has finished, and `error` when it fails. Subscribers like
// OpenTelemetry instrumentations see the model, the relation and the SQL of
// each query. Without subscribers, a query only checks `hasSubscribers`.
const queryChannel = diagnosticsChannel.tracingChannel<unknown, QueryTraceContext>(
  'objection:query',
);

type QueryTraceOperation =
  | 'find'
  | 'insert'
  | 'update'
  | 'patch'
  | 'delete'
  | 'relate'
  | 'unrelate'
  | 'count';

// The message of each event. The SQL has placeholders and the values aren't
// included: they are the users' data.
interface QueryTraceContext {
  modelClass: ModelClass;
  tableName: string;
  operation: QueryTraceOperation;
  relation: { name: string; ownerModelClass: ModelClass } | null;
  eager: boolean;
  sql: string;
  error?: unknown;
}

interface RelationOperation {
  relation: { name: string; ownerModelClass: ModelClass };
  owner: unknown;
  // Set on the find operations of the queries of `withGraphFetched()`.
  eager?: boolean;
}

function isTracing(): boolean {
  return queryChannel.hasSubscribers;
}

// Runs the knex query `knexQuery` of `builder` and publishes it. The result
// isn't published: `tracePromise()` would put the rows in the message.
async function traceQuery<T>(
  builder: QueryBuilder,
  operation: QueryTraceOperation | null,
  knexQuery: KnexLike,
  run: () => Promise<T>,
): Promise<T> {
  let result: T;

  await queryChannel.tracePromise(
    async () => {
      result = await run();
    },
    createContext(builder, operation, knexQuery),
  );

  return result!;
}

// The stream of `stream()` publishes `start` and `end` when it opens, and
// `asyncStart` and `asyncEnd` when it closes, after `error` if it failed.
interface StreamTrace {
  context: QueryTraceContext;
  finished: boolean;
}

function startStreamTrace(builder: QueryBuilder, knexQuery: KnexLike): StreamTrace {
  const context = createContext(builder, 'find', knexQuery);
  queryChannel.start.publish(context);
  queryChannel.end.publish(context);
  return { context, finished: false };
}

function finishStreamTrace(trace: StreamTrace, error: unknown): void {
  if (trace.finished) {
    return;
  }

  trace.finished = true;

  if (error !== null) {
    trace.context.error = error;
    queryChannel.error.publish(trace.context);
  }

  queryChannel.asyncStart.publish(trace.context);
  queryChannel.asyncEnd.publish(trace.context);
}

function createContext(
  builder: QueryBuilder,
  operation: QueryTraceOperation | null,
  knexQuery: KnexLike,
): QueryTraceContext {
  const relationOp = builder.findOperation(
    (op: Operation) => 'relation' in op && 'owner' in op,
  ) as unknown as RelationOperation | null;

  return {
    modelClass: builder.modelClass(),
    tableName: builder.tableName(),
    operation: operation ?? queryOperation(builder),
    relation:
      relationOp !== null
        ? { name: relationOp.relation.name, ownerModelClass: relationOp.relation.ownerModelClass }
        : null,
    // Only the queries that load the relations. Other child queries of a query
    // with a graph, like the fetch of `insertAndFetch()`, aren't eager.
    eager: relationOp !== null && relationOp.eager === true,
    sql: sqlOf(knexQuery),
  };
}

function queryOperation(builder: QueryBuilder): QueryTraceOperation {
  if (builder.isFind()) {
    return 'find';
  } else if (builder.isInsert()) {
    return 'insert';
  } else if (builder.isDelete()) {
    return 'delete';
  } else if (builder.isRelate()) {
    return 'relate';
  } else if (builder.isUnrelate()) {
    return 'unrelate';
  }

  const updateOp = builder.findOperation(UpdateOperation) as UpdateOperation | null;
  return updateOp?.modelOptions.patch ? 'patch' : 'update';
}

// The SQL with placeholders. knex compiles some queries to more than one
// statement.
function sqlOf(knexQuery: KnexLike): string {
  const compiled = knexQuery.toSQL();

  if (Array.isArray(compiled)) {
    return compiled.map((it: { sql: string }) => it.sql).join('; ');
  }

  return compiled.sql;
}

export { isTracing, traceQuery, startStreamTrace, finishStreamTrace };
export type { QueryTraceContext, QueryTraceOperation, StreamTrace };
