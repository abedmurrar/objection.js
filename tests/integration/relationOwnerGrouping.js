const expect = require('expect.js');
const { Model } = require('../../');

// `orWhere` calls must never escape the relation owner condition or the id
// condition of `$query()`. If they did, these queries would read or modify
// the rows of other owners.
module.exports = (session) => {
  describe('owner and id conditions are not affected by orWhere', () => {
    const knex = session.knex;

    class Pet extends Model {
      static get tableName() {
        return 'og_pets';
      }
    }

    class Movie extends Model {
      static get tableName() {
        return 'og_movies';
      }
    }

    class Person extends Model {
      static get tableName() {
        return 'og_persons';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'og_persons.id', to: 'og_pets.ownerId' },
          },
          mom: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'og_persons.momId', to: 'og_persons.id' },
          },
          movies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: 'og_persons.id',
              through: { from: 'og_persons_movies.personId', to: 'og_persons_movies.movieId' },
              to: 'og_movies.id',
            },
          },
          firstMovie: {
            relation: Model.HasOneThroughRelation,
            modelClass: Movie,
            join: {
              from: 'og_persons.id',
              through: { from: 'og_persons_movies.personId', to: 'og_persons_movies.movieId' },
              to: 'og_movies.id',
            },
          },
        };
      }
    }

    before(async () => {
      await knex.schema
        .dropTableIfExists('og_persons_movies')
        .dropTableIfExists('og_pets')
        .dropTableIfExists('og_movies')
        .dropTableIfExists('og_persons');

      await knex.schema
        .createTable('og_persons', (table) => {
          table.integer('id').primary();
          table.integer('momId');
          table.string('name');
        })
        .createTable('og_pets', (table) => {
          table.integer('id').primary();
          table.integer('ownerId');
          table.string('name');
        })
        .createTable('og_movies', (table) => {
          table.integer('id').primary();
          table.string('name');
        })
        .createTable('og_persons_movies', (table) => {
          table.integer('personId');
          table.integer('movieId');
        });
    });

    after(async () => {
      await knex.schema
        .dropTableIfExists('og_persons_movies')
        .dropTableIfExists('og_pets')
        .dropTableIfExists('og_movies')
        .dropTableIfExists('og_persons');
    });

    beforeEach(async () => {
      await knex('og_persons_movies').delete();
      await knex('og_pets').delete();
      await knex('og_movies').delete();
      await knex('og_persons').delete();

      // Persons 1 and 2 have children with the same names.
      await knex('og_persons').insert([
        { id: 1, momId: 3, name: 'owner' },
        { id: 2, momId: 4, name: 'owner' },
        { id: 3, momId: null, name: 'a' },
        { id: 4, momId: null, name: 'b' },
      ]);
      await knex('og_pets').insert([
        { id: 1, ownerId: 1, name: 'a' },
        { id: 2, ownerId: 1, name: 'b' },
        { id: 3, ownerId: 2, name: 'a' },
        { id: 4, ownerId: 2, name: 'b' },
      ]);
      await knex('og_movies').insert([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
        { id: 3, name: 'a' },
        { id: 4, name: 'b' },
      ]);
      await knex('og_persons_movies').insert([
        { personId: 1, movieId: 1 },
        { personId: 1, movieId: 2 },
        { personId: 2, movieId: 3 },
        { personId: 2, movieId: 4 },
      ]);
    });

    const aOrB = (qb, table) => qb.where(`${table}.name`, 'a').orWhere(`${table}.name`, 'b');
    const owner = () => Person.fromJson({ id: 1, momId: 3 });
    const names = async (table) => {
      const rows = await knex(table).orderBy('id');
      return rows.map((it) => `${it.id}:${it.name}`);
    };
    const links = async () => {
      const rows = await knex('og_persons_movies').orderBy(['personId', 'movieId']);
      return rows.map((it) => `${it.personId}-${it.movieId}`);
    };

    describe('HasManyRelation', () => {
      it('find', async () => {
        const pets = await aOrB(owner().$relatedQuery('pets', knex), 'og_pets').orderBy('id');
        expect(pets.map((it) => it.id)).to.eql([1, 2]);
      });

      it('patch', async () => {
        await aOrB(owner().$relatedQuery('pets', knex), 'og_pets').patch({ name: 'x' });
        expect(await names('og_pets')).to.eql(['1:x', '2:x', '3:a', '4:b']);
      });

      it('delete', async () => {
        await aOrB(owner().$relatedQuery('pets', knex), 'og_pets').delete();
        expect(await names('og_pets')).to.eql(['3:a', '4:b']);
      });

      it('unrelate', async () => {
        await aOrB(owner().$relatedQuery('pets', knex), 'og_pets').unrelate();
        const rows = await knex('og_pets').orderBy('id');
        expect(rows.map((it) => it.ownerId)).to.eql([null, null, 2, 2]);
      });
    });

    describe('BelongsToOneRelation', () => {
      it('patch', async () => {
        await aOrB(owner().$relatedQuery('mom', knex), 'og_persons').patch({ name: 'x' });
        expect(await names('og_persons')).to.eql(['1:owner', '2:owner', '3:x', '4:b']);
      });

      it('delete', async () => {
        await aOrB(owner().$relatedQuery('mom', knex), 'og_persons').delete();
        expect(await names('og_persons')).to.eql(['1:owner', '2:owner', '4:b']);
      });
    });

    describe('ManyToManyRelation', () => {
      it('find', async () => {
        const movies = await aOrB(owner().$relatedQuery('movies', knex), 'og_movies').orderBy(
          'og_movies.id',
        );
        expect(movies.map((it) => it.id)).to.eql([1, 2]);
      });

      it('patch', async () => {
        await aOrB(owner().$relatedQuery('movies', knex), 'og_movies').patch({ name: 'x' });
        expect(await names('og_movies')).to.eql(['1:x', '2:x', '3:a', '4:b']);
      });

      it('delete', async () => {
        await aOrB(owner().$relatedQuery('movies', knex), 'og_movies').delete();
        expect(await names('og_movies')).to.eql(['3:a', '4:b']);
      });

      it('unrelate', async () => {
        await aOrB(owner().$relatedQuery('movies', knex), 'og_movies').unrelate();
        expect(await links()).to.eql(['2-3', '2-4']);
      });
    });

    describe('HasOneThroughRelation', () => {
      it('patch', async () => {
        await aOrB(owner().$relatedQuery('firstMovie', knex), 'og_movies').patch({ name: 'x' });
        expect(await names('og_movies')).to.eql(['1:x', '2:x', '3:a', '4:b']);
      });
    });

    describe('id conditions', () => {
      it('$query().patch()', async () => {
        await Person.fromJson({ id: 3 })
          .$query(knex)
          .where('name', 'a')
          .orWhere('name', 'b')
          .patch({ name: 'x' });

        expect(await names('og_persons')).to.eql(['1:owner', '2:owner', '3:x', '4:b']);
      });

      it('deleteById()', async () => {
        await Pet.query(knex).deleteById(1).where('name', 'a').orWhere('name', 'b');
        expect(await names('og_pets')).to.eql(['2:b', '3:a', '4:b']);
      });
    });
  });
};
