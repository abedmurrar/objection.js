'use strict';

// objection.js: this checkout (`--lib`), or a published version. They share the
// API, so the same models and scenarios run on each.

const path = require('node:path');
const knexFactory = require('knex');
const mysql2 = require('mysql2');
const { connection, personRow, nestedPerson, hundredRows, idCycler } = require('../common');

async function load(variant, lib) {
  if (variant === 'fork') {
    return require(path.resolve(lib));
  }

  // objection 4.x is ESM-only.
  const mod = await import(variant);
  return mod.default && mod.default.Model ? mod.default : mod;
}

async function create({ variant, lib, nativePool }) {
  const { Model } = await load(variant, lib);
  const { knex, close } = createKnex(nativePool);

  class Toy extends Model {
    static tableName = 'toy';
  }

  class Pet extends Model {
    static tableName = 'pet';
    static relationMappings = {
      toys: {
        relation: Model.HasManyRelation,
        modelClass: Toy,
        join: { from: 'pet.id', to: 'toy.petId' },
      },
    };
  }

  class Person extends Model {
    static tableName = 'person';
    static relationMappings = {
      pets: {
        relation: Model.HasManyRelation,
        modelClass: Pet,
        join: { from: 'person.id', to: 'pet.ownerId' },
      },
    };
  }

  Model.knex(knex);

  const nextId = idCycler();
  let n = 0;

  const scenarios = {
    'find by id': () => Person.query().findById(nextId()),
    'find 100 rows (where, order, limit)': () =>
      Person.query().where('age', '>', 30).orderBy('id').limit(100),
    'find 1000 rows': () => Person.query(),
    'insert 1 row': () => Person.query().insert(personRow(++n)),
    'batch insert 100 rows': () => Person.query().insert(hundredRows(++n)),
    'update by id': () =>
      Person.query()
        .findById(nextId())
        .patch({ age: 20 + (++n % 50) }),
    'delete by id (missing row)': () => Person.query().deleteById(0),
    'eager: 100 persons > pets > toys (separate queries)': () =>
      Person.query().where('id', '<=', 100).withGraphFetched('pets.toys'),
    'eager: 100 persons > pets > toys (one query)': () =>
      Person.query().where('person.id', '<=', 100).withGraphJoined('pets.toys'),
    'transaction: insert + update': () =>
      Person.transaction(async (trx) => {
        const person = await Person.query(trx).insert(personRow(++n));
        await person.$query(trx).patch({ age: 99 });
      }),
    'nested insert: person + 2 pets + 4 toys': () =>
      Person.transaction((trx) => Person.query(trx).insertGraph(nestedPerson(++n))),
  };

  // Batch inserts return ids on MySQL only in this fork; objection 3.1.5 and
  // 4.4.2 throw for multi-row inserts on MySQL.
  if (variant !== 'fork') {
    scenarios['batch insert 100 rows'] = undefined;
  }

  return { scenarios, close };
}

// knex's own pool (tarn), or with `nativePool` mysql2's pool through knex's
// `connectionPool` option, the way kysely uses it. Both hold up to 4
// connections.
function createKnex(nativePool) {
  if (!nativePool) {
    const knex = knexFactory({ client: 'mysql2', connection, pool: { min: 1, max: 4 } });
    return { knex, close: () => knex.destroy() };
  }

  const pool = mysql2.createPool({ ...connection, connectionLimit: 4 });
  const knex = knexFactory({ client: 'mysql2', version: '8.4', connectionPool: pool });

  // knex doesn't end a pool it was given.
  return { knex, close: () => knex.destroy().then(() => pool.end()) };
}

module.exports = { create };
