import { Model, ref, raw, JoinBuilder } from '../../../';
import { expectType } from '../_utils/expect';

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  favoritePetId?: number;
}

class Pet extends Model {
  static tableName = 'pets';

  id!: number;
  ownerId!: number;
  species!: string;
}

class Toy extends Model {
  static tableName = 'toys';

  petId!: number;
}

async () => {
  // Model classes can be used in place of table names.
  expectType<Person[]>()(await Person.query().innerJoin(Pet, Pet.ref('ownerId'), Person.ref('id')));
  await Person.query().leftJoin(Pet, Pet.ref('ownerId'), '=', Person.ref('id'));
  await Person.query().crossJoin(Pet);
  await Person.query().innerJoin({ p: Pet }, 'p.ownerId', Person.ref('id'));
  await Person.query().from(Person);
  await Person.query().from({ p: Person });

  // Join callbacks accept refs everywhere.
  await Person.query().leftJoin(Pet, (join) => {
    expectType<JoinBuilder>()(join);

    join
      .on(Pet.ref('ownerId'), Person.ref('id'))
      .andOn(Pet.ref('ownerId'), '=', Person.ref('id'))
      .orOn(Pet.ref('id'), ref('persons.favoritePetId'))
      .andOnVal(Pet.ref('species'), 'dog')
      .andOnVal(Pet.ref('id'), '>', 1)
      .andOnIn(Pet.ref('id'), [1, 2])
      .andOnNull(Pet.ref('species'))
      .andOnBetween(Pet.ref('id'), [1, 10])
      .andOnExists(Toy.query().select(1).where(Toy.ref('petId'), Pet.ref('id')))
      .andOn((nested) => nested.on('pets.id', raw('1')));
  });

  await Person.query().leftJoin(Toy, function () {
    expectType<JoinBuilder>()(this);
    this.on(Toy.ref('petId'), Pet.ref('id'));
  });

  // @ts-expect-error
  Person.query().leftJoin(Pet, (join) => join.on(1, 2));
};
