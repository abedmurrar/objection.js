const Knex = require('knex');
const expect = require('expect.js');
const { Model } = require('../../../');
const knexMocker = require('../../../testUtils/mockKnex');

// SQLite doesn't guarantee the order of the rows that `returning` returns, so
// the ids of a multi-row insert are matched to the models by the ids
// themselves, and by their order for the rows that the database gives an id.
describe('SQLite multi-row insert ids', () => {
  let results = [];
  let executedQueries = [];
  let TestModel = null;

  before(() => {
    const knex = Knex({ client: 'sqlite3', useNullAsDefault: true });

    const mockKnex = knexMocker(knex, function (mock, oldImpl, args) {
      executedQueries.push(this.toString());
      const promise = Promise.resolve(results.shift() || []);
      return promise.then.apply(promise, args);
    });

    TestModel = class TestModel extends Model {
      static get tableName() {
        return 'Model';
      }
    };

    TestModel.knex(mockKnex);
  });

  beforeEach(() => {
    results = [];
    executedQueries = [];
  });

  it('should match the returned ids by their order, whatever order the rows come in', async () => {
    results = [[{ id: 12 }, { id: 10 }, { id: 11 }]];

    const models = await TestModel.query().insert([{ a: 1 }, { a: 2 }, { a: 3 }]);

    expect(executedQueries[0]).to.match(/returning `id`$/);
    expect(models.map((it) => [it.a, it.id])).to.eql([
      [1, 10],
      [2, 11],
      [3, 12],
    ]);
  });

  it('should keep the ids that the models have', async () => {
    results = [[{ id: 13 }, { id: 5 }, { id: 12 }]];

    const models = await TestModel.query().insert([{ a: 1 }, { id: 5, a: 2 }, { a: 3 }]);

    expect(models.map((it) => [it.a, it.id])).to.eql([
      [1, 12],
      [2, 5],
      [3, 13],
    ]);
  });

  it("shouldn't ask for the ids if every model has one", async () => {
    results = [[3]];

    const models = await TestModel.query().insert([
      { id: 1, a: 1 },
      { id: 2, a: 2 },
    ]);

    expect(executedQueries[0]).not.to.contain('returning');
    expect(models.map((it) => it.id)).to.eql([1, 2]);
  });

  it('should match the rows of returning("*") by their ids', async () => {
    results = [
      [
        { id: 11, a: 2, b: 'second' },
        { id: 10, a: 1, b: 'first' },
      ],
    ];

    const models = await TestModel.query()
      .insert([{ a: 1 }, { a: 2 }])
      .returning('*');

    expect(models.map((it) => [it.a, it.id, it.b])).to.eql([
      [1, 10, 'first'],
      [2, 11, 'second'],
    ]);
  });
});
