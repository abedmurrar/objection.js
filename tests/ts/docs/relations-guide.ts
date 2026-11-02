// The examples of the "Relations" guide (doc/guide/relations.md).
import { defineRelations, Model, type ModelInstance, type RelationsOf } from '../../../';
import { expectType } from '../_utils/expect';

class Toy extends Model {
  static override tableName = 'toys';

  id!: number;
  petId!: number;
}

// No relation leads back to Pet, so RelationsOf works.
class Pet extends Model {
  static override tableName = 'pets';

  id!: number;

  static override relationMappings = defineRelations(() => ({
    toys: {
      relation: Model.HasManyRelation,
      modelClass: Toy,
      join: { from: 'pets.id', to: 'toys.petId' },
    },
  }));
}

interface Pet extends RelationsOf<typeof Pet> {}

class Animal extends Model {
  static override tableName = 'animals';

  id!: number;
  ownerId!: number;

  static override relationMappings = defineRelations(() => ({
    owner: {
      relation: Model.BelongsToOneRelation,
      modelClass: Person,
      join: { from: 'animals.ownerId', to: 'persons.id' },
    },
  }));
}

class Person extends Model {
  static override tableName = 'persons';

  id!: number;
  momId!: number | null;

  static override relationMappings = defineRelations(() => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Animal,
      join: { from: 'persons.id', to: 'animals.ownerId' },
    },
    mom: {
      relation: Model.BelongsToOneRelation,
      modelClass: Person,
      join: { from: 'persons.momId', to: 'persons.id' },
    },
  }));
}

type PersonModel = ModelInstance<typeof Person>;

export function relationsGuide() {
  const person: PersonModel = new Person();
  expectType<ModelInstance<typeof Animal>[] | undefined>()(person.pets);

  const pet = new Pet();
  expectType<Toy[] | undefined>()(pet.toys);
}
