const diagnosticsChannel = require('node:diagnostics_channel');
const expect = require('expect.js');
const { DBError } = require('../../../');

module.exports = (session) => {
  describe('tracing through diagnostics_channel', () => {
    const { Model1, Model2 } = session.models;
    const channel = diagnosticsChannel.tracingChannel('objection:query');
    const SECRET = 'secret value 42';

    let events;
    let handlers;

    beforeEach(async () => {
      await session.populate([
        {
          id: 1,
          model1Prop1: 'hello 1',
          model1Relation2: [{ idCol: 1, model2Prop1: 'hejsan 1' }],
        },
        { id: 2, model1Prop1: 'hello 2' },
      ]);

      events = [];
      handlers = {};

      for (const name of ['start', 'end', 'asyncStart', 'asyncEnd', 'error']) {
        handlers[name] = (context) => events.push({ name, context });
      }

      channel.subscribe(handlers);
    });

    afterEach(() => {
      channel.unsubscribe(handlers);
    });

    // The messages of the queries, each checked to have the events of one query.
    function traces() {
      const contexts = [];

      for (const { context } of events) {
        if (!contexts.includes(context)) {
          contexts.push(context);
        }
      }

      return contexts.map((context) => {
        const names = events.filter((it) => it.context === context).map((it) => it.name);
        const expected = context.error
          ? ['start', 'end', 'error', 'asyncStart', 'asyncEnd']
          : ['start', 'end', 'asyncStart', 'asyncEnd'];

        expect(names).to.eql(expected);
        return context;
      });
    }

    function summary(context) {
      return {
        modelClass: context.modelClass.name,
        tableName: context.tableName,
        operation: context.operation,
        relation: context.relation
          ? `${context.relation.ownerModelClass.name}.${context.relation.name}`
          : null,
        eager: context.eager,
      };
    }

    it('should publish a find', async () => {
      await Model1.query().where('id', 1);
      const [trace] = traces();

      expect(summary(trace)).to.eql({
        modelClass: 'Model1',
        tableName: 'Model1',
        operation: 'find',
        relation: null,
        eager: false,
      });
      expect(trace.sql).to.match(/select/i);
      expect(trace.sql).to.contain('?');
      // `tracePromise()` adds `result`, which stays empty: the rows are the
      // users' data.
      expect(trace.result).to.equal(undefined);
      expect(
        Object.keys(trace)
          .filter((key) => key !== 'result')
          .sort(),
      ).to.eql(['eager', 'modelClass', 'operation', 'relation', 'sql', 'tableName']);
    });

    it('should publish writes without their values', async () => {
      const inserted = await Model1.query().insert({ model1Prop1: SECRET });
      await Model1.query().patch({ model1Prop1: SECRET }).where('id', inserted.id);
      await Model1.query().update({ model1Prop1: SECRET, model1Prop2: 1 }).where('id', inserted.id);
      await Model1.query().delete().where('model1Prop1', SECRET);

      const writes = traces().filter((it) => it.operation !== 'find');
      expect(writes.map((it) => it.operation)).to.eql(['insert', 'patch', 'update', 'delete']);

      for (const event of events) {
        expect(JSON.stringify({ ...event.context, modelClass: null })).not.to.contain(SECRET);
      }
    });

    it('should publish the relation of related queries and eager loading', async () => {
      const owner = await Model1.query().findById(1);
      events.length = 0;

      await owner.$relatedQuery('model1Relation2');
      await Model1.query().findById(1).withGraphFetched('model1Relation2');

      const [related, root, eager] = traces();

      expect(summary(related)).to.eql({
        modelClass: 'Model2',
        tableName: 'model2',
        operation: 'find',
        relation: 'Model1.model1Relation2',
        eager: false,
      });
      expect(summary(root).relation).to.equal(null);
      expect(summary(eager)).to.eql({
        modelClass: 'Model2',
        tableName: 'model2',
        operation: 'find',
        relation: 'Model1.model1Relation2',
        eager: true,
      });
    });

    it('should publish the count query of page()', async () => {
      await Model1.query().page(0, 1);

      expect(traces().map((it) => it.operation)).to.eql(['find', 'count']);
    });

    it('should publish stream() until the stream closes', async () => {
      const seen = [];

      for await (const model of Model1.query().orderBy('id').stream()) {
        seen.push(model.id);
        // The query started before the first model. A small result can have
        // arrived, and the stream closed, before it.
        expect(events.slice(0, 2).map((it) => it.name)).to.eql(['start', 'end']);
      }

      expect(seen).to.eql([1, 2]);
      expect(traces().map((it) => it.operation)).to.eql(['find']);
    });

    it('should publish the end of stream() when the loop stops early', async () => {
      for await (const _ of Model1.query().orderBy('id').stream()) {
        break;
      }

      await new Promise((resolve) => setImmediate(resolve));
      expect(traces()).to.have.length(1);
    });

    it('should publish cursorPage()', async () => {
      const page = await Model2.query().cursorPage(1);
      expect(page.results).to.have.length(1);

      const [trace] = traces();
      expect(trace.operation).to.equal('find');
      expect(trace.sql).to.match(/limit/i);
    });

    it('should publish the error of a failing query', async () => {
      let error = null;

      try {
        await Model1.query().where('noSuchColumn', SECRET);
      } catch (err) {
        error = err;
      }

      const [trace] = traces();
      // The error of the driver, which the query wraps in a DBError.
      expect(trace.error).to.be.an(Error);
      expect(error).to.be.a(DBError);
      expect(trace.sql).not.to.contain(SECRET);
    });

    it('should not publish after the subscriber unsubscribes', async () => {
      channel.unsubscribe(handlers);
      await Model1.query();
      channel.subscribe(handlers);

      expect(events).to.have.length(0);
    });
  });
};
