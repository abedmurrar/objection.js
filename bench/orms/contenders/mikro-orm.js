'use strict';

const { connection, personRow, nestedPerson, hundredRows, idCycler } = require('../common');

async function create() {
  const { EntitySchema } = await import('@mikro-orm/core');
  const { MikroORM } = await import('@mikro-orm/mysql');

  const Person = new EntitySchema({
    name: 'Person',
    tableName: 'person',
    properties: {
      id: { type: 'number', primary: true, autoincrement: true },
      firstName: { type: 'string', fieldName: 'firstName' },
      lastName: { type: 'string', fieldName: 'lastName' },
      age: { type: 'number' },
      pets: { kind: '1:m', entity: () => Pet, mappedBy: 'owner' },
    },
  });
  const Pet = new EntitySchema({
    name: 'Pet',
    tableName: 'pet',
    properties: {
      id: { type: 'number', primary: true, autoincrement: true },
      owner: { kind: 'm:1', entity: () => Person, fieldName: 'ownerId', nullable: true },
      name: { type: 'string' },
      species: { type: 'string' },
      toys: { kind: '1:m', entity: () => Toy, mappedBy: 'pet' },
    },
  });
  const Toy = new EntitySchema({
    name: 'Toy',
    tableName: 'toy',
    properties: {
      id: { type: 'number', primary: true, autoincrement: true },
      pet: { kind: 'm:1', entity: () => Pet, fieldName: 'petId', nullable: true },
      name: { type: 'string' },
      price: { type: 'number' },
    },
  });

  const orm = await MikroORM.init({
    entities: [Person, Pet, Toy],
    dbName: connection.database,
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    debug: false,
    pool: { min: 1, max: 4 },
  });

  const nextId = idCycler();
  let n = 0;
  // A fork per operation, like one per request in an app.
  const em = () => orm.em.fork();

  const scenarios = {
    'find by id': () => em().findOne(Person, nextId()),
    'find 100 rows (where, order, limit)': () =>
      em().find(Person, { age: { $gt: 30 } }, { orderBy: { id: 'asc' }, limit: 100 }),
    'find 1000 rows': () => em().find(Person, {}),
    'insert 1 row': () => em().insert(Person, personRow(++n)),
    'batch insert 100 rows': () => em().insertMany(Person, hundredRows(++n)),
    'update by id': () => em().nativeUpdate(Person, { id: nextId() }, { age: 20 + (++n % 50) }),
    'delete by id (missing row)': () => em().nativeDelete(Person, { id: 0 }),
    'eager: 100 persons > pets > toys (separate queries)': () =>
      em().find(Person, { id: { $lte: 100 } }, { populate: ['pets.toys'], strategy: 'select-in' }),
    'eager: 100 persons > pets > toys (one query)': () =>
      em().find(Person, { id: { $lte: 100 } }, { populate: ['pets.toys'], strategy: 'joined' }),
    'transaction: insert + update': () =>
      em().transactional(async (tem) => {
        const id = await tem.insert(Person, personRow(++n));
        await tem.nativeUpdate(Person, { id }, { age: 99 });
      }),
    'nested insert: person + 2 pets + 4 toys': async () => {
      const fork = em();
      fork.create(Person, nestedPerson(++n));
      await fork.flush();
    },
  };

  return { scenarios, close: () => orm.close() };
}

module.exports = { create };
