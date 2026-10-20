// Error message tests. See scripts/typings-errors.js.
import { Model, QueryBuilder } from '../../';

class Pet extends Model {
  name!: string;

  static modifiers = {
    onlyDogs(query: QueryBuilder<Pet>) {
      query.where('species', 'dog');
    },
  };
}

class Person extends Model {
  firstName!: string;

  static relationMappings = () => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'persons.id', to: 'pets.ownerId' },
    },
  });
}

// @error: Argument of type '"onlyCats"' is not assignable to parameter of type '"onlyCats" & { '~error': "Unknown modifier \"onlyCats\""; }'.
Pet.query().modify('onlyCats');

// @error: Argument of type '"pets(onlyCats)"' is not assignable to parameter of type '"Unknown modifier \"onlyCats\" for \"pets\""'.
Person.query().withGraphFetched('pets(onlyCats)');
