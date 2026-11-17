import { type CursorPage, Model, type ModelRow, ValidationError } from '../../../';
import { expectType } from '../_utils/expect';

// `cursorPage()` resolves to the models of the page and the next cursor.

class Pet extends Model {
  static tableName = 'pets';

  id!: number;
  name!: string;
  ownerId!: number;
}

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  lastName!: string;
  pets?: Pet[];

  static relationMappings = {
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'persons.id', to: 'pets.ownerId' },
    },
  };
}

async (after: string | undefined) => {
  const page = await Person.query().orderBy('lastName').cursorPage(20, after);
  expectType<CursorPage<ModelRow<Person>>>()(page);
  expectType<string | null>()(page.next);
  expectType<string>()(page.results[0].lastName);

  // The first page, and a cursor from a previous page.
  await Person.query().cursorPage(20);
  await Person.query().cursorPage(20, null);
  await Person.query().cursorPage(20, page.next);

  // Relations loaded on the page.
  const withPets = await Person.query().withGraphFetched('pets').cursorPage(10);
  expectType<string>()(withPets.results[0].pets[0].name);

  const pets = await Person.relatedQuery('pets').for(1).cursorPage(5);
  expectType<CursorPage<ModelRow<Pet>>>()(pets);

  try {
    await Person.query().cursorPage(20, 'not a cursor');
  } catch (err) {
    if (err instanceof ValidationError && err.type === 'InvalidCursor') {
      expectType<number>()(err.statusCode);
    }
  }
};
