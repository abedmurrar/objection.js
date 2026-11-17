// Error message tests for relation mappings and the relations that
// `RelationsOf` declares. See scripts/typings-errors.js.
import { Model, type RelationsOf, defineRelations } from '../../';

class NotAModel {
  id!: number;
}

class Person extends Model {
  id!: number;

  static override relationMappings = () => ({
    mom: {
      relation: Model.BelongsToOneRelation,
      modelClass: Person,
      join: { from: 'persons.momId', to: 'persons.id' },
    },
  });
}

interface Person extends RelationsOf<typeof Person> {}

// A class that isn't a model is rejected where the mappings are assigned to
// `relationMappings`, written directly or with `defineRelations()`.
// @error: Type 'typeof NotAModel' is not assignable to type 'ModelClassSpecifier'
class WithPlainClass extends Model {
  static override relationMappings = () => ({
    other: {
      relation: Model.HasManyRelation,
      modelClass: NotAModel,
      join: { from: 'a.id', to: 'b.aId' },
    },
  });
}

// @error: Type 'typeof NotAModel' is not assignable to type 'ModelClassSpecifier'
class WithDefinedPlainClass extends Model {
  static override relationMappings = defineRelations(() => ({
    other: {
      relation: Model.HasManyRelation,
      modelClass: NotAModel,
      join: { from: 'a.id', to: 'b.aId' },
    },
  }));
}

() => {
  // @error: Property 'dad' does not exist on type 'Person'
  new Person().dad;
};
