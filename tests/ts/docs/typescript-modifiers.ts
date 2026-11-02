// The named modifier examples of doc/fork/typescript.md. They must keep compiling.
import { defineRelations, Model, type ModelInstance, type QueryBuilder } from '../../../';
import { expectType } from '../_utils/expect';

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;
  gender!: 'male' | 'female';
  parentId!: number | null;

  static relationMappings = defineRelations(() => ({
    children: {
      relation: Model.HasManyRelation,
      modelClass: Person,
      join: { from: 'persons.id', to: 'persons.parentId' },
    },
  }));

  static modifiers = {
    filterGender(query: QueryBuilder<Person>, gender: 'male' | 'female') {
      query.where(Person.ref('gender'), gender);
    },
    orderByName(query: QueryBuilder<Person>) {
      query.orderBy('firstName');
    },
  };
}

export async function modifiers() {
  await Person.query().modify('filterGender', 'female');
  await Person.query().modify('orderByName').modify('filterGender', 'male');

  const people = await Person.query().withGraphFetched('children(orderByName)');
  expectType<ModelInstance<typeof Person>[]>()(people[0].children);
}
