import { Model, type ModelRow } from '../../../';
import { expectType } from '../_utils/expect';

// `stream()` yields the items of the query's result one at a time.

class Pet extends Model {
  static tableName = 'pets';

  id!: number;
  name!: string;
  ownerId!: number;
}

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  name!: string;
  pets?: Pet[];
}

class Plain extends Model {
  value!: string;
}

async () => {
  for await (const person of Person.query().where('id', '>', 1).orderBy('id').stream()) {
    expectType<ModelRow<Person>>()(person);
    expectType<number>()(person.id);
    // @ts-expect-error the query doesn't load `pets`
    person.pets;
  }

  for await (const pet of Person.relatedQuery('pets').for(1).stream()) {
    expectType<ModelRow<Pet>>()(pet);
  }

  for await (const plain of Person.query().castTo(Plain).stream()) {
    expectType<string>()(plain.value);
  }

  const iterator = Person.query().stream();
  expectType<AsyncIterableIterator<ModelRow<Person>>>()(iterator);
  await iterator.return?.();
};
