const expect = require('expect.js');

// insertGraph() and upsertGraph() run their inserts as separate queries,
// which onConflict(), ignore() and merge() of the graph query don't reach.
// They throw instead of silently ignoring them (#2156).
module.exports = (session) => {
  describe('graph writes with onConflict()', () => {
    const { Model1 } = session.models;
    const queries = [];
    const onQuery = (query) => queries.push(query.sql);

    beforeEach(async () => {
      await session.populate([{ id: 1, model1Prop1: 'a' }]);
      queries.length = 0;
      session.knex.on('query', onQuery);
    });

    afterEach(() => {
      session.knex.removeListener('query', onQuery);
    });

    const cases = [
      [
        'insertGraph().onConflict().ignore()',
        () => Model1.query().insertGraph({ id: 1 }).onConflict('id').ignore(),
      ],
      [
        'insertGraph().onConflict().merge()',
        () => Model1.query().insertGraph({ id: 1 }).onConflict('id').merge(),
      ],
      [
        'upsertGraph().onConflict().ignore()',
        () => Model1.query().upsertGraph({ id: 1 }).onConflict('id').ignore(),
      ],
    ];

    for (const [name, query] of cases) {
      it(`should reject ${name} before any query`, async () => {
        let error = null;

        try {
          await query();
        } catch (err) {
          error = err;
        }

        expect(error.message).to.match(
          /can't be used with onConflict\(\), ignore\(\) or merge\(\)/,
        );
        expect(queries).to.eql([]);
      });
    }
  });
};
