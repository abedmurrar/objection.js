'use strict';

// The schema, data and connection that every contender uses. The tables use
// the property names as column names, so no ORM pays for name mapping.

const knexFactory = require('knex');

const DATABASE = process.env.BENCH_DB || 'bench_orms';

const connection = {
  host: process.env.BENCH_HOST || '127.0.0.1',
  port: Number(process.env.BENCH_PORT || 3306),
  user: process.env.BENCH_USER || 'root',
  password: process.env.BENCH_PASSWORD || '',
  database: DATABASE,
};

const PERSONS = 1000;
const PETS_PER_PERSON = 2;
const TOYS_PER_PET = 2;

// The rows of a person with its pets and toys, for the nested insert scenario.
function nestedPerson(i) {
  return {
    firstName: `Nested ${i}`,
    lastName: 'Person',
    age: 30,
    pets: [0, 1].map((p) => ({
      name: `Pet ${p}`,
      species: 'dog',
      toys: [0, 1].map((t) => ({ name: `Toy ${t}`, price: 10 + t })),
    })),
  };
}

function personRow(i) {
  return { firstName: `First ${i}`, lastName: `Last ${i % 50}`, age: 18 + (i % 60) };
}

async function createDatabase() {
  const knex = knexFactory({
    client: 'mysql2',
    connection: { ...connection, database: undefined },
  });
  try {
    await knex.raw('CREATE DATABASE IF NOT EXISTS ??', [DATABASE]);
  } finally {
    await knex.destroy();
  }
}

// Recreates the tables with the same data, so every run starts from the same state.
async function seed() {
  await createDatabase();
  const knex = knexFactory({ client: 'mysql2', connection });

  try {
    await knex.schema.dropTableIfExists('toy');
    await knex.schema.dropTableIfExists('pet');
    await knex.schema.dropTableIfExists('person');

    await knex.schema.createTable('person', (t) => {
      t.increments('id').primary();
      t.string('firstName', 100);
      t.string('lastName', 100);
      t.integer('age');
      t.index('age');
    });
    await knex.schema.createTable('pet', (t) => {
      t.increments('id').primary();
      t.integer('ownerId').unsigned().index();
      t.string('name', 100);
      t.string('species', 50);
    });
    await knex.schema.createTable('toy', (t) => {
      t.increments('id').primary();
      t.integer('petId').unsigned().index();
      t.string('name', 100);
      t.integer('price');
    });

    const persons = [];
    const pets = [];
    const toys = [];

    for (let i = 1; i <= PERSONS; ++i) {
      persons.push({ id: i, ...personRow(i) });

      for (let p = 0; p < PETS_PER_PERSON; ++p) {
        const petId = (i - 1) * PETS_PER_PERSON + p + 1;
        pets.push({ id: petId, ownerId: i, name: `Pet ${petId}`, species: p ? 'cat' : 'dog' });

        for (let t = 0; t < TOYS_PER_PET; ++t) {
          const toyId = (petId - 1) * TOYS_PER_PET + t + 1;
          toys.push({ id: toyId, petId, name: `Toy ${toyId}`, price: (toyId % 20) + 1 });
        }
      }
    }

    await knex.batchInsert('person', persons, 500);
    await knex.batchInsert('pet', pets, 500);
    await knex.batchInsert('toy', toys, 500);
  } finally {
    await knex.destroy();
  }
}

// The scenarios, in display order. Every contender implements the ones it
// supports, under these names.
const SCENARIOS = [
  'find by id',
  'find 100 rows (where, order, limit)',
  'find 1000 rows',
  'insert 1 row',
  'batch insert 100 rows',
  'update by id',
  'delete by id (missing row)',
  'eager: 100 persons > pets > toys (separate queries)',
  'eager: 100 persons > pets > toys (one query)',
  'transaction: insert + update',
  'nested insert: person + 2 pets + 4 toys',
];

// Ids that `find by id` and `update by id` cycle through.
function idCycler(max = PERSONS) {
  let i = 0;
  return () => (i++ % max) + 1;
}

function hundredRows(i) {
  const rows = new Array(100);
  for (let r = 0; r < 100; ++r) {
    rows[r] = personRow(i * 100 + r);
  }
  return rows;
}

module.exports = {
  connection,
  DATABASE,
  PERSONS,
  SCENARIOS,
  seed,
  personRow,
  nestedPerson,
  hundredRows,
  idCycler,
};
