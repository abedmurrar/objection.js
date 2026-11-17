import diagnosticsChannel from 'node:diagnostics_channel';
import { Model, type QueryTraceContext } from '../../../';
import { expectType } from '../_utils/expect';

// The message of the `objection:query` tracing channel.

class Person extends Model {
  static tableName = 'persons';

  id!: number;
}

const channel = diagnosticsChannel.tracingChannel<unknown, QueryTraceContext>('objection:query');

channel.subscribe({
  start(query) {
    expectType<string>()(query.sql);
    expectType<string>()(query.tableName);
    expectType<boolean>()(query.eager);
    expectType<string | undefined>()(query.relation?.name);

    if (query.operation === 'patch' && query.modelClass === Person) {
      expectType<string>()(query.modelClass.tableName);
    }
  },
  end() {},
  asyncStart() {},
  asyncEnd() {},
  error(query) {
    expectType<unknown>()(query.error);
  },
});
