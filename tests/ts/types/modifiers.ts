import { Model, ModelInstance, ModelRow, Modifiers, QueryBuilder } from '../../../';
import { expectType } from '../_utils/expect';

// Named modifiers are checked against the static `modifiers` of the model, when
// their names can be known: an object without a type annotation, or a getter.

class Pet extends Model {
  static tableName = 'pets';

  id!: number;
  name!: string;
  species!: string;

  static modifiers = {
    onlyDogs(query: QueryBuilder<Pet>) {
      query.where('species', 'dog');
    },
    byName(query: QueryBuilder<Pet>, name: string) {
      query.where('name', name);
    },
  };
}

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;

  static get modifiers() {
    return {
      orderByName(query: QueryBuilder<Person>) {
        query.orderBy('firstName');
      },
    };
  }

  static relationMappings = () => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'persons.id', to: 'pets.ownerId' },
    },
  });
}

// Models whose `modifiers` have the type `Modifiers` aren't checked.
class Toy extends Model {
  static tableName = 'toys';

  id!: number;

  static modifiers: Modifiers = {};
}

type PetModel = ModelInstance<typeof Pet>;

async () => {
  Pet.query().modify('onlyDogs');
  Pet.query().modify('byName', 'Fluffy');
  Person.query().modify('orderByName');
  Pet.query().modify(['onlyDogs', 'byName'], 'Fluffy');
  Pet.query().modify({ species: 'dog' });
  Toy.query().modify('anything', 1, 2);

  // @ts-expect-error
  Pet.query().modify('onlyCats');
  // @ts-expect-error the arguments are typed by the modifier
  Pet.query().modify('byName', 1);
  // @ts-expect-error
  Pet.query().modify(['onlyDogs', 'onlyCats']);

  // Named modifiers may load relations the types can't see. Pet has none.
  expectType<ModelRow<PetModel>[]>()(await Pet.query().modify('onlyDogs'));

  // Named modifiers added with `modifiers()`, or by modifiers the types can't
  // see, aren't known.
  Pet.query()
    .modifiers({ onlyCats: (query) => query.where('species', 'cat') })
    .modify('onlyCats');
  Pet.query()
    .modify((query) => {
      query.modifiers({ onlyCats: (query) => query.where('species', 'cat') });
    })
    .modify('onlyCats');

  // Relation expressions.
  Person.query().withGraphFetched('pets(onlyDogs)');
  Person.query().withGraphFetched('pets(onlyDogs, byName)');
  Person.query().withGraphFetched({ pets: { $modify: 'onlyDogs' } });
  Person.query().withGraphFetched({
    pets: { $modify: ['onlyDogs', (query: QueryBuilder<Pet>) => query] },
  });
  Person.query().joinRelated('pets(onlyDogs)');
  // @ts-expect-error
  Person.query().withGraphFetched('pets(onlyCats)');
  // @ts-expect-error
  Person.query().withGraphFetched({ pets: { $modify: 'onlyCats' } });
  Person.query()
    .modifiers({ onlyCats: (query) => query.where('species', 'cat') })
    .withGraphFetched('pets(onlyCats)');
};
