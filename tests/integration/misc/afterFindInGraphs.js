const { expect } = require('chai');
const { Model } = require('../../../');

// `useAfterFindInGraphs`: the static `afterFind()` hooks of related model
// classes decide what eager loading puts in the graph (ditojs/objection #1963).
module.exports = (session) => {
  describe('useAfterFindInGraphs (#1963)', () => {
    const knex = session.knex;
    let Person;
    let Pet;
    let Movie;

    before(async () => {
      await knex.schema.dropTableIfExists('afg_person_movie');
      await knex.schema.dropTableIfExists('afg_pet');
      await knex.schema.dropTableIfExists('afg_movie');
      await knex.schema.dropTableIfExists('afg_person');
      await knex.schema.createTable('afg_person', (t) => {
        t.integer('id').primary();
        t.string('name');
      });
      await knex.schema.createTable('afg_pet', (t) => {
        t.integer('id').primary();
        t.integer('ownerId');
        t.string('name');
        t.string('species');
      });
      await knex.schema.createTable('afg_movie', (t) => {
        t.integer('id').primary();
        t.string('name');
      });
      await knex.schema.createTable('afg_person_movie', (t) => {
        t.integer('personId');
        t.integer('movieId');
      });
    });

    after(async () => {
      await knex.schema.dropTableIfExists('afg_person_movie');
      await knex.schema.dropTableIfExists('afg_pet');
      await knex.schema.dropTableIfExists('afg_movie');
      await knex.schema.dropTableIfExists('afg_person');
    });

    beforeEach(async () => {
      Person = class Person extends Model {
        static tableName = 'afg_person';
        static get relationMappings() {
          return {
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: { from: 'afg_person.id', to: 'afg_pet.ownerId' },
            },
            movies: {
              relation: Model.ManyToManyRelation,
              modelClass: Movie,
              join: {
                from: 'afg_person.id',
                through: { from: 'afg_person_movie.personId', to: 'afg_person_movie.movieId' },
                to: 'afg_movie.id',
              },
            },
          };
        }
      };

      Pet = class Pet extends Model {
        static tableName = 'afg_pet';
        static get relationMappings() {
          return {
            owner: {
              relation: Model.BelongsToOneRelation,
              modelClass: Person,
              join: { from: 'afg_pet.ownerId', to: 'afg_person.id' },
            },
          };
        }
      };

      Movie = class Movie extends Model {
        static tableName = 'afg_movie';
      };

      for (const modelClass of [Person, Pet, Movie]) {
        modelClass.knex(knex);
        modelClass.useAfterFindInGraphs = true;
      }

      await knex('afg_person_movie').delete();
      await knex('afg_pet').delete();
      await knex('afg_movie').delete();
      await knex('afg_person').delete();
      await knex('afg_person').insert([
        { id: 1, name: 'Jennifer' },
        { id: 2, name: 'Brad' },
      ]);
      await knex('afg_pet').insert([
        { id: 1, ownerId: 1, name: 'Doggo', species: 'dog' },
        { id: 2, ownerId: 1, name: 'Cato', species: 'cat' },
      ]);
      await knex('afg_movie').insert([{ id: 1, name: 'Movie' }]);
      await knex('afg_person_movie').insert([{ personId: 1, movieId: 1 }]);
    });

    describe('withGraphFetched()', () => {
      it('should assign the related models that `afterFind()` returns', async () => {
        Pet.afterFind = ({ result }) => result.filter((pet) => pet.species === 'dog');
        Movie.afterFind = () => [];

        const people = await Person.query()
          .withGraphFetched('[pets, movies]')
          .orderBy('name', 'desc');

        expect(people.map((person) => person.pets.map((pet) => pet.name))).to.eql([['Doggo'], []]);
        expect(people.map((person) => person.movies)).to.eql([[], []]);
      });

      it('should keep the order of the related models that `afterFind()` returns', async () => {
        Pet.afterFind = ({ result }) => [...result].sort((a, b) => a.name.localeCompare(b.name));

        const person = await Person.query()
          .findById(1)
          .withGraphFetched('pets')
          .modifyGraph('pets', (builder) => builder.orderBy('name', 'desc'));

        expect(person.pets.map((pet) => pet.name)).to.eql(['Cato', 'Doggo']);
      });

      it('should assign null to to-one relations if `afterFind()` filters the model', async () => {
        Person.afterFind = ({ relation }) => (relation ? [] : undefined);

        const pet = await Pet.query().findOne({ name: 'Doggo' }).withGraphFetched('owner');
        expect(pet.owner).to.equal(null);
      });

      it('should throw if `afterFind()` returns other objects than the related models', async () => {
        Pet.afterFind = ({ result }) => result.map((pet) => ({ ...pet }));

        const err = await Person.query()
          .withGraphFetched('pets')
          .catch((err) => err);

        expect(err.message).to.equal(
          'Unable to assign the result to relation "pets" of Person: afterFind() and ' +
            'runAfter() can only return the related models that the query found, filtered ' +
            'or reordered.',
        );
      });

      it('should assign what `runAfter()` returns', async () => {
        const person = await Person.query()
          .findById(1)
          .withGraphFetched('pets')
          .modifyGraph('pets', (builder) =>
            builder.runAfter((pets) => pets.filter((pet) => pet.species === 'cat')),
          );

        expect(person.pets.map((pet) => pet.name)).to.eql(['Cato']);
      });

      it('should ignore what `afterFind()` returns without `useAfterFindInGraphs`', async () => {
        Pet.useAfterFindInGraphs = false;
        Pet.afterFind = ({ result }) => result.filter((pet) => pet.species === 'dog');

        const person = await Person.query().findById(1).withGraphFetched('pets');
        expect(person.pets.map((pet) => pet.name).sort()).to.eql(['Cato', 'Doggo']);
      });
    });

    describe('withGraphJoined()', () => {
      it('should call `afterFind()` of the joined relations bottom-up', async () => {
        const calls = [];
        const spy = (name) => (args) => {
          calls.push({ name, result: args.result, relation: args.relation });
        };

        Person.afterFind = spy('people');
        Pet.afterFind = spy('pets');
        Movie.afterFind = spy('movies');

        const people = await Person.query()
          .withGraphJoined('[pets.owner, movies]')
          .orderBy('afg_person.name', 'desc');

        const [jennifer, brad] = people;
        const pets = jennifer.pets;

        // The root's hook runs first, from the find query, then the joined
        // relations from the deepest one up.
        expect(calls.map((it) => it.name)).to.eql(['people', 'movies', 'people', 'pets']);
        expect(calls[1].result).to.eql(jennifer.movies);
        expect(calls[2].result).to.eql(pets.map((pet) => pet.owner));
        expect(calls[3].result).to.eql(pets);
        expect(brad.pets).to.eql([]);
      });

      it('should pass the relation and the owners', async () => {
        let args = null;
        Pet.afterFind = (it) => {
          args = it;
        };

        const people = await Person.query().withGraphJoined('pets');

        expect(args.relation).to.equal(Person.getRelation('pets'));
        expect(args.items).to.eql(people);
        expect(args.inputItems).to.eql([]);
        expect(() => args.asFindQuery()).to.throw(
          'asFindQuery() is not available for relations fetched with withGraphJoined().',
        );
        expect(() => args.cancelQuery()).to.throw(
          'cancelQuery() is not available for relations fetched with withGraphJoined().',
        );
      });

      it('should assign the related models that `afterFind()` returns', async () => {
        Pet.afterFind = ({ result }) => result.filter((pet) => pet.species === 'dog');
        Person.afterFind = ({ relation }) => (relation ? [] : undefined);

        const person = await Person.query().findById(1).withGraphJoined('pets.owner');

        expect(person.pets.map((pet) => pet.name)).to.eql(['Doggo']);
        expect(person.pets[0].owner).to.equal(null);
      });

      it('should keep the order of the related models that `afterFind()` returns', async () => {
        Pet.afterFind = ({ result }) => [...result].sort((a, b) => a.name.localeCompare(b.name));

        const person = await Person.query()
          .findById(1)
          .withGraphJoined('pets')
          .orderBy('pets.name', 'desc');

        expect(person.pets.map((pet) => pet.name)).to.eql(['Cato', 'Doggo']);
      });

      it('should throw if `afterFind()` returns other objects than the related models', async () => {
        Pet.afterFind = ({ result }) => result.map((pet) => ({ ...pet }));

        const err = await Person.query()
          .withGraphJoined('pets')
          .catch((err) => err);

        expect(err.message).to.equal(
          'Unable to assign the result of Pet.afterFind() to the relation "pets" of Person: ' +
            'return the models you got, filtered or reordered.',
        );
      });

      it("shouldn't call the hooks of related classes without `useAfterFindInGraphs`", async () => {
        Pet.useAfterFindInGraphs = false;
        let called = false;
        Pet.afterFind = () => {
          called = true;
        };

        await Person.query().withGraphJoined('pets');
        expect(called).to.equal(false);
      });
    });
  });
};
