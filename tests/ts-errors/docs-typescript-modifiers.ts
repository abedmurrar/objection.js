// The named modifier errors shown in doc/fork/typescript.md. See scripts/typings-errors.js.
import { defineRelations, Model, type QueryBuilder } from '../../';

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;
  gender!: 'male' | 'female';

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

Person.query().modify('filterGender', 'female');
// @error: Argument of type '"x"' is not assignable to parameter of type '"female" | "male"'.
Person.query().modify('filterGender', 'x');
// @error: Unknown modifier \"filterGendr\"
Person.query().modify('filterGendr');
// @error: Unknown modifier \"filterGendr\" for \"children\"
Person.query().withGraphFetched('children(filterGendr)');
