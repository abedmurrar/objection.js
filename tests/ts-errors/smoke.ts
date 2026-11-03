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

async () => {
  const person = new Person();
  const pets = [new Pet()];

  // @error: Argument of type '"petz"' is not assignable to parameter of type '"pets"'
  person.$setRelated('petz', pets);

  // @error: Property 'name' is missing in type 'Person' but required in type 'Pet'
  person.$setRelated('pets', [new Person()]);

  // @error: Argument of type '"petz"' is not assignable to parameter of type '"pets"'
  person.$appendRelated('petz', pets);
};
