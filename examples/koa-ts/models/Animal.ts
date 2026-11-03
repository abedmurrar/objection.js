import { Model, defineRelations } from 'objection';
import Person from './Person';

export default class Animal extends Model {
  id!: number;
  ownerId!: number | null;
  name!: string;
  species!: string;

  // Table name is the only required property.
  static tableName = 'animals';

  // Optional JSON schema. This is not the database schema! Nothing is generated
  // based on this. This is only used for validation. Whenever a model instance
  // is created it is checked against this schema. http://json-schema.org/.
  static jsonSchema = {
    type: 'object',
    required: ['name'],

    properties: {
      id: { type: 'integer' },
      ownerId: { type: ['integer', 'null'] },
      name: { type: 'string', minLength: 1, maxLength: 255 },
      species: { type: 'string', minLength: 1, maxLength: 255 },
    },
  };

  // This object defines the relations to other models. The relationMappings
  // property can be a thunk to prevent circular dependencies. The types of the
  // relation properties (`owner` here) are inferred from it, so they don't need
  // to be declared. Don't annotate its type, that would hide them.
  static relationMappings = defineRelations(() => ({
    owner: {
      relation: Model.BelongsToOneRelation,
      // The related model.
      modelClass: Person,

      join: {
        from: 'animals.ownerId',
        to: 'persons.id',
      },
    },
  }));
}
