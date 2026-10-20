import { Loaded, Model, ModelRow, QueryBuilder, RelationExpression } from '../../../';
import { Equal, Expect, Flatten, expectType } from '../_utils/expect';

// The graph methods add the relations they load to the result type.

class Toy extends Model {
  static tableName = 'toys';

  id!: number;
  label!: string;
  pet?: Pet;
}

class Pet extends Model {
  static tableName = 'pets';

  id!: number;
  name!: string;
  toys?: Toy[];
  owner?: Person;
}

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;
  pets?: Pet[];
  mom?: Person | null;
  children?: Person[];
}

type PersonRow = ModelRow<Person>;
type PetRow = ModelRow<Pet>;
type ToyRow = ModelRow<Toy>;

async () => {
  // To-many relations are arrays, to-one relations can be `null`.
  const person = await Person.query().withGraphFetched('[pets.toys, mom]').findById(1);
  type _Person = Expect<
    Equal<
      Flatten<NonNullable<typeof person>>,
      Flatten<PersonRow & { pets: (PetRow & { toys: ToyRow[] })[]; mom: PersonRow | null }>
    >
  >;

  if (person) {
    expectType<string>()(person.pets[0].toys[0].label);
    expectType<string | undefined>()(person.mom?.firstName);
    // @ts-expect-error not loaded
    person.children;
    // @ts-expect-error not loaded
    person.mom?.pets;
    // @ts-expect-error not loaded
    person.pets[0].owner;
  }

  // Rows with loaded relations can still be used where the model is expected.
  const asModel: Person | undefined = person;

  // Object notation, aliases, booleans.
  const people = await Person.query().withGraphFetched({
    pets: { toys: true },
    mother: { $relation: 'mom' },
    children: false,
  });
  expectType<ToyRow[]>()(people[0].pets[0].toys);
  expectType<PersonRow | null>()(people[0].mother);
  // @ts-expect-error
  people[0].children;
  // @ts-expect-error the alias is used instead of the relation name
  people[0].mom;

  const maybe = await Person.query().withGraphFetched({ pets: true as boolean });
  expectType<PetRow[] | undefined>()(maybe[0].pets);

  expectType<(PersonRow & { animals: PetRow[] })[]>()(
    await Person.query().withGraphFetched('pets as animals'),
  );

  // Calls add to each other, like at runtime.
  const merged = await Person.query()
    .withGraphFetched('pets')
    .withGraphFetched('[pets.toys, mom]')
    .first()
    .throwIfNotFound();
  expectType<ToyRow[]>()(merged.pets[0].toys);
  expectType<PersonRow | null>()(merged.mom);

  // withGraphJoined works the same way.
  expectType<PetRow[]>()((await Person.query().withGraphJoined('pets'))[0].pets);

  // Result kinds are kept.
  expectType<number>()(await Person.query().withGraphFetched('pets').resultSize());
  const page = await Person.query().withGraphFetched('pets').page(0, 10);
  expectType<PetRow[]>()(page.results[0].pets);

  // Recursive relations and `*` keep the relations of the related models.
  const ancestors = await Person.query().withGraphFetched('mom.^');
  expectType<Person | null>()(ancestors[0].mom);
  const everything = await Person.query().withGraphFetched('*');
  expectType<Person[]>()(everything);

  // Expressions that aren't known at compile time.
  expectType<Person[]>()(await Person.query().withGraphFetched(expression));
};

declare const expression: RelationExpression<Person>;

// Modifier functions that return the query builder add what they load.
// Modifiers that return nothing may load anything.
function withToys(query: QueryBuilder<Pet>) {
  return query.withGraphFetched('toys').orderBy('name');
}

function sortPets(query: QueryBuilder<Pet>) {
  query.orderBy('name');
}

function withOpaque(query: QueryBuilder<Pet>) {
  return query.modify(sortPets).withGraphFetched('owner');
}

async () => {
  const people = await Person.query().withGraphFetched({ pets: { $modify: withToys } });
  expectType<ToyRow[]>()(people[0].pets[0].toys);
  // @ts-expect-error
  people[0].pets[0].owner;

  const sorted = await Person.query().withGraphFetched({ pets: { $modify: sortPets } });
  expectType<Pet[]>()(sorted[0].pets);

  const opaque = await Person.query().withGraphFetched({ pets: { $modify: withOpaque } });
  expectType<PersonRow | undefined>()(opaque[0].pets[0].owner);
  expectType<Toy[] | undefined>()(opaque[0].pets[0].toys);

  // Named modifiers.
  const named = await Person.query().withGraphFetched('pets(sortByName)');
  expectType<Pet[]>()(named[0].pets);

  // `modify()` too.
  const pets = await Pet.query().modify(withToys);
  expectType<(PetRow & { toys: ToyRow[] })[]>()(pets);
  expectType<Pet[]>()(await Pet.query().modify(sortPets));
  expectType<(PetRow & { toys: ToyRow[] })[]>()(
    await Pet.query().modify((query) => query.withGraphFetched('toys')),
  );
};

// `$fetchGraph()` and `fetchGraph()`.
async () => {
  const person = await Person.query().findById(1).throwIfNotFound();
  const withPets = await person.$fetchGraph('pets');
  expectType<PetRow[]>()(withPets.pets);

  const people = await Person.query();
  const fetched = await Person.fetchGraph(people, '[pets.toys]');
  expectType<ToyRow[]>()(fetched[0].pets[0].toys);
  const one = await Person.fetchGraph(people[0], 'mom');
  expectType<PersonRow | null>()(one.mom);

  // @ts-expect-error
  person.$fetchGraph('pet');
  // @ts-expect-error
  Person.fetchGraph(people, 'pet');
};

// `Loaded<M, E>` for annotations.
async function findWithPets(id: number): Promise<Loaded<Person, 'pets.toys'> | undefined> {
  return Person.query().withGraphFetched('pets.toys').findById(id);
}

async () => {
  expectType<ToyRow[] | undefined>()((await findWithPets(1))?.pets[0].toys);
};

// `modifyGraph()` gets the query builder of the related model, also for aliases.
() => {
  Person.query()
    .withGraphFetched('pets.toys')
    .modifyGraph('pets', (query) => {
      type _ = Expect<Equal<typeof query, QueryBuilder<Pet, PetRow[]>>>;
      query.orderBy('name');
    })
    .modifyGraph('pets.toys', (query) => {
      query.orderBy('label');
    })
    .modifyGraph('pets', 'sortByName');

  Person.query()
    .withGraphFetched('pets as animals')
    .modifyGraph('animals', (query) => {
      query.orderBy('name');
    });

  Person.query()
    .withGraphFetched('pets')
    // @ts-expect-error
    .modifyGraph('pet', (query) => query);

  Person.query()
    .withGraphFetched('pets')
    // @ts-expect-error a modifier for another model
    .modifyGraph('pets', (query: QueryBuilder<Toy>) => query);

  // The related model can be given explicitly.
  Person.query().modifyGraph<Pet>('pets', (query) => query.orderBy('name'));
};

// Generic helpers can infer the row type as the model type. The relations of the
// model are still known.
function limited<M extends Model>(query: QueryBuilder<M, M[]>): QueryBuilder<M, M[]> {
  return query.limit(10);
}

async () => {
  const pets = await limited(Pet.query()).withGraphFetched('toys');
  expectType<ToyRow[]>()(pets[0].toys);
  limited(Pet.query()).innerJoinRelated('owner');
  // @ts-expect-error
  limited(Pet.query()).innerJoinRelated('ownr');
};
