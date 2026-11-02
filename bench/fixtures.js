'use strict';

// Models and a mocked knex shared by the scenarios. Everything takes the
// objection module as an argument, so the same scenarios can run against
// another checkout (see `--lib` in run.js).

const Knex = require('knex');
const mockKnex = require('../testUtils/mockKnex');

const PETS_PER_OWNER = 3;
const TOYS_PER_PET = 2;
const MOVIES_PER_PERSON = 2;

function defineModels(objection, { schema = false, snakeCase = false } = {}) {
  const { Model, snakeCaseMappers } = objection;

  class BaseModel extends Model {
    static get columnNameMappers() {
      return snakeCase ? snakeCaseMappers() : null;
    }
  }

  class Person extends BaseModel {
    static get tableName() {
      return 'persons';
    }

    static get jsonAttributes() {
      return ['address', 'settings'];
    }

    static get jsonSchema() {
      if (!schema) {
        return null;
      }

      return {
        type: 'object',
        required: ['firstName'],
        properties: {
          id: { type: 'integer' },
          firstName: { type: 'string', minLength: 1, maxLength: 255 },
          lastName: { type: 'string', maxLength: 255 },
          age: { type: 'integer', minimum: 0 },
          email: { type: 'string', format: 'email' },
          active: { type: 'boolean', default: true },
          address: {
            type: 'object',
            properties: { street: { type: 'string' }, city: { type: 'string' } },
          },
        },
      };
    }

    static get relationMappings() {
      return {
        pets: {
          relation: Model.HasManyRelation,
          modelClass: Pet,
          join: { from: 'persons.id', to: 'pets.ownerId' },
        },
        movies: {
          relation: Model.ManyToManyRelation,
          modelClass: Movie,
          join: {
            from: 'persons.id',
            through: { from: 'persons_movies.personId', to: 'persons_movies.movieId' },
            to: 'movies.id',
          },
        },
      };
    }
  }

  class Pet extends BaseModel {
    static get tableName() {
      return 'pets';
    }

    static get jsonSchema() {
      if (!schema) {
        return null;
      }

      return {
        type: 'object',
        required: ['name'],
        properties: {
          id: { type: 'integer' },
          ownerId: { type: ['integer', 'null'] },
          name: { type: 'string', minLength: 1 },
          species: { type: 'string', default: 'dog' },
        },
      };
    }

    static get relationMappings() {
      return {
        owner: {
          relation: Model.BelongsToOneRelation,
          modelClass: Person,
          join: { from: 'pets.ownerId', to: 'persons.id' },
        },
        toys: {
          relation: Model.HasManyRelation,
          modelClass: Toy,
          join: { from: 'pets.id', to: 'toys.petId' },
        },
      };
    }
  }

  class Toy extends BaseModel {
    static get tableName() {
      return 'toys';
    }
  }

  class Movie extends BaseModel {
    static get tableName() {
      return 'movies';
    }
  }

  return { BaseModel, Person, Pet, Toy, Movie };
}

function personRow(id, snakeCase = false) {
  const row = {
    id,
    firstName: `First${id}`,
    lastName: `Last${id}`,
    age: 20 + (id % 50),
    email: `person${id}@example.com`,
    active: id % 2 === 0,
    momId: id > 1 ? id - 1 : null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    score: id * 1.5,
    address: JSON.stringify({ street: `${id} Main St`, city: 'Helsinki', zip: '00100' }),
    settings: JSON.stringify({ theme: 'dark', tags: ['a', 'b', 'c'], notify: { email: true } }),
  };

  if (!snakeCase) {
    return row;
  }

  const snake = {};

  for (const key of Object.keys(row)) {
    snake[key.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())] = row[key];
  }

  return snake;
}

function personRows(count, snakeCase = false) {
  const rows = [];

  for (let i = 1; i <= count; ++i) {
    rows.push(personRow(i, snakeCase));
  }

  return rows;
}

// Answers queries the way a database would for the fixture models:
// `persons` returns `personCount` rows, `pets` returns PETS_PER_OWNER pets for
// each owner id in the bindings and so on. Inserts return the ids.
function createMockKnex(
  objection,
  { personCount = 1, rows = null, client = null, latencyMs = 0 } = {},
) {
  // sql-check.js runs the scenarios with each dialect and records the queries.
  const knex = Knex({
    client: client || process.env.BENCH_CLIENT || 'pg',
    useNullAsDefault: true,
  });
  let nextId = 1;

  const mock = mockKnex(knex, function (_mock, _oldImpl, args) {
    if (global.benchRecordQuery) {
      const { sql, bindings } = this.toSQL();
      global.benchRecordQuery({ sql, bindings });
    }

    const result = respond(this);

    if (latencyMs) {
      // The time a query takes on the database and over the network.
      return new Promise((resolve) => setTimeout(() => resolve(result), latencyMs)).then(...args);
    }

    return Promise.resolve(result).then(...args);
  });

  function respond(builder) {
    if (builder.isRawInstance) {
      // `select @@auto_increment_increment` of MySQL batch inserts.
      return [[{ increment: 1 }], []];
    }

    const method = builder._method;
    const table = builder._single.table;
    const dialect = knex.client.dialect;

    if (method === 'insert') {
      const insert = builder._single.insert;
      const count = Array.isArray(insert) ? insert.length : 1;
      const returning = builder._single.returning !== undefined;
      const firstId = nextId;
      nextId += count;

      // Like the drivers: MySQL returns the id of the first row, SQLite the id
      // of the last one unless `returning` is used.
      if (dialect === 'mysql') {
        return [firstId];
      }

      if (dialect === 'sqlite3' && !returning) {
        return [firstId + count - 1];
      }

      const ids = [];

      for (let i = 0; i < count; ++i) {
        ids.push({ id: firstId + i });
      }

      return ids;
    }

    if (method === 'update' || method === 'del') {
      return 1;
    }

    if (method === 'columnInfo') {
      return columnInfo(table);
    }

    if (rows) {
      return rows();
    }

    const bindings = builder.toSQL().bindings;

    if (table === 'persons') {
      // New objects for every query, like a driver returns, without the cost
      // of generating the rows.
      return cachedPersonRows(personCount).map((row) => ({ ...row }));
    }

    if (table === 'pets') {
      return childRows(bindings, PETS_PER_OWNER, (ownerId, i, id) => ({
        id,
        ownerId,
        name: `Pet${id}`,
        species: i % 2 ? 'cat' : 'dog',
      }));
    }

    if (table === 'toys') {
      return childRows(bindings, TOYS_PER_PET, (petId, i, id) => ({
        id,
        petId,
        name: `Toy${id}`,
        price: i * 10,
      }));
    }

    if (table === 'movies') {
      return childRows(bindings, MOVIES_PER_PERSON, (personId, i, id) => ({
        id,
        name: `Movie${id}`,
        objectiontmpjoin0: personId,
      }));
    }

    return [];
  }

  return mock;
}

const personRowCache = new Map();

function cachedPersonRows(count) {
  if (!personRowCache.has(count)) {
    personRowCache.set(count, personRows(count));
  }

  return personRowCache.get(count);
}

const COLUMNS = {
  persons: Object.keys(personRow(1)),
  pets: ['id', 'ownerId', 'name', 'species'],
  toys: ['id', 'petId', 'name', 'price'],
  movies: ['id', 'name'],
};

function columnInfo(table) {
  const info = {};

  for (const column of COLUMNS[table] || []) {
    info[column] = { type: 'text', maxLength: null, nullable: true, defaultValue: null };
  }

  return info;
}

function childRows(parentIds, perParent, create) {
  const rows = [];
  let id = 1;

  for (const parentId of parentIds) {
    if (typeof parentId !== 'number') {
      continue;
    }

    for (let i = 0; i < perParent; ++i) {
      rows.push(create(parentId, i, id++));
    }
  }

  return rows;
}

// The flat rows of a `withGraphJoined('[pets.toys]')` query.
function joinedRows(personCount) {
  const rows = [];
  let petId = 1;
  let toyId = 1;

  for (let p = 1; p <= personCount; ++p) {
    const person = personRow(p);

    for (let i = 0; i < PETS_PER_OWNER; ++i, ++petId) {
      for (let j = 0; j < TOYS_PER_PET; ++j, ++toyId) {
        const row = {};

        for (const key of Object.keys(person)) {
          row[key] = person[key];
        }

        row['pets:id'] = petId;
        row['pets:ownerId'] = p;
        row['pets:name'] = `Pet${petId}`;
        row['pets:species'] = 'dog';
        row['pets:toys:id'] = toyId;
        row['pets:toys:petId'] = petId;
        row['pets:toys:name'] = `Toy${toyId}`;
        row['pets:toys:price'] = j * 10;
        rows.push(row);
      }
    }
  }

  return rows;
}

function personGraph(count, petsPerPerson = 2) {
  const graph = [];

  for (let i = 1; i <= count; ++i) {
    const pets = [];

    for (let j = 0; j < petsPerPerson; ++j) {
      pets.push({ name: `Pet${i}-${j}`, species: 'dog' });
    }

    graph.push({
      firstName: `First${i}`,
      lastName: `Last${i}`,
      age: 30,
      email: `person${i}@example.com`,
      address: { street: `${i} Main St`, city: 'Helsinki' },
      pets,
    });
  }

  return graph;
}

module.exports = {
  defineModels,
  createMockKnex,
  personRow,
  personRows,
  joinedRows,
  personGraph,
};
