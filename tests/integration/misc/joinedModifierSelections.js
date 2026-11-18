const expect = require('expect.js');
const { Model, raw } = require('../../../');

// The selections of withGraphJoined() modifiers that objection can name are
// selected from the joined subqueries: aggregates with an alias (#2219), raw
// SQL that ends with an alias and subqueries with as() (#2365). Adapted from
// ditojs/objection 94fdc217, 8851db95 and bd5775de.
module.exports = (session) => {
  describe('selections of withGraphJoined() modifiers', () => {
    const knex = session.knex;

    class Toy extends Model {
      static get tableName() {
        return 'jms_toys';
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'jms_pets';
      }
    }

    class Owner extends Model {
      static get tableName() {
        return 'jms_owners';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'jms_owners.id', to: 'jms_pets.ownerId' },
          },
        };
      }
    }

    before(async () => {
      for (const table of ['jms_toys', 'jms_pets', 'jms_owners']) {
        await knex.schema.dropTableIfExists(table);
      }

      await knex.schema.createTable('jms_owners', (table) => {
        table.integer('id').primary();
        table.string('name');
      });
      await knex.schema.createTable('jms_pets', (table) => {
        table.integer('id').primary();
        table.integer('ownerId');
        table.string('name');
        table.string('token');
      });
      await knex.schema.createTable('jms_toys', (table) => {
        table.integer('id').primary();
        table.integer('petId');
        table.integer('price');
      });

      await knex('jms_owners').insert({ id: 1, name: 'Jennifer' });
      await knex('jms_pets').insert([
        { id: 1, ownerId: 1, name: 'Fluffy', token: 'aaaa1111' },
        { id: 2, ownerId: 1, name: 'Doggo', token: 'bbbb2222' },
      ]);
      await knex('jms_toys').insert([
        { id: 1, petId: 1, price: 10 },
        { id: 2, petId: 1, price: 20 },
        { id: 3, petId: 2, price: 5 },
      ]);
    });

    after(async () => {
      for (const table of ['jms_toys', 'jms_pets', 'jms_owners']) {
        await knex.schema.dropTableIfExists(table);
      }
    });

    // The modifier groups by the id of the pets: withGraphJoined() selects it,
    // and the databases don't allow selecting columns that aren't grouped.
    function fetchPets(modifier) {
      return Owner.query(knex)
        .findById(1)
        .withGraphJoined('pets(m)')
        .modifiers({ m: modifier })
        .orderBy('pets.id')
        .then((owner) => owner.pets);
    }

    const withToys = (query) => query.join('jms_toys', 'jms_toys.petId', 'jms_pets.id');
    const plain = (pets, numeric) =>
      pets.map((pet) => {
        const out = { ...pet };

        for (const prop of numeric) {
          out[prop] = Number(out[prop]);
        }

        return out;
      });

    it("should select count('* as n')", async () => {
      const pets = await fetchPets((q) =>
        withToys(q.select('jms_pets.name').count('* as n').groupBy('jms_pets.id')),
      );

      // The id and the key that the join adds are left out of the models.
      expect(plain(pets, ['n'])).to.eql([
        { name: 'Fluffy', n: 2 },
        { name: 'Doggo', n: 1 },
      ]);
    });

    it("should select count('* as n') without other selections", async () => {
      const pets = await fetchPets((q) => withToys(q.count('* as n').groupBy('jms_pets.id')));

      expect(plain(pets, ['n'])).to.eql([{ n: 2 }, { n: 1 }]);
    });

    it('should select sum({ total: col }) and count(col, { as })', async () => {
      const pets = await fetchPets((q) =>
        withToys(
          q
            .sum({ total: 'jms_toys.price' })
            .count('jms_toys.id', { as: 'toys' })
            .groupBy('jms_pets.id'),
        ),
      );

      // In the order of the pets' ids, which the join selects but leaves out.
      expect(plain(pets, ['total', 'toys'])).to.eql([
        { total: 30, toys: 2 },
        { total: 5, toys: 1 },
      ]);
    });

    it('should select raw SQL that ends with an alias, next to all columns', async () => {
      const lastFour =
        session.isPostgres() || session.isMySql() ? 'RIGHT(token, 4)' : 'substr(token, -4)';
      const pets = await fetchPets((q) => q.select('id', raw(`${lastFour} AS last4`)));

      expect(pets.map((it) => [it.id, it.last4])).to.eql([
        [1, '1111'],
        [2, '2222'],
      ]);

      // Only the raw selection: all the other columns are still selected.
      const all = await fetchPets((q) => q.select(raw(`${lastFour} as "last4"`)));
      expect(all.map((it) => [it.id, it.name, it.last4])).to.eql([
        [1, 'Fluffy', '1111'],
        [2, 'Doggo', '2222'],
      ]);
    });

    it('should select an aliased subquery', async () => {
      const pets = await fetchPets((q) =>
        q.select(
          'jms_pets.id',
          'jms_pets.name',
          Toy.query().count().where('jms_toys.petId', knex.ref('jms_pets.id')).as('toyCount'),
        ),
      );

      expect(plain(pets, ['toyCount']).map((it) => [it.name, it.toyCount])).to.eql([
        ['Fluffy', 2],
        ['Doggo', 1],
      ]);
    });
  });
};
