// Error message tests. See scripts/typings-errors.js.
import { Model, QueryBuilder } from '../../';

class Toy extends Model {
  id!: number;
}

class Pet extends Model {
  name!: string;
  toys?: Toy[];
}

class Person extends Model {
  firstName!: string;
  pets?: Pet[];
  mom?: Person | null;
}

function forPersons(query: QueryBuilder<Person>) {
  query.orderBy('id');
}

// @error: Argument of type '"pet"' is not assignable to parameter of type '"Unknown relation \"pet\""'.
Person.query().withGraphFetched('pet');

// @error: parameter of type '"Unknown relation \"toyz\" at \"mom.pets\""'.
Person.query().withGraphFetched('[pets, mom.pets.toyz]');

// @error: parameter of type '"Unknown relation \"toyz\" at \"animals\""'.
Person.query().withGraphFetched('pets as animals.toyz');

// @error: parameter of type '"Missing \"]\" in relation expression"'.
Person.query().withGraphFetched('[pets, mom');

// @error: parameter of type '"Unexpected \"]\" in relation expression"'.
Person.query().withGraphFetched('pets]');

// @error: parameter of type '"Unknown relation \"toyz\" at \"pets\""'.
Person.query().withGraphFetched({ pets: { toyz: true } });

async () => {
  const people = await Person.query().withGraphFetched('pets');

  // @error: Property 'toys' does not exist on type 'Row<Pet>'.
  people[0].pets[0].toys;

  // @error: Argument of type '"pet"' is not assignable to parameter of type '"Unknown relation \"pet\""'.
  Person.query().withGraphFetched('pets').modifyGraph('pet', 'orderByName');
};
