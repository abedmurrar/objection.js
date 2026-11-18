const expect = require('expect.js');
const { Model, raw, ref, val } = require('../../../');

// Upstream objection.js issues that the fork had too, each in a describe.
module.exports = (session) => {
  describe('upstream issues', () => {
    const knex = session.knex;

    class Person extends Model {
      static get tableName() {
        return 'ub2_persons';
      }

      static get jsonSchema() {
        return {
          type: 'object',
          required: ['name'],
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            age: { type: 'integer' },
          },
        };
      }
    }

    before(async () => {
      await knex.schema.dropTableIfExists('ub2_persons');
      await knex.schema.createTable('ub2_persons', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.integer('age');
        table.string('token');
      });
    });

    after(() => knex.schema.dropTableIfExists('ub2_persons'));

    beforeEach(async () => {
      await knex('ub2_persons').delete();
      await knex('ub2_persons').insert({ id: 1, name: 'Ann', age: 30, token: 'secret' });
    });

    describe('select() of patchAndFetchById() (#1938)', () => {
      it('should fetch the selected columns, with the values of the patch', async () => {
        const queries = [];
        const onQuery = (query) => queries.push(query.sql);
        knex.on('query', onQuery);

        let person;

        try {
          person = await Person.query(knex).patchAndFetchById(1, { age: 31 }).select('id', 'name');
        } finally {
          knex.removeListener('query', onQuery);
        }

        expect(person).to.eql({ id: 1, name: 'Ann', age: 31 });
        expect(queries[queries.length - 1]).to.match(/^select ["`]id["`], ["`]name["`] from/);
      });
    });

    describe('refs in an orderBy() array (#2252)', () => {
      it('should order by the refs, also in { column } objects', async () => {
        await knex('ub2_persons').insert([
          { id: 2, name: 'Bob', age: 30 },
          { id: 3, name: 'Ann', age: 20 },
        ]);

        const byRefs = await Person.query(knex).orderBy([ref('name'), ref('age')]);
        const byObjects = await Person.query(knex).orderBy([
          { column: ref('age'), order: 'desc' },
          { column: ref('id') },
        ]);

        expect(byRefs.map((it) => it.id)).to.eql([3, 1, 2]);
        expect(byObjects.map((it) => it.id)).to.eql([1, 2, 3]);
      });
    });

    describe('a required property given as a query property (#2199)', () => {
      it('should pass validation with raw() and val()', async () => {
        await Person.query(knex).insert({ id: 2, name: raw('?', ['Raw']) });
        await Person.query(knex).insert({ id: 3, name: val('Val') });

        const names = (await knex('ub2_persons').orderBy('id')).map((it) => it.name);
        expect(names).to.eql(['Ann', 'Raw', 'Val']);
      });

      it('should still require the property when it is missing', async () => {
        let error = null;

        try {
          await Person.query(knex).insert({ id: 4, age: 1 });
        } catch (err) {
          error = err;
        }

        expect(error).to.be.a(Person.ValidationError);
      });
    });
  });
};
