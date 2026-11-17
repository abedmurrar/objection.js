import { Model, type ModelInstance, type RelationsOf, defineRelations } from '../../../';
import { expectType } from '../_utils/expect';

// `interface X extends RelationsOf<typeof X> {}` declares the inferred relations
// on the model, also when a relation leads back to the model itself, directly
// or through another model, and with `defineRelations()`.

// A relation to the model itself, as a thunk.
class Person extends Model {
  id!: number;
  name!: string;

  static override relationMappings = () => ({
    mom: {
      relation: Model.BelongsToOneRelation,
      modelClass: Person,
      join: { from: 'persons.momId', to: 'persons.id' },
    },
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Animal,
      join: { from: 'persons.id', to: 'animals.ownerId' },
    },
  });
}

interface Person extends RelationsOf<typeof Person> {}

// The other end of a two-model cycle.
class Animal extends Model {
  id!: number;
  ownerId!: number | null;

  static override relationMappings = () => ({
    owner: {
      relation: Model.BelongsToOneRelation,
      modelClass: Person,
      join: { from: 'animals.ownerId', to: 'persons.id' },
    },
  });
}

interface Animal extends RelationsOf<typeof Animal> {}

async () => {
  const person = new Person();
  expectType<Person | null | undefined>()(person.mom);
  expectType<Animal[] | undefined>()(person.pets);
  expectType<string | undefined>()(person.mom?.name);
  expectType<Animal[] | undefined>()(person.pets?.[0].owner?.mom?.pets);

  const people = await Person.query().withGraphFetched('[mom, pets.owner]');
  expectType<string | undefined>()(people[0].mom?.name);
  expectType<number | undefined>()(people[0].pets[0].owner?.id);

  const pets = await person.$relatedQuery('pets');
  expectType<number>()(pets[0].id);

  // @ts-expect-error: `dad` is not a relation of Person.
  Person.relatedQuery('dad');
};

// A self-relation as a getter, and with a `modelClass` thunk.
class Employee extends Model {
  id!: number;

  static override get relationMappings() {
    return {
      boss: {
        relation: Model.BelongsToOneRelation,
        modelClass: () => Employee,
        join: { from: 'employees.bossId', to: 'employees.id' },
      },
    };
  }
}

interface Employee extends RelationsOf<typeof Employee> {}

() => {
  expectType<Employee | null | undefined>()(new Employee().boss);
  expectType<Employee | null | undefined>()(new Employee().boss?.boss);
};

// `defineRelations()` with an object.
class Category extends Model {
  id!: number;

  static override relationMappings = defineRelations({
    parent: {
      relation: Model.BelongsToOneRelation,
      modelClass: Category,
      join: { from: 'categories.parentId', to: 'categories.id' },
    },
  });
}

interface Category extends RelationsOf<typeof Category> {}

() => {
  expectType<Category | null | undefined>()(new Category().parent);
};

// `defineRelations()` with a thunk, in a two-model cycle, as in the relations
// guide.
class Author extends Model {
  id!: number;

  static override relationMappings = defineRelations(() => ({
    mentor: {
      relation: Model.BelongsToOneRelation,
      modelClass: Author,
      join: { from: 'authors.mentorId', to: 'authors.id' },
    },
    books: {
      relation: Model.HasManyRelation,
      modelClass: Book,
      join: { from: 'authors.id', to: 'books.authorId' },
    },
  }));
}

interface Author extends RelationsOf<typeof Author> {}

class Book extends Model {
  id!: number;
  title!: string;

  static override relationMappings = defineRelations(() => ({
    author: {
      relation: Model.BelongsToOneRelation,
      modelClass: Author,
      join: { from: 'books.authorId', to: 'authors.id' },
    },
  }));
}

interface Book extends RelationsOf<typeof Book> {}

() => {
  const author = new Author();
  expectType<Author | null | undefined>()(author.mentor);
  expectType<Book[] | undefined>()(author.books);
  expectType<string | undefined>()(author.books?.[0].author?.mentor?.books?.[0].title);
  expectType<ModelInstance<typeof Book>[] | undefined>()(author.books);
};
