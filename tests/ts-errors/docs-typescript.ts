// The compile errors shown in doc/fork/typescript.md. See scripts/typings-errors.js.
import {
  type AnyQueryBuilder,
  defineRelations,
  fn,
  type Loaded,
  Model,
  type ModelInstance,
  type QueryBuilder,
} from '../../';

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;
  address!: { street: string; city: string } | null;

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

  static relationMappings = defineRelations(() => ({
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
}

class Movie extends Model {
  static tableName = 'movies';

  id!: number;
  title!: string;
}

class PersonMovie extends Model {
  static tableName = 'persons_movies';

  role!: 'actor' | 'director';
}

class Event extends Model {
  static tableName = 'events';

  startsAt!: Date;
}

type PersonModel = ModelInstance<typeof Person>;
type PersonWithFamily = Loaded<PersonModel, '[pets.toys, mom]'>;

function toyNames(person: PersonWithFamily): string[] {
  return person.pets.flatMap((pet) => pet.toys.map((toy) => toy.name));
}

function byName(query: AnyQueryBuilder<Person>, name: string) {
  query.where('firstName', name);
}

export async function relations() {
  const movies = await Person.relatedQuery('movies').for(1);
  // @error: This comparison appears to be unintentional because the types '"actor" | "director"' and '"directr"' have no overlap.
  movies.filter((movie) => movie.role === 'directr');

  // @error: not assignable to parameter of type 'UnknownRelationName'.
  Person.relatedQuery('pet');

  const person = await Person.query().findById(1).throwIfNotFound();
  // @error: Property 'pets' does not exist on type 'Row<Person & InferredRelationProps<typeof Person, Person>>'.
  person.pets;

  const withPets = await Person.query().withGraphFetched('[pets, mom]').findById(1);
  // @error: Property 'movies' does not exist on type
  withPets?.movies;

  const withPetsOnly = await Person.query().withGraphFetched('pets');
  // @error: Property 'mom' is missing in type
  withPetsOnly.map(toyNames);
}

export async function conditionalLoading(includePets: boolean) {
  const query = Person.query();

  if (includePets) {
    query.withGraphFetched('pets');
  }

  const people = await query;
  // @error: Property 'pets' does not exist on type
  people[0].pets;

  const typed: QueryBuilder<PersonModel> = Person.query();
  typed.withGraphFetched('pets');
  (await typed)[0].pets;
}

export async function jsonPatches() {
  // @error: ''firstName:a'' does not exist in type
  await Person.query().patch({ 'firstName:a': 1 });
  // @error: ''address:street'' does not exist in type
  await Person.query().insert({ 'address:street': 'x' });
}

export async function typedFn() {
  // @error: Argument of type '"30"' is not assignable to parameter of type 'number | FnExpression | null'.
  fn.timestampDiff('day', Event.ref('startsAt'), fn.now()).gt('30');

  await Person.query().findById(1).modify(byName, 'Jennifer');
  // @error: No overload matches this call.
  await Person.query().modify(byName, 1);
}
