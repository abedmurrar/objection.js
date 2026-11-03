'use strict';

// Raw knex with the same mysql2 driver: the floor that the ORMs build on.

const knexFactory = require('knex');
const { connection, personRow, nestedPerson, hundredRows, idCycler } = require('../common');

async function create() {
  const knex = knexFactory({ client: 'mysql2', connection, pool: { min: 1, max: 4 } });
  const nextId = idCycler();
  let n = 0;

  const groupBy = (rows, key) => {
    const map = new Map();
    for (const row of rows) {
      const list = map.get(row[key]);
      if (list) list.push(row);
      else map.set(row[key], [row]);
    }
    return map;
  };

  const scenarios = {
    'find by id': () => knex('person').where('id', nextId()).first(),
    'find 100 rows (where, order, limit)': () =>
      knex('person').where('age', '>', 30).orderBy('id').limit(100),
    'find 1000 rows': () => knex('person'),
    'insert 1 row': () => knex('person').insert(personRow(++n)),
    'batch insert 100 rows': () => knex('person').insert(hundredRows(++n)),
    'update by id': () =>
      knex('person')
        .where('id', nextId())
        .update({ age: 20 + (++n % 50) }),
    'delete by id (missing row)': () => knex('person').where('id', 0).delete(),
    'eager: 100 persons > pets > toys (separate queries)': async () => {
      const persons = await knex('person').where('id', '<=', 100);
      const pets = await knex('pet').whereIn(
        'ownerId',
        persons.map((p) => p.id),
      );
      const toys = await knex('toy').whereIn(
        'petId',
        pets.map((p) => p.id),
      );
      const toysByPet = groupBy(toys, 'petId');
      for (const pet of pets) pet.toys = toysByPet.get(pet.id) || [];
      const petsByOwner = groupBy(pets, 'ownerId');
      for (const person of persons) person.pets = petsByOwner.get(person.id) || [];
      return persons;
    },
    'eager: 100 persons > pets > toys (one query)': async () => {
      const rows = await knex('person')
        .leftJoin('pet', 'pet.ownerId', 'person.id')
        .leftJoin('toy', 'toy.petId', 'pet.id')
        .where('person.id', '<=', 100)
        .select(
          'person.id as id',
          'person.firstName as firstName',
          'person.lastName as lastName',
          'person.age as age',
          'pet.id as pet_id',
          'pet.ownerId as pet_ownerId',
          'pet.name as pet_name',
          'pet.species as pet_species',
          'toy.id as toy_id',
          'toy.petId as toy_petId',
          'toy.name as toy_name',
          'toy.price as toy_price',
        );
      const persons = new Map();
      const pets = new Map();
      for (const row of rows) {
        let person = persons.get(row.id);
        if (!person) {
          person = {
            id: row.id,
            firstName: row.firstName,
            lastName: row.lastName,
            age: row.age,
            pets: [],
          };
          persons.set(row.id, person);
        }
        if (row.pet_id !== null) {
          let pet = pets.get(row.pet_id);
          if (!pet) {
            pet = {
              id: row.pet_id,
              ownerId: row.pet_ownerId,
              name: row.pet_name,
              species: row.pet_species,
              toys: [],
            };
            pets.set(row.pet_id, pet);
            person.pets.push(pet);
          }
          if (row.toy_id !== null) {
            pet.toys.push({
              id: row.toy_id,
              petId: row.toy_petId,
              name: row.toy_name,
              price: row.toy_price,
            });
          }
        }
      }
      return [...persons.values()];
    },
    'transaction: insert + update': () =>
      knex.transaction(async (trx) => {
        const [id] = await trx('person').insert(personRow(++n));
        await trx('person').where('id', id).update({ age: 99 });
      }),
    'nested insert: person + 2 pets + 4 toys': () =>
      knex.transaction(async (trx) => {
        const { pets, ...person } = nestedPerson(++n);
        const [personId] = await trx('person').insert(person);
        for (const { toys, ...pet } of pets) {
          const [petId] = await trx('pet').insert({ ...pet, ownerId: personId });
          await trx('toy').insert(toys.map((toy) => ({ ...toy, petId })));
        }
      }),
  };

  return { scenarios, close: () => knex.destroy() };
}

module.exports = { create };
