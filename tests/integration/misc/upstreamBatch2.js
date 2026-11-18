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

    describe('Model.ref() in the join of a relation (#1873)', () => {
      class Pet extends Model {
        static get tableName() {
          return 'ub2_pets';
        }
      }

      class Owner extends Model {
        static get tableName() {
          return 'ub2_persons';
        }

        static get relationMappings() {
          return {
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: { from: Owner.ref('id'), to: Pet.ref('ownerId') },
            },
          };
        }
      }

      before(async () => {
        await knex.schema.dropTableIfExists('ub2_pets');
        await knex.schema.createTable('ub2_pets', (table) => {
          table.increments('id').primary();
          table.integer('ownerId');
          table.string('name');
        });
      });

      after(() => knex.schema.dropTableIfExists('ub2_pets'));

      it('should load and insert through the relation', async () => {
        // Without ids, so that PostgreSQL's sequence knows them.
        await knex('ub2_pets').insert({ ownerId: 1, name: 'Fido' });
        await knex('ub2_pets').insert({ ownerId: 9, name: 'Rex' });

        const [owner] = await Owner.query(knex).withGraphFetched('pets').where('id', 1);
        await owner.$relatedQuery('pets', knex).insert({ name: 'Kit' });

        expect(owner.pets.map((it) => it.name)).to.eql(['Fido']);
        expect(
          (await knex('ub2_pets').where('ownerId', 1).orderBy('id')).map((it) => it.name),
        ).to.eql(['Fido', 'Kit']);
      });
    });

    describe('inserts of a model without an idColumn (#2305)', () => {
      class Log extends Model {
        static get tableName() {
          return 'ub2_logs';
        }

        static get idColumn() {
          return null;
        }
      }

      before(async () => {
        await knex.schema.dropTableIfExists('ub2_logs');
        await knex.schema.createTable('ub2_logs', (table) => {
          table.string('message');
        });
      });

      after(() => knex.schema.dropTableIfExists('ub2_logs'));

      it('should return the models without a "null" property', async () => {
        const one = await Log.query(knex).insert({ message: 'a' });
        const many = await Log.query(knex).insert([{ message: 'b' }, { message: 'c' }]);

        expect({ ...one }).to.eql({ message: 'a' });
        expect(many.map((it) => ({ ...it }))).to.eql([{ message: 'b' }, { message: 'c' }]);
      });
    });

    if (session.isMySql()) {
      describe('MySQL: a patch value that is a subquery of the same table', () => {
        it('should be wrapped like a subquery in a where clause', async () => {
          await knex('ub2_persons').insert({ id: 2, name: 'Bob', age: 50 });

          await Person.query(knex)
            .patch({ age: Person.query(knex).max('age') })
            .where('id', 1);

          expect((await knex('ub2_persons').where('id', 1).first()).age).to.equal(50);
        });
      });
    }

    describe('updates and deletes with joins', () => {
      class Pet extends Model {
        static get tableName() {
          return 'ub2_jpets';
        }

        static get relationMappings() {
          return {
            owner: {
              relation: Model.BelongsToOneRelation,
              modelClass: Owner,
              join: { from: 'ub2_jpets.ownerId', to: 'ub2_persons.id' },
            },
          };
        }
      }

      class Owner extends Model {
        static get tableName() {
          return 'ub2_persons';
        }

        static get relationMappings() {
          return {
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: { from: 'ub2_persons.id', to: 'ub2_jpets.ownerId' },
            },
          };
        }
      }

      before(async () => {
        await knex.schema.dropTableIfExists('ub2_jpets');
        await knex.schema.createTable('ub2_jpets', (table) => {
          table.integer('id').primary();
          table.integer('ownerId');
          table.string('name');
        });
      });

      after(() => knex.schema.dropTableIfExists('ub2_jpets'));

      beforeEach(async () => {
        await knex('ub2_jpets').delete();
        await knex('ub2_persons').insert([
          { id: 2, name: 'Bob', age: 40 },
          { id: 3, name: 'Cid', age: 50 },
        ]);
        await knex('ub2_jpets').insert([
          { id: 1, ownerId: 1, name: 'Fido' },
          { id: 2, ownerId: 2, name: 'Rex' },
        ]);
      });

      const ages = async () =>
        (await knex('ub2_persons').orderBy('id')).map((it) => [it.id, it.age]);

      it('patch() should only change the rows that the joins match', async () => {
        // Without a where clause on the joined table, knex left the join out of
        // the update on every database but MySQL, which changed every row.
        const numUpdated = await Owner.query(knex).patch({ age: 99 }).joinRelated('pets');

        expect(Number(numUpdated)).to.equal(2);
        expect(await ages()).to.eql([
          [1, 99],
          [2, 99],
          [3, 50],
        ]);

        await Owner.query(knex).patch({ age: 1 }).joinRelated('pets').where('pets.name', 'Rex');
        expect(await ages()).to.eql([
          [1, 99],
          [2, 1],
          [3, 50],
        ]);
      });

      it('delete() should only delete the rows that the joins match', async () => {
        const numDeleted = await Owner.query(knex)
          .delete()
          .joinRelated('pets')
          .where('pets.name', 'Rex');

        expect(Number(numDeleted)).to.equal(1);
        expect((await ages()).map((it) => it[0])).to.eql([1, 3]);

        await Owner.query(knex)
          .delete()
          .join('ub2_jpets', 'ub2_jpets.ownerId', 'ub2_persons.id')
          .where('ub2_jpets.name', 'Fido');
        expect((await ages()).map((it) => it[0])).to.eql([3]);
      });

      it('a relation patch() should keep the relation filter and the joins', async () => {
        await Owner.relatedQuery('pets', knex)
          .for(1)
          .patch({ name: 'Max' })
          .joinRelated('owner')
          .where('owner.age', 30);
        await Owner.relatedQuery('pets', knex)
          .for(2)
          .patch({ name: 'Max' })
          .joinRelated('owner')
          .where('owner.age', 30);

        const names = (await knex('ub2_jpets').orderBy('id')).map((it) => it.name);
        expect(names).to.eql(['Max', 'Rex']);
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
