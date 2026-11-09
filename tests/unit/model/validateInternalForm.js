const Knex = require('knex');
const expect = require('expect.js');
const { Model } = require('../../../');
const knexMocker = require('../../../testUtils/mockKnex');

// Validation sees the internal form of the data, after `$parseJson`, both when
// a model is created from JSON and when a graph insert validates its models.
describe('validation of the internal form', () => {
  let mockKnex;
  let seen;

  before(() => {
    mockKnex = knexMocker(Knex({ client: 'pg' }), function (mock, oldImpl, args) {
      const promise = Promise.resolve([{ id: 1 }]);
      return promise.then.apply(promise, args);
    });
  });

  beforeEach(() => {
    seen = [];
  });

  class Person extends Model {
    static get tableName() {
      return 'person';
    }

    static get jsonSchema() {
      return {
        type: 'object',
        required: ['age'],
        properties: {
          id: { type: 'integer' },
          age: { type: 'integer' },
        },
      };
    }

    $parseJson(json, opt) {
      json = super.$parseJson(json, opt);

      if (typeof json.age === 'string') {
        json = { ...json, age: Number(json.age) };
      }

      return json;
    }

    $beforeValidate(jsonSchema, json) {
      seen.push({ ...json });
      return jsonSchema;
    }
  }

  it('insert() validates the parsed JSON', async () => {
    const person = await Person.query(mockKnex).insert({ age: '5' });

    expect(person.age).to.equal(5);
    expect(seen).to.eql([{ age: 5 }]);
  });

  it('insertGraph() validates the parsed JSON', async () => {
    const person = await Person.query(mockKnex).insertGraph({ age: '5' });

    expect(person.age).to.equal(5);
    expect(seen).to.eql([{ age: 5 }]);
  });

  it('a string that $parseJson does not convert fails in both', async () => {
    class StrictPerson extends Person {
      $parseJson(json, opt) {
        return Model.prototype.$parseJson.call(this, json, opt);
      }
    }

    for (const write of [(q) => q.insert({ age: '5' }), (q) => q.insertGraph({ age: '5' })]) {
      let error = null;

      try {
        await write(StrictPerson.query(mockKnex));
      } catch (err) {
        error = err;
      }

      expect(error).to.be.a(Model.ValidationError);
      expect(error.data.age[0].keyword).to.equal('type');
    }
  });
});
