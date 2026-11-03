'use strict';

const { connection, personRow, nestedPerson, hundredRows, idCycler } = require('../common');

async function create() {
  const { Kysely, MysqlDialect } = await import('kysely');
  const { jsonArrayFrom } = await import('kysely/helpers/mysql');
  const mysql = require('mysql2');

  const db = new Kysely({
    dialect: new MysqlDialect({ pool: mysql.createPool({ ...connection, connectionLimit: 4 }) }),
  });

  const groupBy = (rows, key) => {
    const map = new Map();
    for (const row of rows) {
      const list = map.get(row[key]);
      if (list) list.push(row);
      else map.set(row[key], [row]);
    }
    return map;
  };

  const nextId = idCycler();
  let n = 0;

  const scenarios = {
    'find by id': () =>
      db.selectFrom('person').selectAll().where('id', '=', nextId()).executeTakeFirst(),
    'find 100 rows (where, order, limit)': () =>
      db.selectFrom('person').selectAll().where('age', '>', 30).orderBy('id').limit(100).execute(),
    'find 1000 rows': () => db.selectFrom('person').selectAll().execute(),
    'insert 1 row': () => db.insertInto('person').values(personRow(++n)).executeTakeFirst(),
    'batch insert 100 rows': () => db.insertInto('person').values(hundredRows(++n)).execute(),
    'update by id': () =>
      db
        .updateTable('person')
        .set({ age: 20 + (++n % 50) })
        .where('id', '=', nextId())
        .execute(),
    'delete by id (missing row)': () => db.deleteFrom('person').where('id', '=', 0).execute(),
    'eager: 100 persons > pets > toys (separate queries)': async () => {
      const persons = await db.selectFrom('person').selectAll().where('id', '<=', 100).execute();
      const pets = await db
        .selectFrom('pet')
        .selectAll()
        .where(
          'ownerId',
          'in',
          persons.map((p) => p.id),
        )
        .execute();
      const toys = await db
        .selectFrom('toy')
        .selectAll()
        .where(
          'petId',
          'in',
          pets.map((p) => p.id),
        )
        .execute();
      const toysByPet = groupBy(toys, 'petId');
      for (const p of pets) p.toys = toysByPet.get(p.id) || [];
      const petsByOwner = groupBy(pets, 'ownerId');
      for (const p of persons) p.pets = petsByOwner.get(p.id) || [];
      return persons;
    },
    'eager: 100 persons > pets > toys (one query)': () =>
      db
        .selectFrom('person')
        .selectAll('person')
        .select((eb) => [
          jsonArrayFrom(
            eb
              .selectFrom('pet')
              .selectAll('pet')
              .select((eb2) => [
                jsonArrayFrom(
                  eb2.selectFrom('toy').selectAll('toy').whereRef('toy.petId', '=', 'pet.id'),
                ).as('toys'),
              ])
              .whereRef('pet.ownerId', '=', 'person.id'),
          ).as('pets'),
        ])
        .where('person.id', '<=', 100)
        .execute(),
    'transaction: insert + update': () =>
      db.transaction().execute(async (trx) => {
        const { insertId } = await trx
          .insertInto('person')
          .values(personRow(++n))
          .executeTakeFirst();
        await trx
          .updateTable('person')
          .set({ age: 99 })
          .where('id', '=', Number(insertId))
          .execute();
      }),
    'nested insert: person + 2 pets + 4 toys': () =>
      db.transaction().execute(async (trx) => {
        const { pets, ...row } = nestedPerson(++n);
        const { insertId: ownerId } = await trx.insertInto('person').values(row).executeTakeFirst();
        for (const { toys, ...petRow } of pets) {
          const { insertId: petId } = await trx
            .insertInto('pet')
            .values({ ...petRow, ownerId: Number(ownerId) })
            .executeTakeFirst();
          await trx
            .insertInto('toy')
            .values(toys.map((t) => ({ ...t, petId: Number(petId) })))
            .execute();
        }
      }),
  };

  return { scenarios, close: () => db.destroy() };
}

module.exports = { create };
