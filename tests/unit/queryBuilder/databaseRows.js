const Knex = require('knex');
const expect = require('expect.js');
const { setTimeout: sleep } = require('node:timers/promises');
const { Model, snakeCaseMappers } = require('../../../');
const knexMocker = require('../../../testUtils/mockKnex');

// The rows of a query are written to the models directly when the model class
// keeps the default database JSON methods, and through them otherwise. Both
// give the same models.
describe('database rows to models', () => {
  let results;
  let mockKnex;

  before(() => {
    mockKnex = knexMocker(Knex({ client: 'pg' }), function (mock, oldImpl, args) {
      const promise = Promise.resolve(results.shift() || []);
      return promise.then.apply(promise, args);
    });
  });

  beforeEach(() => {
    results = [];
  });

  function rows() {
    return [
      { id: 1, first_name: 'a', settings_json: '{"x":1}', other_text: '{"y":1}' },
      { id: 2, first_name: 'b', settings_json: { x: 2 }, other_text: 'not json' },
      { id: 3, first_name: 'c', settings_json: 'not json', other_text: null },
    ];
  }

  const expected = [
    { id: 1, firstName: 'a', settingsJson: { x: 1 }, otherText: '{"y":1}' },
    { id: 2, firstName: 'b', settingsJson: { x: 2 }, otherText: 'not json' },
    { id: 3, firstName: 'c', settingsJson: 'not json', otherText: null },
  ];

  function createModel(body = {}) {
    class Person extends Model {
      static tableName = 'person';
      static columnNameMappers = snakeCaseMappers();
      static jsonAttributes = ['settingsJson'];
    }

    Object.assign(Person, body.statics);
    Object.assign(Person.prototype, body.methods);
    return Person;
  }

  async function find(modelClass) {
    results.push(rows());
    return modelClass.query(mockKnex);
  }

  function plain(models) {
    return models.map((model) => ({ ...model }));
  }

  it('should map the columns and parse the JSON attributes with snakeCaseMappers', async () => {
    const Person = createModel();
    const models = await find(Person);

    expect(models.every((model) => model instanceof Person)).to.be(true);
    expect(plain(models)).to.eql(expected);
  });

  it('should keep the columns without column name mappers', async () => {
    class Person extends Model {
      static tableName = 'person';
      static jsonAttributes = ['settings_json'];
    }

    const models = await find(Person);

    expect(plain(models)).to.eql([
      { id: 1, first_name: 'a', settings_json: { x: 1 }, other_text: '{"y":1}' },
      { id: 2, first_name: 'b', settings_json: { x: 2 }, other_text: 'not json' },
      { id: 3, first_name: 'c', settings_json: 'not json', other_text: null },
    ]);
  });

  it('should call an overridden $parseDatabaseJson for each row', async () => {
    let calls = 0;
    const Person = createModel({
      methods: {
        $parseDatabaseJson(json) {
          calls++;
          return { ...Model.prototype.$parseDatabaseJson.call(this, json), parsed: true };
        },
      },
    });

    const models = await find(Person);

    expect(calls).to.equal(3);
    expect(plain(models)).to.eql(expected.map((it) => ({ ...it, parsed: true })));
  });

  it('should call a $parseDatabaseJson class field for each row', async () => {
    let calls = 0;

    class Person extends createModel() {
      $parseDatabaseJson = (json) => {
        calls++;
        return Model.prototype.$parseDatabaseJson.call(this, json);
      };
    }

    const models = await find(Person);

    expect(calls).to.equal(3);
    expect(plain(models).map(({ $parseDatabaseJson, ...it }) => it)).to.eql(expected);
  });

  it('should call an overridden $setDatabaseJson and fromDatabaseJson', async () => {
    const calls = [];
    const Person = createModel({
      methods: {
        $setDatabaseJson(json) {
          calls.push('set');
          return Model.prototype.$setDatabaseJson.call(this, json);
        },
      },
    });

    expect(plain(await find(Person))).to.eql(expected);
    expect(calls).to.eql(['set', 'set', 'set']);

    class Other extends createModel() {
      static fromDatabaseJson(json) {
        calls.push('from');
        return super.fromDatabaseJson(json);
      }
    }

    calls.length = 0;
    expect(plain(await find(Other))).to.eql(expected);
    expect(calls).to.eql(['from', 'from', 'from']);
  });

  it('should use custom column name mappers', async () => {
    const mappers = snakeCaseMappers();
    let calls = 0;
    const Person = createModel({
      statics: {
        columnNameMappers: {
          parse(json) {
            calls++;
            return mappers.parse(json);
          },
          format: mappers.format,
        },
      },
    });

    expect(plain(await find(Person))).to.eql(expected);
    expect(calls).to.equal(3);
  });

  describe('$afterFind', () => {
    it('should call a $afterFind of the class for each model', async () => {
      const called = [];
      const Person = createModel({
        methods: {
          $afterFind() {
            called.push(this.id);
          },
        },
      });

      await find(Person);
      expect(called).to.eql([1, 2, 3]);
    });

    it('should wait for an async $afterFind', async () => {
      const called = [];
      const Person = createModel({
        methods: {
          async $afterFind() {
            await sleep(5 - this.id);
            this.done = true;
            called.push(this.id);
          },
        },
      });

      const models = await find(Person);

      expect(called.sort()).to.eql([1, 2, 3]);
      expect(models.every((model) => model.done)).to.be(true);
    });

    it('should call the $afterFind of a later model only', async () => {
      const called = [];

      class Person extends createModel() {
        static fromDatabaseJson(json) {
          const model = super.fromDatabaseJson(json);

          if (model.id === 3) {
            model.$afterFind = function () {
              called.push(this.id);
            };
          }

          return model;
        }
      }

      await find(Person);
      expect(called).to.eql([3]);
    });
  });

  describe('withGraphJoined', () => {
    function createModels(methods) {
      class Pet extends Model {
        static tableName = 'pet';
        static columnNameMappers = snakeCaseMappers();
        static jsonAttributes = ['petData'];

        static tableMetadata() {
          return { columns: ['id', 'pet_data', 'owner_id'] };
        }
      }

      Object.assign(Pet.prototype, methods);

      class Person extends Model {
        static tableName = 'person';
        static columnNameMappers = snakeCaseMappers();

        static tableMetadata() {
          return { columns: ['id', 'first_name'] };
        }

        static relationMappings = {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'person.id', to: 'pet.owner_id' },
          },
        };
      }

      return { Person, Pet };
    }

    function flatRows() {
      return [
        { id: 1, first_name: 'a', 'pets:id': 10, 'pets:pet_data': '{"x":1}', 'pets:owner_id': 1 },
        { id: 1, first_name: 'a', 'pets:id': 11, 'pets:pet_data': { x: 2 }, 'pets:owner_id': 1 },
        { id: 2, first_name: 'b', 'pets:id': null, 'pets:pet_data': null, 'pets:owner_id': null },
      ];
    }

    const expectedGraph = [
      {
        id: 1,
        firstName: 'a',
        pets: [
          { id: 10, petData: { x: 1 }, ownerId: 1 },
          { id: 11, petData: { x: 2 }, ownerId: 1 },
        ],
      },
      { id: 2, firstName: 'b', pets: [] },
    ];

    async function findGraph(Person) {
      results.push(flatRows());
      const models = await Person.query(mockKnex).withGraphJoined('pets');
      return models.map((model) => ({ ...model, pets: model.pets.map((pet) => ({ ...pet })) }));
    }

    it('should map the columns and parse the JSON attributes', async () => {
      const { Person } = createModels();
      expect(await findGraph(Person)).to.eql(expectedGraph);
    });

    it('should call an overridden $parseDatabaseJson', async () => {
      const { Person } = createModels({
        $parseDatabaseJson(json) {
          return { ...Model.prototype.$parseDatabaseJson.call(this, json), parsed: true };
        },
      });

      const graph = expectedGraph.map((person) => ({
        ...person,
        pets: person.pets.map((pet) => ({ ...pet, parsed: true })),
      }));
      expect(await findGraph(Person)).to.eql(graph);
    });

    it('should call an overridden fromDatabaseJson', async () => {
      const { Person, Pet } = createModels();
      let calls = 0;

      Pet.fromDatabaseJson = function (json) {
        calls++;
        return Model.fromDatabaseJson.call(this, json);
      };

      expect(await findGraph(Person)).to.eql(expectedGraph);
      expect(calls).to.equal(2);
    });
  });
});
