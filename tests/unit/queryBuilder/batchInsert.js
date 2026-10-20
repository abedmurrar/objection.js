/* global BigInt */
const Knex = require('knex');
const expect = require('expect.js');
const { Model } = require('../../../');
const mockKnexFactory = require('../../../testUtils/mockKnex');

describe('batch insert', () => {
  let executedQueries = [];
  let results = [];

  function createKnex(client) {
    return mockKnexFactory(
      Knex({ client, useNullAsDefault: true }),
      function (mock, oldImpl, args) {
        executedQueries.push(this.toString());
        const promise = Promise.resolve(results.shift());
        return promise.then.apply(promise, args);
      },
    );
  }

  function createModel(knex) {
    return class Person extends Model {
      static get tableName() {
        return 'persons';
      }
    }.bindKnex(knex);
  }

  beforeEach(() => {
    executedQueries = [];
    results = [];
  });

  describe('mysql', () => {
    let Person;

    beforeEach(() => {
      Person = createModel(createKnex('mysql2'));
    });

    it('should compute the ids from the first id', async () => {
      results = [[[{ increment: 1 }]], [7]];
      const people = await Person.query().insert([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);

      expect(executedQueries).to.eql([
        'select @@auto_increment_increment as increment',
        "insert into `persons` (`name`) values ('a'), ('b'), ('c')",
      ]);
      expect(people.map((it) => it.id)).to.eql([7, 8, 9]);
    });

    it('should use auto_increment_increment and read it only once', async () => {
      Person = createModel(createKnex('mysql2'));
      results = [[[{ increment: 5 }]], [10], [20]];

      const first = await Person.query().insert([{ name: 'a' }, { name: 'b' }]);
      const second = await Person.query().insert([{ name: 'c' }, { name: 'd' }]);

      expect(executedQueries).to.have.length(3);
      expect(first.map((it) => it.id)).to.eql([10, 15]);
      expect(second.map((it) => it.id)).to.eql([20, 25]);
    });

    it('should handle string and BigInt ids', async () => {
      results = [[[{ increment: 1 }]], ['9007199254740993'], [BigInt(5)]];

      const strings = await Person.query().insert([{ name: 'a' }, { name: 'b' }]);
      const bigInts = await Person.query().insert([{ name: 'c' }, { name: 'd' }]);

      expect(strings.map((it) => it.id)).to.eql(['9007199254740993', '9007199254740994']);
      expect(bigInts.map((it) => it.id)).to.eql([BigInt(5), BigInt(6)]);
    });

    it('should keep the ids that were given without reading auto_increment_increment', async () => {
      results = [[0]];
      const people = await Person.query().insert([
        { id: 3, name: 'a' },
        { id: 1, name: 'b' },
      ]);

      expect(executedQueries).to.eql([
        "insert into `persons` (`id`, `name`) values (3, 'a'), (1, 'b')",
      ]);
      expect(people.map((it) => it.id)).to.eql([3, 1]);
    });

    it('should fail before inserting when only some rows have an id', async () => {
      const err = await Person.query()
        .insert([{ id: 3, name: 'a' }, { name: 'b' }])
        .catch((err) => err);

      expect(err.message).to.equal(
        `batch insert on MySQL can't return ids when only some rows have an id. Set the id on all rows or none.`,
      );
      expect(executedQueries).to.eql([]);
    });

    it('should see ids set in $beforeInsert', async () => {
      class Uuid extends Person {
        $beforeInsert() {
          this.id = `id-${this.name}`;
        }
      }

      results = [[0]];
      const people = await Uuid.query().insert([{ name: 'a' }, { name: 'b' }]);

      expect(people.map((it) => it.id)).to.eql(['id-a', 'id-b']);
    });

    it('should not set ids with onConflict()', async () => {
      results = [[[{ increment: 1 }]], [7]];
      const people = await Person.query()
        .insert([{ name: 'a' }, { name: 'b' }])
        .onConflict('name')
        .merge();

      expect(people.map((it) => it.id)).to.eql([undefined, undefined]);
    });

    it('should not change single inserts', async () => {
      results = [[7]];
      const person = await Person.query().insert({ name: 'a' });

      expect(executedQueries).to.eql(["insert into `persons` (`name`) values ('a')"]);
      expect(person.id).to.equal(7);
    });
  });

  describe('sqlite', () => {
    let Person;

    beforeEach(() => {
      Person = createModel(createKnex('sqlite3'));
    });

    it('should use returning for batch inserts', async () => {
      results = [[{ id: 1 }, { id: 2 }]];
      const people = await Person.query().insert([{ name: 'a' }, { name: 'b' }]);

      expect(executedQueries).to.eql([
        "insert into `persons` (`name`) select 'a' as `name` union all select 'b' as `name` returning `id`",
      ]);
      expect(people.map((it) => it.id)).to.eql([1, 2]);
    });

    it('should not change single inserts', async () => {
      results = [[7]];
      const person = await Person.query().insert({ name: 'a' });

      expect(executedQueries).to.eql(["insert into `persons` (`name`) values ('a')"]);
      expect(person.id).to.equal(7);
    });
  });
});
