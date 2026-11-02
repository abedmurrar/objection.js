'use strict';

// End-to-end scenarios on an in-memory SQLite database. The database's own
// time is included, so these show how much of a real query objection's
// changes are worth.

const Knex = require('knex');
const { defineModels, personRows, personGraph } = require('../fixtures');

async function createDatabase(objection, options) {
  const knex = Knex({
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  });

  await knex.schema
    .createTable('persons', (t) => {
      t.increments('id');
      t.string('firstName');
      t.string('lastName');
      t.integer('age');
      t.string('email');
      t.boolean('active');
      t.integer('momId');
      t.string('createdAt');
      t.string('updatedAt');
      t.float('score');
      t.text('address');
      t.text('settings');
    })
    .createTable('pets', (t) => {
      t.increments('id');
      t.integer('ownerId').index();
      t.string('name');
      t.string('species');
    })
    .createTable('toys', (t) => {
      t.increments('id');
      t.integer('petId').index();
      t.string('name');
      t.integer('price');
    })
    .createTable('movies', (t) => {
      t.increments('id');
      t.string('name');
    })
    .createTable('persons_movies', (t) => {
      t.integer('personId').index();
      t.integer('movieId');
    });

  const models = defineModels(objection, options);

  for (const model of Object.values(models)) {
    model.knex(knex);
  }

  return { knex, models };
}

async function seed(knex, personCount) {
  const people = personRows(personCount);
  const pets = [];
  const toys = [];
  const movies = [];
  const personsMovies = [];

  for (const person of people) {
    for (let i = 0; i < 3; ++i) {
      const petId = pets.length + 1;
      pets.push({ id: petId, ownerId: person.id, name: `Pet${petId}`, species: 'dog' });

      for (let j = 0; j < 2; ++j) {
        toys.push({ id: toys.length + 1, petId, name: `Toy${toys.length + 1}`, price: j });
      }
    }

    for (let i = 0; i < 2; ++i) {
      const movieId = movies.length + 1;
      movies.push({ id: movieId, name: `Movie${movieId}` });
      personsMovies.push({ personId: person.id, movieId });
    }
  }

  await knex.batchInsert('persons', people, 100);
  await knex.batchInsert('pets', pets, 100);
  await knex.batchInsert('toys', toys, 100);
  await knex.batchInsert('movies', movies, 100);
  await knex.batchInsert('persons_movies', personsMovies, 100);
}

module.exports = {
  'sqlite: find 1000 rows': async (objection) => {
    const { knex, models } = await createDatabase(objection);
    await seed(knex, 1000);

    return () => models.Person.query();
  },

  'sqlite: findById': async (objection) => {
    const { knex, models } = await createDatabase(objection);
    await seed(knex, 100);

    return () => models.Person.query().findById(50);
  },

  'sqlite: withGraphFetched [pets.toys, movies] x100': async (objection) => {
    const { knex, models } = await createDatabase(objection);
    await seed(knex, 100);

    return () => models.Person.query().withGraphFetched('[pets.toys, movies]');
  },

  'sqlite: withGraphJoined [pets.toys] x100': async (objection) => {
    const { knex, models } = await createDatabase(objection);
    await seed(knex, 100);

    return () => models.Person.query().withGraphJoined('pets.toys');
  },

  'sqlite: insertGraph 20 persons in a transaction (validated)': async (objection) => {
    const { models } = await createDatabase(objection, { schema: true });
    const graph = personGraph(20);

    return () =>
      objection.transaction(models.Person.knex(), (trx) =>
        models.Person.query(trx).insertGraph(graph),
      );
  },
};
