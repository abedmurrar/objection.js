// The examples of doc/fork/typescript.md. They must keep compiling.
import {
  type AnyQueryBuilder,
  type CaseBuilder,
  defineRelations,
  fn,
  type FunctionBuilder,
  type Loaded,
  Model,
  type ModelInstance,
  type ModelRow,
  type QueryBuilder,
  type ReferenceBuilder,
} from '../../../';
import { expectType } from '../_utils/expect';

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;
  momId!: number | null;
  address!: { street: string; city: string } | null;
  tags!: string[];

  static relationMappings = defineRelations(() => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Animal,
      join: { from: 'persons.id', to: 'animals.ownerId' },
    },
    mom: {
      relation: Model.BelongsToOneRelation,
      modelClass: Person,
      join: { from: 'persons.momId', to: 'persons.id' },
    },
    movies: {
      relation: Model.ManyToManyRelation,
      modelClass: () => Movie,
      join: {
        from: 'persons.id',
        through: {
          modelClass: PersonMovie,
          from: 'persons_movies.personId',
          to: 'persons_movies.movieId',
          extra: ['role'],
        },
        to: 'movies.id',
      },
    },
  }));
}

class Animal extends Model {
  static tableName = 'animals';

  id!: number;
  name!: string;
  species!: string;
  ownerId!: number | null;

  static relationMappings = defineRelations(() => ({
    owner: {
      relation: Model.BelongsToOneRelation,
      modelClass: Person,
      join: { from: 'animals.ownerId', to: 'persons.id' },
    },
    toys: {
      relation: Model.HasManyRelation,
      modelClass: Toy,
      join: { from: 'animals.id', to: 'toys.animalId' },
    },
  }));
}

class Toy extends Model {
  static tableName = 'toys';

  id!: number;
  name!: string;
  animalId!: number;
}

class Movie extends Model {
  static tableName = 'movies';

  id!: number;
  title!: string;
}

class PersonMovie extends Model {
  static tableName = 'persons_movies';

  personId!: number;
  movieId!: number;
  role!: 'actor' | 'director';
}

// The types the comments of the page refer to.
type PersonModel = ModelInstance<typeof Person>;
type AnimalModel = ModelInstance<typeof Animal>;
type PersonRow = ModelRow<PersonModel>;
type AnimalRow = ModelRow<AnimalModel>;
type ToyRow = ModelRow<Toy>;
type MovieRow = ModelRow<Movie>;

// Relations inferred from `relationMappings`.
export function inferred() {
  const person = Person.fromJson({ firstName: 'Jennifer' });

  expectType<AnimalModel[] | undefined>()(person.pets);
  expectType<PersonModel | null | undefined>()(person.mom);
  expectType<(Movie & { role: PersonMovie['role'] })[] | undefined>()(person.movies);

  const created: PersonModel = new Person();
  expectType<AnimalModel[] | undefined>()(created.pets);
}

export async function extraColumns() {
  const movies = await Person.relatedQuery('movies').for(1);
  expectType<(MovieRow & { role: 'actor' | 'director' })[]>()(movies);

  const directed = movies.filter((movie) => movie.role === 'director');
  expectType<string[]>()(directed.map((movie) => movie.title));
}

// Checked relation names in `relatedQuery()`.
export async function relatedQueries(relationName: string) {
  const dogs = await Person.relatedQuery('pets').for([1, 2]).where('species', 'dog');
  expectType<AnimalRow[]>()(dogs);

  const person = await Person.query().findById(1).throwIfNotFound();

  const mom = await person.$relatedQuery('mom');
  expectType<PersonRow | undefined>()(mom);

  const surelyMom = await person.$relatedQuery('mom').throwIfNotFound();
  expectType<PersonRow>()(surelyMom);

  const related = await person.$relatedQuery<Animal>(relationName);
  expectType<ModelRow<Animal>[]>()(related);
}

// Results only contain the relations the query loaded.
function greet(person: Person) {
  return `Hello, ${person.firstName}`;
}

export async function rows() {
  const person = await Person.query().findById(1).throwIfNotFound();
  expectType<PersonRow>()(person);
  expectType<string>()(greet(person));
}

// Graph methods add what they load.
export async function graphs() {
  const person = await Person.query().findById(1).throwIfNotFound();

  const withPets = await Person.query()
    .withGraphFetched('[pets.owner, mom]')
    .findById(1)
    .throwIfNotFound();

  expectType<PersonRow | null>()(withPets.pets[0].owner);
  expectType<PersonRow | null>()(withPets.mom);

  const fetched = await person.$fetchGraph('pets');
  expectType<AnimalRow[]>()(fetched.pets);
}

async function findWithPets(id: number): Promise<Loaded<PersonModel, 'pets.toys'> | undefined> {
  return Person.query().findById(id).withGraphFetched('pets.toys');
}

type PersonWithFamily = Loaded<PersonModel, '[pets.toys, mom]'>;

function toyNames(person: PersonWithFamily): string[] {
  return person.pets.flatMap((pet) => pet.toys.map((toy) => toy.name));
}

function momName(person: PersonWithFamily): string | undefined {
  return person.mom?.firstName;
}

export async function loaded() {
  const found = await findWithPets(1);
  expectType<ToyRow[] | undefined>()(found?.pets[0].toys);

  const people = await Person.query().withGraphFetched('[pets.toys, mom]');
  expectType<string[][]>()(people.map(toyNames));
  expectType<(string | undefined)[]>()(people.map(momName));
}

export async function modifyGraph() {
  const owners = await Person.query()
    .withGraphFetched('pets.toys')
    .modifyGraph('pets', (query) => query.where('species', 'dog').orderBy('name'))
    .modifyGraph('pets.toys', (query) => query.select('id', 'name'));

  expectType<ToyRow[]>()(owners[0].pets[0].toys);

  const dogOwners = await Person.query()
    .withGraphJoined('pets')
    .where('pets.species', 'dog')
    .orderBy('persons.id');

  expectType<AnimalRow[]>()(dogOwners[0].pets);
}

export async function conditionalLoading(includePets: boolean) {
  const query: QueryBuilder<PersonModel> = Person.query();

  if (includePets) {
    query.withGraphFetched('pets');
  }

  const people = await query;
  expectType<AnimalModel[] | undefined>()(people[0].pets);
}

// `Model.ref()` checks columns.
export async function refs() {
  expectType<ReferenceBuilder<string>>()(Person.ref('firstName'));
  expectType<ReferenceBuilder<number | null>>()(Person.ref('address:street').castInt());

  await Person.query()
    .select('id', Person.ref('address:city').castText().as('city'))
    .where(Person.ref('address:city').castText(), 'Helsinki')
    .orderBy(Person.ref('firstName'));

  Person.ref<'legacy_column'>('legacy_column');
}

// JSON field expressions in patches.
export async function jsonPatches() {
  await Person.query().patch({ 'address:street': 'Main street' });
  await Person.query().findById(1).patch({ 'tags:[0]': 'first' });
}

// Typed `fn` and `ref`.
class Event extends Model {
  static tableName = 'events';

  id!: number;
  startsAt!: Date;
}

export async function typedFn(ids: number[]) {
  expectType<FunctionBuilder<string | null>>()(fn.dateFormat(Event.ref('startsAt'), '%Y-%m'));
  expectType<FunctionBuilder<number | null>>()(
    fn.timestampDiff('day', Event.ref('startsAt'), fn.now()),
  );

  fn.timestampDiff('day', Event.ref('startsAt'), fn.now()).gt(30);

  expectType<FunctionBuilder<'manual' | 'scraped'>>()(
    fn.case().when(Event.ref('id').in(ids), 'manual').else('scraped'),
  );
  const withoutElse = fn.case().when(Event.ref('id').in(ids), 'manual');
  expectType<CaseBuilder<'manual'>>()(withoutElse);
  const asFunction: FunctionBuilder<'manual' | null> = withoutElse;

  // select() doesn't change the result type.
  const months = await Event.query().select(
    fn.dateFormat(Event.ref('startsAt'), '%Y-%m').as('month'),
  );
  expectType<ModelRow<Event>[]>()(months);
}

// `runAfter()` and `castTo<T>()` set the result type.
type Row = { id: number; firstName: string };
type SpeciesCount = { species: string; count: number | string };

export async function resultTypes() {
  const names = await Person.query().runAfter((people) => people.map((it) => it.firstName));
  expectType<string[]>()(names);

  const row = await Person.query().castTo<Row[]>().first();
  expectType<Row | undefined>()(row);

  const counts = await Animal.query()
    .select('species')
    .count('* as count')
    .groupBy('species')
    .orderBy('count', 'desc')
    .castTo<SpeciesCount[]>();
  expectType<SpeciesCount[]>()(counts);

  const mostCommon = await Animal.query()
    .select('species')
    .count('* as count')
    .groupBy('species')
    .orderBy('count', 'desc')
    .castTo<SpeciesCount[]>()
    .first();
  expectType<SpeciesCount | undefined>()(mostCommon);
}

// `AnyQueryBuilder<M>`.
export function byName(query: AnyQueryBuilder<Person>, name: string) {
  query.where('firstName', name);
}

function paginate<QB extends AnyQueryBuilder>(query: QB, page: number): QB {
  return query.limit(10).offset(page * 10);
}

export async function anyQueryBuilder() {
  await Person.query().findById(1).modify(byName, 'Jennifer');

  const third = await paginate(Person.query().orderBy('id'), 2);
  expectType<PersonRow[]>()(third);
}
