// Repros reported by a consumer (chat-api) moving to the fork.
import { Model, defineRelations, type AnyQueryBuilder, type ModelInstance } from '../../';

class Pet extends Model {
  static tableName = 'pets';
  id!: number;
  ownerId!: number;
}

class Person extends Model {
  static tableName = 'persons';
  id!: number;
  name!: string;

  static relationMappings = defineRelations(() => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'persons.id', to: 'pets.ownerId' },
    },
  }));
}

type PersonModel = ModelInstance<typeof Person>;

// Modifiers that call other modifiers, on an `AnyQueryBuilder<M>`.
function byName(query: AnyQueryBuilder<PersonModel>) {
  query.where('name', 'x');
}

export function chained(query: AnyQueryBuilder<PersonModel>) {
  query.modify(byName).select('id');
  query.modify(byName).where('id', 1).orderBy('name');
}

// `$setRelated()` and `$appendRelated()` check the relation name and the
// related models, like `relatedQuery()` does.
export async function setRelated(person: PersonModel, relationName: string) {
  const pets = await Pet.query();
  const pet = Pet.fromJson({ id: 1, ownerId: 1 });

  person.$setRelated('pets', pets);
  person.$setRelated('pets', pet);
  person.$setRelated('pets', [pet]);
  person.$setRelated('pets', null);
  person.$appendRelated('pets', pets);

  // On rows, which don't have the relations the query didn't load.
  const row = (await Person.query())[0];
  row.$setRelated('pets', pets);

  // Names that can't be checked need the related model type.
  person.$setRelated<Pet>(relationName, pets);
  person.$setRelated(Person.getRelation('pets'), pets);

  // A model without known relations takes any name.
  pet.$setRelated('owner', person);
}
