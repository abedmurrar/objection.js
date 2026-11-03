'use strict';

const { connection, personRow, nestedPerson, hundredRows, idCycler } = require('../common');

async function create() {
  const { drizzle } = await import('drizzle-orm/mysql2');
  const { mysqlTable, int, varchar } = await import('drizzle-orm/mysql-core');
  const { relations, eq, gt, lte, inArray, asc } = await import('drizzle-orm');
  const mysql = require('mysql2/promise');

  const person = mysqlTable('person', {
    id: int('id').primaryKey().autoincrement(),
    firstName: varchar('firstName', { length: 100 }),
    lastName: varchar('lastName', { length: 100 }),
    age: int('age'),
  });
  const pet = mysqlTable('pet', {
    id: int('id').primaryKey().autoincrement(),
    ownerId: int('ownerId'),
    name: varchar('name', { length: 100 }),
    species: varchar('species', { length: 50 }),
  });
  const toy = mysqlTable('toy', {
    id: int('id').primaryKey().autoincrement(),
    petId: int('petId'),
    name: varchar('name', { length: 100 }),
    price: int('price'),
  });
  const personRelations = relations(person, ({ many }) => ({ pets: many(pet) }));
  const petRelations = relations(pet, ({ one, many }) => ({
    owner: one(person, { fields: [pet.ownerId], references: [person.id] }),
    toys: many(toy),
  }));
  const toyRelations = relations(toy, ({ one }) => ({
    pet: one(pet, { fields: [toy.petId], references: [pet.id] }),
  }));

  const pool = mysql.createPool({ ...connection, connectionLimit: 4 });
  const schema = { person, pet, toy, personRelations, petRelations, toyRelations };
  const db = drizzle(pool, { schema, mode: 'default' });

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
    'find by id': () => db.query.person.findFirst({ where: eq(person.id, nextId()) }),
    'find 100 rows (where, order, limit)': () =>
      db.select().from(person).where(gt(person.age, 30)).orderBy(asc(person.id)).limit(100),
    'find 1000 rows': () => db.select().from(person),
    'insert 1 row': () => db.insert(person).values(personRow(++n)).$returningId(),
    'batch insert 100 rows': () => db.insert(person).values(hundredRows(++n)).$returningId(),
    'update by id': () =>
      db
        .update(person)
        .set({ age: 20 + (++n % 50) })
        .where(eq(person.id, nextId())),
    'delete by id (missing row)': () => db.delete(person).where(eq(person.id, 0)),
    // The relational API runs one query; separate queries are written by hand.
    'eager: 100 persons > pets > toys (separate queries)': async () => {
      const persons = await db.select().from(person).where(lte(person.id, 100));
      const pets = await db
        .select()
        .from(pet)
        .where(
          inArray(
            pet.ownerId,
            persons.map((p) => p.id),
          ),
        );
      const toys = await db
        .select()
        .from(toy)
        .where(
          inArray(
            toy.petId,
            pets.map((p) => p.id),
          ),
        );
      const toysByPet = groupBy(toys, 'petId');
      for (const p of pets) p.toys = toysByPet.get(p.id) || [];
      const petsByOwner = groupBy(pets, 'ownerId');
      for (const p of persons) p.pets = petsByOwner.get(p.id) || [];
      return persons;
    },
    'eager: 100 persons > pets > toys (one query)': () =>
      db.query.person.findMany({
        where: lte(person.id, 100),
        with: { pets: { with: { toys: true } } },
      }),
    'transaction: insert + update': () =>
      db.transaction(async (tx) => {
        const [{ id }] = await tx.insert(person).values(personRow(++n)).$returningId();
        await tx.update(person).set({ age: 99 }).where(eq(person.id, id));
      }),
    'nested insert: person + 2 pets + 4 toys': () =>
      db.transaction(async (tx) => {
        const { pets, ...row } = nestedPerson(++n);
        const [{ id: ownerId }] = await tx.insert(person).values(row).$returningId();
        for (const { toys, ...petRow } of pets) {
          const [{ id: petId }] = await tx
            .insert(pet)
            .values({ ...petRow, ownerId })
            .$returningId();
          await tx.insert(toy).values(toys.map((t) => ({ ...t, petId })));
        }
      }),
  };

  return { scenarios, close: () => pool.end() };
}

module.exports = { create };
