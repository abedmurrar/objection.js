import { Model, ModelRow, Page, QueryBuilder } from '../../../';
import { Equal, Expect, expectType } from '../_utils/expect';

// Query results only have the relations the query loaded. The relations are
// declared as optional properties, like most models do.

class Pet extends Model {
  static tableName = 'pets';

  id!: number;
  name!: string;
  ownerId!: number;
  owner?: Person;
}

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  name!: string;
  metadata?: any;
  pets?: Pet[];
  mom?: Person | null;

  greet() {
    return `hi ${this.name}`;
  }
}

type PersonRow = ModelRow<Person>;
type PetRow = ModelRow<Pet>;

// Rows keep the columns and the methods of the model. Properties typed `any`
// aren't relations.
type _Keys = Expect<
  Equal<Exclude<keyof PersonRow, keyof Model>, 'id' | 'name' | 'metadata' | 'greet'>
>;

async () => {
  expectType<PersonRow[]>()(await Person.query());
  expectType<PersonRow | undefined>()(await Person.query().findById(1));
  expectType<PersonRow | undefined>()(await Person.query().first());
  expectType<PersonRow>()(await Person.query().findById(1).throwIfNotFound());
  expectType<Page<PersonRow>>()(await Person.query().page(0, 10));
  expectType<PersonRow>()(await Person.query().insert({ name: 'a' }));
  expectType<PersonRow>()(await Person.query().patchAndFetchById(1, { name: 'a' }));
  expectType<number>()(await Person.query().patch({ name: 'a' }));

  const person = await Person.query().findById(1).throwIfNotFound();
  expectType<string>()(person.greet());
  expectType<number>()(person.id);
  // @ts-expect-error the query didn't load `pets`
  person.pets;
  // @ts-expect-error
  person.mom;

  // Rows can be used where the model is expected, and so can their query builders.
  const asModel: Person = person;
  const asModels: Person[] = await Person.query();
  const asBuilder: QueryBuilder<Person> = Person.query();
  const asMaybeBuilder: QueryBuilder<Person, Person | undefined> = Person.query().first();

  // Relation queries return rows of the related model.
  expectType<PetRow[]>()(await person.$relatedQuery('pets'));
  expectType<PersonRow | undefined>()(await person.$relatedQuery('mom'));
  expectType<PetRow[]>()(await Person.relatedQuery('pets').for(1));
  expectType<PetRow | undefined>()(await Person.relatedQuery('pets').for(1).first());
  expectType<PetRow[]>()(await Person.relatedQuery<Pet>('pets' as string).for(1));
};

// Things the types can't see may load relations: the result has all the
// relations of the model as optional properties again.
function withPets(query: QueryBuilder<Person>) {
  query.withGraphFetched('pets');
}

async () => {
  expectType<Person[]>()(await Person.query().modify(withPets));
  expectType<Person | undefined>()(await Person.query().findById(1).modify(withPets));
  expectType<Person[]>()(await Person.query().modify('someModifier'));
  expectType<Person[]>()(
    await Person.query().modify((qb) => {
      qb.withGraphFetched('pets');
    }),
  );
  // It stays that way.
  expectType<Person | undefined>()(await Person.query().modify(withPets).first());

  // Graph inserts return the relations of the input graph.
  expectType<Person>()(await Person.query().insertGraph({ name: 'a', pets: [] }));
  expectType<Person[]>()(await Person.query().upsertGraph([{ id: 1, pets: [] }]));

  // Explicit types keep their meaning.
  expectType<Person>()(await new Person().$query());
  expectType<Person[]>()(await Person.query().castTo(Person));
};

// Models that declare relations as required keep them on rows, since rows
// without them couldn't be used where the model is expected.
class Owner extends Model {
  static tableName = 'owners';

  id!: number;
  pets!: Pet[];
}

async () => {
  expectType<Owner[]>()(await Owner.query());
};

// So do models with `private` members.
class WithPrivate extends Model {
  static tableName = 'withPrivate';

  id!: number;
  pets?: Pet[];

  private secret() {
    return 1;
  }
}

async () => {
  expectType<WithPrivate | undefined>()(await WithPrivate.query().findById(1));
  const withPets = await WithPrivate.query().withGraphFetched('pets').findById(1);
  const model: WithPrivate | undefined = withPets;
};

// Opaque query builders can be assigned to variables of the others.
() => {
  let query = Person.query();
  query = query.modify(withPets);
  query = query.withGraphFetched('pets');
  let explicit: QueryBuilder<Person> = Person.query();
  explicit = explicit.modify(withPets);
};

// Casting `$modelClass` to the class of an abstract base model still works.
abstract class BaseModel extends Model {
  static datetimeFields?: string[] = [];

  datetimeFieldsOf() {
    const modelClass = this.$modelClass as typeof BaseModel;
    return modelClass.datetimeFields;
  }
}
