// Error message tests. See scripts/typings-errors.js.
import { Model } from '../../';
import type { Knex } from 'knex';

class Pet extends Model {
  name!: string;
}

class Person extends Model {
  firstName!: string;
  pets?: Pet[];
}

async () => {
  // @error: Property 'lastName' does not exist on type 'Row<Person>'
  (await Person.query())[0].lastName;

  // Relations that the query didn't load aren't in the result.
  // @error: Property 'pets' does not exist on type 'Row<Person>'
  (await Person.query())[0].pets;
};

(knex: Knex) => {
  // Setting the knex of a model class returns nothing.
  // @error: Type 'void' is not assignable to type 'Knex
  const k: Knex = Person.knex(knex);
};
