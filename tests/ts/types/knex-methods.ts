import { Model, raw, type JoinBuilder } from '../../../';
import { expectType } from '../_utils/expect';

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  age!: number;
}

class Pet extends Model {
  static tableName = 'pets';

  id!: number;
  ownerId!: number;
}

async () => {
  // The and* variants of having.
  expectType<Person[]>()(
    await Person.query()
      .groupBy('age')
      .having('age', '>', 1)
      .andHaving('age', '<', 100)
      .andHavingIn('age', [18, 21])
      .andHavingNotIn('age', [0])
      .andHavingNull('age')
      .andHavingNotNull('age')
      .andHavingBetween('age', [1, 2])
      .andHavingNotBetween('age', [3, 4])
      .andHavingExists(Pet.query().select(1))
      .andHavingNotExists(Pet.query().select(1)),
  );

  // Clearing groups and havings.
  expectType<Person[]>()(await Person.query().groupBy('age').clearGroup().clearHaving());

  // Comments, hints and driver options.
  expectType<Person[]>()(
    await Person.query()
      .comment('report')
      .hintComment(['NO_ICP(persons)'])
      .options({ nestTables: true }),
  );

  // Postgres update ... from and delete ... using.
  expectType<number>()(
    await Person.query()
      .patch({ age: 1 })
      .updateFrom('pets')
      .where('pets.ownerId', raw('??', ['persons.id'])),
  );
  expectType<number>()(
    await Person.query()
      .delete()
      .using('pets')
      .where('pets.ownerId', raw('??', ['persons.id'])),
  );

  // finally() keeps the result type.
  expectType<Person[]>()(await Person.query().finally(() => {}));
  expectType<Person | undefined>()(
    await Person.query()
      .findById(1)
      .finally(() => {}),
  );

  // `or` in join callbacks.
  await Person.query().join('pets', (join) => {
    expectType<JoinBuilder>()(join.on('pets.ownerId', 'persons.id').or.on('pets.id', 'persons.id'));
  });
};
