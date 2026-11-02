// The example of README.md. It must keep compiling.
import { defineRelations, Model } from '../../';
import { knex } from 'knex';
import { expectType } from './_utils/expect';

Model.knex(knex({ client: 'pg', connection: process.env.DATABASE_URL }));

class Pet extends Model {
  static override tableName = 'pets';

  id!: number;
  name!: string;
  ownerId!: number;
}

class Person extends Model {
  static override tableName = 'persons';

  id!: number;
  firstName!: string;

  static override relationMappings = defineRelations(() => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'persons.id', to: 'pets.ownerId' },
    },
  }));
}

export async function readmeExample() {
  const people = await Person.query().where('firstName', 'like', 'J%').withGraphFetched('pets');

  expectType<string>()(people[0].pets[0].name);
  expectType<string>()(people[0].firstName);

  await Person.query().insertGraph({
    firstName: 'Jennifer',
    pets: [{ name: 'Doggo' }],
  });
}
