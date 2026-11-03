'use strict';

require('reflect-metadata');
const { DataSource, EntitySchema, MoreThan, LessThanOrEqual } = require('typeorm');
const { connection, personRow, nestedPerson, hundredRows, idCycler } = require('../common');

async function create() {
  const PersonSchema = new EntitySchema({
    name: 'Person',
    tableName: 'person',
    columns: {
      id: { type: Number, primary: true, generated: true },
      firstName: { type: String },
      lastName: { type: String },
      age: { type: Number },
    },
    relations: {
      pets: { type: 'one-to-many', target: 'Pet', inverseSide: 'owner', cascade: ['insert'] },
    },
  });
  const PetSchema = new EntitySchema({
    name: 'Pet',
    tableName: 'pet',
    columns: {
      id: { type: Number, primary: true, generated: true },
      ownerId: { type: Number, nullable: true },
      name: { type: String },
      species: { type: String },
    },
    relations: {
      owner: {
        type: 'many-to-one',
        target: 'Person',
        joinColumn: { name: 'ownerId' },
        createForeignKeyConstraints: false,
      },
      toys: { type: 'one-to-many', target: 'Toy', inverseSide: 'pet', cascade: ['insert'] },
    },
  });
  const ToySchema = new EntitySchema({
    name: 'Toy',
    tableName: 'toy',
    columns: {
      id: { type: Number, primary: true, generated: true },
      petId: { type: Number, nullable: true },
      name: { type: String },
      price: { type: Number },
    },
    relations: {
      pet: {
        type: 'many-to-one',
        target: 'Pet',
        joinColumn: { name: 'petId' },
        createForeignKeyConstraints: false,
      },
    },
  });

  const ds = new DataSource({
    type: 'mysql',
    connectorPackage: 'mysql2',
    host: connection.host,
    port: connection.port,
    username: connection.user,
    password: connection.password,
    database: connection.database,
    entities: [PersonSchema, PetSchema, ToySchema],
    synchronize: false,
    logging: false,
    poolSize: 4,
  });
  await ds.initialize();

  const persons = ds.getRepository('Person');
  const nextId = idCycler();
  let n = 0;

  const scenarios = {
    'find by id': () => persons.findOneBy({ id: nextId() }),
    'find 100 rows (where, order, limit)': () =>
      persons.find({ where: { age: MoreThan(30) }, order: { id: 'ASC' }, take: 100 }),
    'find 1000 rows': () => persons.find(),
    'insert 1 row': () => persons.insert(personRow(++n)),
    'batch insert 100 rows': () => persons.insert(hundredRows(++n)),
    'update by id': () => persons.update({ id: nextId() }, { age: 20 + (++n % 50) }),
    'delete by id (missing row)': () => persons.delete({ id: 0 }),
    'eager: 100 persons > pets > toys (separate queries)': () =>
      persons.find({
        where: { id: LessThanOrEqual(100) },
        relations: { pets: { toys: true } },
        relationLoadStrategy: 'query',
      }),
    'eager: 100 persons > pets > toys (one query)': () =>
      persons.find({
        where: { id: LessThanOrEqual(100) },
        relations: { pets: { toys: true } },
        relationLoadStrategy: 'join',
      }),
    'transaction: insert + update': () =>
      ds.transaction(async (em) => {
        const result = await em.insert('Person', personRow(++n));
        await em.update('Person', { id: result.identifiers[0].id }, { age: 99 });
      }),
    'nested insert: person + 2 pets + 4 toys': () =>
      ds.transaction((em) => em.save('Person', nestedPerson(++n))),
  };

  return { scenarios, close: () => ds.destroy() };
}

module.exports = { create };
