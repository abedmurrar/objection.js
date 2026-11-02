# TypeScript

The fork's typings are a lot stricter than objection 3.1.5's. Relations are inferred from `relationMappings`, query results only contain the relations the query loaded, and relation expressions, modifier names and `Model.ref()` columns are all checked at compile time. Each check has an opt-out, listed with it below. The [migration guide](../release-notes/migration.md) has before and after examples for existing code.

The typings are tested with `strict` on and off, and with TypeScript 7.

## Relations inferred from `relationMappings`

Relation properties no longer need to be declared next to `relationMappings`. Their types are inferred from the mappings:

```ts
import { Model, defineRelations } from 'objection';

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;

  // Don't annotate the type (like `: RelationMappingsThunk`): that throws away
  // the information the types are inferred from.
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

const person = Person.fromJson({ firstName: 'Jennifer' });

// fromJson() doesn't load anything, so every relation can be missing.
person.pets; // Animal[] | undefined
person.mom; // Person | null | undefined
// The `extra` columns of the join table are added to each related model.
person.movies; // (Movie & { role: PersonMovie['role'] })[] | undefined
```

::: details The other models of the examples on this page

```ts
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
```

`Person` also has the columns `momId!: number | null`, `address!: { street: string; city: string } | null` and `tags!: string[]`, which some examples use.

:::

In the comments on this page, `Animal` stands for the model with its inferred relations, and `ModelRow<Animal>` for a row of it. TypeScript shows these types as `Animal & InferredRelationProps<typeof Animal, Animal>` and `Row<Animal & InferredRelationProps<...>>`. In your own code, `ModelInstance<typeof Animal>` is that type (see below).

The extra columns are also on the results of relation queries:

```ts
// select "movies".*, "persons_movies"."role" as "role" from "movies"
// inner join "persons_movies" on "movies"."id" = "persons_movies"."movieId"
// where "persons_movies"."personId" in (1)
const movies = await Person.relatedQuery('movies').for(1);

// `role` is typed 'actor' | 'director', so a typo in 'director' is a compile error.
const directed = movies.filter((movie) => movie.role === 'director');
directed.map((movie) => movie.title); // string[]
```

- To-many relations (`HasManyRelation`, `ManyToManyRelation`) are arrays. To-one relations (`BelongsToOneRelation`, `HasOneRelation`, `HasOneThroughRelation`) are `Model | null`, because objection sets them to `null` when there's no related model. The relation classes carry their cardinality as `RelationType<'one' | 'many'>`.
- `relationMappings` can be an object or a function. `modelClass` can be a class or a function that returns one. Module paths (strings) and untyped values, like the result of `require()`, can't be inferred, so those relations are typed as `Model`.
- `defineRelations()` is optional. At runtime it returns the mappings unchanged, but it keeps the literal names of `extra` columns. Without it, those names are inferred as `string[]` and the extra columns are left out of the types. Extra columns are typed from `through.modelClass`, or as `unknown` when there isn't one.
- Relation properties declared in the class win over the inferred ones.

Inferred relations are added to the models objection creates: the results of `query()`, `relatedQuery()`, `fromJson()` and `fromDatabaseJson()`. To get them on `new Person()` and on `this` in the model's methods too, add this after the class:

```ts
interface Person extends RelationsOf<typeof Person> {}
```

This only works when no relation leads back to the model. `Person` above has two that do: `mom` refers to `Person` itself, and `pets` leads to `Animal`, whose `owner` refers to `Person`. For models like these, TypeScript reports a circularity error, like `Type 'Person' recursively references itself as a base type`. Use `ModelInstance<typeof Person>` instead, or declare the relation properties in the class.

`ModelInstance<typeof Person>` is the instance type with the inferred relations:

```ts
import { ModelInstance } from 'objection';

type PersonModel = ModelInstance<typeof Person>;

// `new Person()` is a Person without the inferred relations. Annotate it to get them.
const person: PersonModel = new Person();
person.pets; // Animal[] | undefined
```

### Checked relation names in `relatedQuery()`

`relatedQuery()` and `$relatedQuery()` only accept known relation names. If a name can't be checked, pass the related model type: `relatedQuery<Pet>(name)`.

`$relatedQuery()` of a to-one relation resolves to `Model | undefined`, because that's what it returns when there's no related model. Add `throwIfNotFound()` if you expect one.

```ts
// The pets of persons 1 and 2. `where()` checks the columns of Animal.
// select "animals".* from "animals" where "animals"."ownerId" in (1, 2) and "species" = 'dog'
const dogs = await Person.relatedQuery('pets').for([1, 2]).where('species', 'dog');
dogs; // ModelRow<Animal>[]

Person.relatedQuery('pet'); // Error: ... not assignable to parameter of type 'UnknownRelationName'

const person = await Person.query().findById(1).throwIfNotFound();

const mom = await person.$relatedQuery('mom'); // ModelRow<Person> | undefined
// Rejects with a NotFoundError when the person has no mom.
const surelyMom = await person.$relatedQuery('mom').throwIfNotFound(); // ModelRow<Person>

// A relation name only known at runtime: give the related model yourself.
const related = await person.$relatedQuery<Animal>(relationName); // ModelRow<Animal>[]
```

## Results only contain the relations the query loaded

`await Person.query()` is `ModelRow<Person>[]`, which is the model without its relation properties. Reading a relation the query didn't load is a compile error:

```ts
const person = await Person.query().findById(1).throwIfNotFound();
person.pets; // Error: Property 'pets' does not exist on type 'Row<Person & ...>'
```

Rows can still be used anywhere a `Person` is expected:

```ts
function greet(person: Person) {
  return `Hello, ${person.firstName}`;
}

greet(person); // OK: a row is a Person without the relation properties
```

### Graph methods add what they load

`withGraphFetched()`, `withGraphJoined()`, `fetchGraph()` and `$fetchGraph()` add the relations they load to the result type. This includes nested relations, aliases (`'pets as animals'`, `$relation`) and repeated calls:

```ts
const withPets = await Person.query()
  .withGraphFetched('[pets.owner, mom]')
  .findById(1)
  .throwIfNotFound();

withPets.pets[0].owner; // ModelRow<Person> | null
withPets.mom; // ModelRow<Person> | null
withPets.movies; // Error: not loaded

// $fetchGraph() can't change the type of `person`, so use the returned value.
const fetched = await person.$fetchGraph('pets');
fetched.pets; // ModelRow<Animal>[]
```

To-many relations are arrays. To-one relations are `| null`, or `| undefined` for relations declared as optional without `| null` (`mom?: Person`).

`modifyGraph()` keeps the loaded relations, and `withGraphJoined()` adds them the same way as `withGraphFetched()`:

```ts
const owners = await Person.query()
  .withGraphFetched('pets.toys')
  // `query` is a query builder of Animal, so 'species' and 'name' are checked.
  .modifyGraph('pets', (query) => query.where('species', 'dog').orderBy('name'))
  // objection still selects toys.animalId, which it needs to match toys to pets.
  .modifyGraph('pets.toys', (query) => query.select('id', 'name'));

owners[0].pets[0].toys; // ModelRow<Toy>[]

// One query with a join. Only the persons who own a dog are returned, and
// `pets` only contains their dogs.
const dogOwners = await Person.query()
  .withGraphJoined('pets')
  .where('pets.species', 'dog')
  .orderBy('persons.id');

dogOwners[0].pets; // ModelRow<Animal>[]
```

### `Loaded<M, E>`

`Loaded<M, E>` is the type of a model with the relations of expression `E` loaded, which is handy in annotations. For models with inferred relations, pass `ModelInstance<typeof Person>` as `M`. `Person` itself has no relation properties, so `Loaded<Person, 'pets'>` would type `pets` as `unknown`.

```ts
import { Loaded, ModelInstance } from 'objection';

type PersonModel = ModelInstance<typeof Person>;

async function findWithPets(
  id: number,
): Promise<Loaded<PersonModel, 'pets.toys'> | undefined> {
  return Person.query().findById(id).withGraphFetched('pets.toys');
}

const found = await findWithPets(1);
found?.pets[0].toys; // ModelRow<Toy>[] | undefined
```

Functions that need some relations can say so in their parameter types. Callers then have to load them:

```ts
// A person with their pets, the toys of the pets, and their mom.
type PersonWithFamily = Loaded<PersonModel, '[pets.toys, mom]'>;

function toyNames(person: PersonWithFamily): string[] {
  // No `?.` or `!` needed: the type says that pets and toys were loaded.
  return person.pets.flatMap((pet) => pet.toys.map((toy) => toy.name));
}

const people = await Person.query().withGraphFetched('[pets.toys, mom]');
people.map(toyNames); // string[][]

const withPetsOnly = await Person.query().withGraphFetched('pets');
withPetsOnly.map(toyNames);
// Error: ... Property 'mom' is missing in type 'Row<Person & ...> & { pets: Row<Animal & ...>[]; }'
```

### When all relations are optional again

The types can't see everything that loads relations. In these cases, the result has all of the model's relations as optional properties, as in objection 3:

- After modifiers that don't return the query builder, and after named modifiers. To keep a modifier's relations in the types, return the query builder from it: `(query) => query.withGraphFetched('pets')`.
- With relation expressions that aren't known at compile time, like a `string` variable.
- After `insertGraph()`, `upsertGraph()` and `castTo(Model)`.
- On query builders whose type is written out explicitly: `const query: QueryBuilder<Person> = ...`.
- On models with `private` or `protected` members, and models that declare a relation as required (`pets!: Pet[]`). Rows of these models couldn't be used where the model is expected otherwise.

Query builders change in place, but their types don't. A call like `query.withGraphFetched('pets')` whose return value isn't used doesn't change the type of `query`. Chain the calls instead, or give `query` an explicit type. An explicit type is what you want when a relation is only loaded sometimes:

```ts
// With the explicit type, the result has all relations as optional properties.
const query: QueryBuilder<PersonModel> = Person.query();

if (includePets) {
  query.withGraphFetched('pets');
}

const people = await query;
people[0].pets; // Animal[] | undefined

// Without it, `query` keeps the type of Person.query(), which loads nothing,
// and `people[0].pets` is a compile error even when includePets is true.
```

## Relation expressions are checked

A type-level parser follows the runtime grammar of relation expressions, in string and object notation. `withGraphFetched()`, `withGraphJoined()`, `fetchGraph()`, `$fetchGraph()`, `modifyGraph()`, `allowGraph()` and `joinRelated()` (and its variants) reject unknown relations, syntax errors, and `$modify` functions written for another model:

```ts
Person.query().withGraphFetched('pet');
// Error: ... parameter of type '"Unknown relation \"pet\""'

Person.query().withGraphFetched('[pets, mom.pets.toyz]');
// Error: ... '"Unknown relation \"toyz\" at \"mom.pets\""'

Person.query().withGraphFetched('[pets, mom');
// Error: ... '"Missing \"]\" in relation expression"'

Person.query().withGraphFetched({ pets: { toyz: true } });
// Error: ... '"Unknown relation \"toyz\" at \"pets\""'
```

The callback of `modifyGraph()` gets the query builder of the related model, including for aliases. You can still pass the model explicitly: `modifyGraph<Pet>(expr, modifier)`.

**Opt out:** pass the expression type for a single call, as in `withGraphFetched<string>(expression)`. Expressions typed as `string` aren't checked. Neither is anything after `castTo(Model)`. For relations that exist at runtime but not in the types, declare a property (`memberships?: Membership[]`) or use inferred `relationMappings`.

## Named modifiers are checked

The fork can know a model's modifiers when the static `modifiers` is an object without a type annotation, or a getter. In that case, modifier names are checked in `modify('name', ...args)`, in lists of modifiers, and in relation expressions (`'pets(onlyDogs)'`, `$modify: 'onlyDogs'`). The arguments are typed by the modifier:

```ts
class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;
  gender!: 'male' | 'female';
  parentId!: number | null;

  static relationMappings = defineRelations(() => ({
    children: {
      relation: Model.HasManyRelation,
      modelClass: Person,
      join: { from: 'persons.id', to: 'persons.parentId' },
    },
  }));

  // No type annotation here, so the names and the parameters are known.
  static modifiers = {
    filterGender(query: QueryBuilder<Person>, gender: 'male' | 'female') {
      query.where(Person.ref('gender'), gender);
    },
    // Modifiers in relation expressions are called without arguments.
    orderByName(query: QueryBuilder<Person>) {
      query.orderBy('firstName');
    },
  };
}

Person.query().modify('filterGender', 'female');
Person.query().modify('filterGender', 'x'); // Error: 'x' isn't 'male' | 'female'
Person.query().modify('filterGendr'); // Error: Unknown modifier "filterGendr"
Person.query().withGraphFetched('children(filterGendr)'); // Error

// The children are loaded, but the types can't see what a named modifier
// does, so each child has all of its relations as optional properties.
const people = await Person.query().withGraphFetched('children(orderByName)');
people[0].children; // Person[]
```

**Opt out:** annotate the property, as in `static modifiers: Modifiers = { ... }`. Names added with `modifiers()`, or by a modifier the types can't see, aren't known, so names aren't checked after them.

Modifier _functions_ passed to `modify()` are always checked. Only the model type of their query builder parameter has to match, so `(query: QueryBuilder<Person>) => void` works on `findById()` and `patch()` queries too. The rest of `modify()`'s arguments are checked against the modifier's parameters. Modifiers typed for a subtype of the query's model are accepted.

## `Model.ref()` checks columns

`Model.ref()` only accepts:

- columns of the model, optionally qualified with a table or an alias (`'p.firstName'`)
- `'*'`
- fields of JSON columns (`'address:street'`). The first key is checked when the column type has known keys.

Relations and methods aren't columns.

```ts
Person.ref('firstName'); // ReferenceBuilder<string>
Person.ref('middleName'); // Error: not a column
Person.ref('address:zip'); // Error: unknown key of `address`
Person.ref('address:street').castInt(); // ReferenceBuilder<number | null>
```

`ReferenceBuilder<T>` carries the type of the referenced value, and the casts change it. The [expression methods](./expressions.md) use it to check values: `Lesson.ref('order').eq('2')` is an error when `order` is a number.

`Model.ref()` adds the table name, so the columns stay unambiguous when the query joins other tables:

```ts
// `address` is typed { street: string; city: string } | null, so 'address:city'
// is accepted and 'address:zip' isn't.
await Person.query()
  .select('id', Person.ref('address:city').castText().as('city'))
  .where(Person.ref('address:city').castText(), 'Helsinki')
  .orderBy(Person.ref('firstName'));
```

```sql
-- postgres
select "id", CAST("persons"."address"#>>'{city}' AS text) as "city"
from "persons"
where CAST("persons"."address"#>>'{city}' AS text) = 'Helsinki'
order by "persons"."firstName" asc
```

**Opt out:** pass the expression as a type argument, as in `Person.ref<'legacy_column'>('legacy_column')`. Use `<string>` in generic code that works with any model class. Models that declare no columns accept any string.

## JSON field expressions in patches

`patch()`, `update()`, the `*AndFetch()` variants and `onConflict().merge()` accept field expression keys of JSON columns:

```ts
// Only changes `street`. The other keys of `address` are kept.
await Person.query().patch({ 'address:street': 'Main street' });
// `tags` is a JSON array column: set its first item.
await Person.query().findById(1).patch({ 'tags:[0]': 'first' });
await Person.query().patch({ 'firstName:a': 1 }); // Error: not a JSON column
await Person.query().insert({ 'address:street': 'x' }); // Error: insert doesn't support them
```

## Typed `fn` and `ref`

`FunctionBuilder<T>` carries the result type of the function. The [expression methods](./expressions.md) use it to check the values a function is compared with. The [MySQL helpers](./mysql.md#fn-helpers-for-mysql-functions) also check their argument counts and keywords:

```ts
fn.dateFormat(Event.ref('startsAt'), '%Y-%m'); // FunctionBuilder<string | null>
fn.timestampDiff('day', Event.ref('startsAt'), fn.now()); // FunctionBuilder<number | null>
fn.timestampDiff('days', ref('a'), ref('b')); // Error: invalid unit
fn.rowNumber().as('rn'); // Error: window functions need over()
fn.coalesce(ref('a')).filter(ref('b')); // Error: filter() is only on aggregates

// TIMESTAMPDIFF() returns a number, so it can't be compared with a string.
fn.timestampDiff('day', Event.ref('startsAt'), fn.now()).gt(30);
fn.timestampDiff('day', Event.ref('startsAt'), fn.now()).gt('30'); // Error
```

`fn.case()` results are the union of their branches. Without `else()`, `null` is part of the union:

```ts
fn.case().when(Event.ref('id').in(ids), 'manual').else('scraped'); // FunctionBuilder<'manual' | 'scraped'>
fn.case().when(Event.ref('id').in(ids), 'manual'); // CaseBuilder<'manual'>, a FunctionBuilder<'manual' | null>
```

`select()` doesn't add selected expressions to the result type: `await Event.query().select(fn.dateFormat(...).as('month'))` is still `ModelRow<Event>[]`. Use [`castTo<T>()`](#runafter-and-castto-t-set-the-result-type) to type rows with computed columns.

## Custom query builders need one declaration

Custom query builders used to redeclare five `*QueryBuilderType` properties. Now they declare `'~rebind'` once, and they keep their type through every method, including `throwIfNotFound()`, `castTo()`, `castTo(ModelClass)` and `runAfter()`:

```ts
import {
  Model,
  QueryBuilder,
  QueryBuilderState,
  DefaultQueryBuilderState,
} from 'objection';

class MyQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  // Tells the types how to make a MyQueryBuilder for another model, result
  // or state, which methods like findById() and first() need.
  declare '~rebind': MyQueryBuilder<this['~M'], this['~R'], this['~S']>;

  active(): this {
    return this.whereNull('deletedAt');
  }

  softDelete() {
    // The model type isn't known in generic code, so pass the patch type.
    return this.patch<{ deletedAt: Date }>({ deletedAt: new Date() });
  }
}

class BaseModel extends Model {
  // `static QueryBuilder` is used at runtime, `QueryBuilderType` by the types.
  static QueryBuilder = MyQueryBuilder;
  declare QueryBuilderType: MyQueryBuilder<this>;
}

class Person extends BaseModel {
  static tableName = 'persons';

  id!: number;
  firstName!: string;
  deletedAt!: Date | null;
}

// active() is still available after findById(), which changed the result kind.
const person = await Person.query().active().findById(1).active(); // ModelRow<Person> | undefined
// patch() resolves to the number of updated rows.
const numDeleted = await Person.query().where('id', 1).softDelete(); // number
```

- The type of the static `query()` comes from `static QueryBuilder`, since that's the class used at runtime. Before, a model that only declared `QueryBuilderType` type-checked custom methods that didn't exist.
- `first()`, `findById()` and the other result-kind changes resolve inside custom methods too, where `this` is generic.
- `patch()`, `update()` and `insert()` take an explicit type argument in generic code where the model type isn't known.

## `runAfter()` and `castTo<T>()` set the result type

```ts
// string[]
const names = await Person.query().runAfter((people) =>
  people.map((it) => it.firstName),
);

// Row | undefined
const row = await Person.query().castTo<Row[]>().first();
```

A `runAfter()` callback that returns nothing makes the result `undefined`, which is what happens at runtime. The methods that change the result kind (`first()`, `throwIfNotFound()`, ...) start from the type that `castTo<T>()` set. Union result types like `Person[] | Person | number` are preserved.

`castTo<T>()` is how to type queries that select computed columns, like reports. It only changes the type: the rows are still `Animal` instances at runtime, with the selected columns as properties.

```ts
// postgres returns count(*) as a string (it's a bigint). SQLite and MySQL return a number.
type SpeciesCount = { species: string; count: number | string };

// select "species", count(*) as "count" from "animals" group by "species" order by "count" desc
const counts = await Animal.query()
  .select('species')
  .count('* as count')
  .groupBy('species')
  .orderBy('count', 'desc')
  .castTo<SpeciesCount[]>();

counts; // SpeciesCount[], like [{ species: 'dog', count: 2 }, { species: 'cat', count: 1 }]

// first() after castTo() starts from SpeciesCount[].
const mostCommon = await Animal.query()
  .select('species')
  .count('* as count')
  .groupBy('species')
  .orderBy('count', 'desc')
  .castTo<SpeciesCount[]>()
  .first(); // SpeciesCount | undefined
```

## `AnyQueryBuilder<M>`

`AnyQueryBuilder<M>` is a query builder for model `M` of any result kind. Use it for functions that take query builders:

```ts
import { AnyQueryBuilder } from 'objection';

// Works on Person.query(), findById(), patch(), ... queries.
export function byName(query: AnyQueryBuilder<Person>, name: string) {
  query.where('firstName', name);
}

await Person.query().findById(1).modify(byName, 'Jennifer');
await Person.query().modify(byName, 1); // Error: name must be a string

// Generic over the query builder, so the caller gets its own type back.
function paginate<QB extends AnyQueryBuilder>(query: QB, page: number): QB {
  return query.limit(10).offset(page * 10);
}

// select "persons".* from "persons" order by "id" asc limit 10 offset 20
const third = await paginate(Person.query().orderBy('id'), 2); // ModelRow<Person>[]
```

## `ModelProps` and `ModelRelations` recognize more relation types

`ModelProps<M>` and `ModelRelations<M>` now count these properties as relations:

- properties typed `Model | null`
- properties typed as a union of a model and an array of models, like `pet?: Pet | Pet[]`

They also skip `QueryBuilderType` and the `~` keys.

## Join callbacks are typed as `JoinBuilder`

Join callbacks get objection's `JoinBuilder` instead of knex's `JoinClause`, so `ref()`, `Model.ref()` and expressions can be used for every column. See [Joins and model classes](./joins.md).

## Model classes as mixin bases

Model classes can be the base class of mixins, and plugins written as mixins keep the model's types and its queries:

```ts
type Constructor<T> = new (...args: any[]) => T;

function TimeStamps() {
  return function <T extends Constructor<Model>>(Base: T) {
    return class extends Base {
      createdAt?: Date;

      $beforeInsert() {
        this.createdAt = new Date();
      }
    };
  };
}

class Person extends TimeStamps()(Model) {
  static tableName = 'persons';

  name!: string;
}

// Person.query() is still a query builder of Person.
const row = await Person.query().where('name', 'Jennifer').first();
row?.name; // string | undefined
row?.createdAt; // Date | undefined (the column added by the mixin)
```

Set custom query builders in a shared base class rather than in a mixin. TypeScript intersects a mixin's query builder with the base class's query builder, and it can't type-check that intersection efficiently. See the [plugins recipe](../recipes/plugins.md).
