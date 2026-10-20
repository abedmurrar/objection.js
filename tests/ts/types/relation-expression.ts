import { Model, QueryBuilder, RelationExpression } from '../../../';

// Relation expressions are checked against the relations of the models, in
// string and in object notation.

class Toy extends Model {
  static tableName = 'toys';

  id!: number;
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

// Relations inferred from `relationMappings` are checked too.
class Movie extends Model {
  static tableName = 'movies';

  static relationMappings = () => ({
    actors: {
      relation: Model.ManyToManyRelation,
      modelClass: Person,
      join: {
        from: 'movies.id',
        through: { from: 'actors.movieId', to: 'actors.personId' },
        to: 'persons.id',
      },
    },
    // The related model of a module path isn't known, so its relations aren't checked.
    studio: {
      relation: Model.BelongsToOneRelation,
      modelClass: 'Studio',
      join: { from: 'movies.studioId', to: 'studios.id' },
    },
  });
}

function forPets(query: QueryBuilder<Pet>) {
  query.orderBy('id');
}

function forPersons(query: QueryBuilder<Person>) {
  query.orderBy('id');
}

declare const unknownExpression: string;
declare const anyExpression: RelationExpression<Person>;

() => {
  Person.query().withGraphFetched('pets');
  Person.query().withGraphFetched('pets.toys');
  Person.query().withGraphFetched('[pets.toys, mom.children]');
  Person.query().withGraphFetched('[pets.[toys, owner], mom]');
  Person.query().withGraphFetched('[pets.[toys owner] mom]');
  Person.query().withGraphFetched('pets(orderById, onlyDogs).toys');
  Person.query().withGraphFetched('[pets as animals.toys, mom as mother]');
  Person.query().withGraphFetched('mom.^');
  Person.query().withGraphFetched('mom.^3');
  Person.query().withGraphFetched('children.*');
  Person.query().withGraphFetched('*');
  Person.query().withGraphFetched(`[
    pets(orderById).[
      toys,
      owner
    ],
    children
  ]`);

  Person.query().withGraphFetched({ pets: true });
  Person.query().withGraphFetched({ pets: { toys: true, owner: { pets: true } }, mom: true });
  Person.query().withGraphFetched({ animals: { $relation: 'pets', toys: true } });
  Person.query().withGraphFetched({
    pets: { $modify: forPets },
    children: { $modify: forPersons },
  });
  Person.query().withGraphFetched({ pets: { $modify: ['orderById', forPets] } });
  Person.query().withGraphFetched({ mom: { $recursive: true }, pets: false });

  Movie.query().withGraphFetched('actors.pets.toys');
  Movie.query().withGraphFetched('studio.anything.goes');

  Person.query().withGraphJoined('pets.toys');
  Person.query().joinRelated('[pets.toys, mom]');
  Person.query().innerJoinRelated('pets as p');
  Person.query().allowGraph('[pets.toys, children.^]');

  // Expressions that aren't known at compile time aren't checked.
  Person.query().withGraphFetched(unknownExpression);
  Person.query().withGraphFetched(anyExpression);

  // @ts-expect-error
  Person.query().withGraphFetched('pet');
  // @ts-expect-error
  Person.query().withGraphFetched('pets.toyz');
  // @ts-expect-error
  Person.query().withGraphFetched('[pets, mom');
  // @ts-expect-error
  Person.query().withGraphFetched({ pets: { toyz: true } });
  // @ts-expect-error
  Person.query().withGraphFetched({ animals: { $relation: 'animals' } });
  // @ts-expect-error
  Movie.query().withGraphFetched('actors.pets.toyz');
  // @ts-expect-error
  Person.query().joinRelated('pets.toyz');
  // @ts-expect-error
  Person.query().allowGraph('nope');
};

// Relations declared with types that aren't models are accepted too.
class Course extends Model {
  static tableName = 'courses';

  id!: number;
  title!: string;
  programs?: { id: number; name: string }[];
}

() => {
  Course.query().withGraphFetched('programs');
  // @ts-expect-error a column isn't a relation
  Course.query().withGraphFetched('title');

  // `castTo()` only changes the types, so the relations aren't checked after it.
  Pet.query().joinRelated('owner').castTo(Person).withGraphFetched('toys');
};
