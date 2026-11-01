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

person.pets; // Animal[] | undefined
person.mom; // Person | null | undefined
person.movies; // (Movie & { role: PersonMovie['role'] })[] | undefined
```

- To-many relations (`HasManyRelation`, `ManyToManyRelation`) are arrays. To-one relations (`BelongsToOneRelation`, `HasOneRelation`, `HasOneThroughRelation`) are `Model | null`, because objection sets them to `null` when there's no related model. The relation classes carry their cardinality as `RelationType<'one' | 'many'>`.
- `relationMappings` can be an object or a function. `modelClass` can be a class or a function that returns one. Module paths (strings) and untyped values, like the result of `require()`, can't be inferred, so those relations are typed as `Model`.
- `defineRelations()` is optional. At runtime it returns the mappings unchanged, but it keeps the literal names of `extra` columns. Without it, those names are inferred as `string[]` and the extra columns are left out of the types. Extra columns are typed from `through.modelClass`, or as `unknown` when there isn't one.
- Relation properties declared in the class win over the inferred ones.

Inferred relations are added to the models objection creates: the results of `query()`, `relatedQuery()`, `fromJson()` and `fromDatabaseJson()`. To get them on `new Person()` and on `this` in the model's methods too, add this after the class:

```ts
interface Person extends RelationsOf<typeof Person> {}
```

`ModelInstance<typeof Person>` is the instance type with the inferred relations.

### Checked relation names in `relatedQuery()`

`relatedQuery()` and `$relatedQuery()` only accept known relation names. If a name can't be checked, pass the related model type: `relatedQuery<Pet>(name)`.

`$relatedQuery()` of a to-one relation resolves to `Model | undefined`, because that's what it returns when there's no related model. Add `throwIfNotFound()` if you expect one.

## Results only contain the relations the query loaded

`await Person.query()` is `ModelRow<Person>[]`, which is the model without its relation properties. Reading a relation the query didn't load is a compile error:

```ts
const person = await Person.query().findById(1).throwIfNotFound();
person.pets; // Error: Property 'pets' does not exist on type 'Row<Person>'
```

Rows can still be used anywhere a `Person` is expected.

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

const fetched = await person.$fetchGraph('pets'); // use the returned value
```

To-many relations are arrays. To-one relations are `| null`, or `| undefined` for relations declared as optional without `| null` (`mom?: Person`).

`Loaded<M, E>` is the type of a model with the relations of expression `E` loaded, which is handy in annotations:

```ts
async function findWithPets(
  id: number,
): Promise<Loaded<Person, 'pets.toys'> | undefined> {
  return Person.query().findById(id).withGraphFetched('pets.toys');
}
```

### When all relations are optional again

The types can't see everything that loads relations. In these cases, the result has all of the model's relations as optional properties, as in objection 3:

- After modifiers that don't return the query builder, and after named modifiers. To keep a modifier's relations in the types, return the query builder from it: `(query) => query.withGraphFetched('pets')`.
- With relation expressions that aren't known at compile time, like a `string` variable.
- After `insertGraph()`, `upsertGraph()` and `castTo(Model)`.
- On query builders whose type is written out explicitly: `const query: QueryBuilder<Person> = ...`.
- On models with `private` or `protected` members, and models that declare a relation as required (`pets!: Pet[]`). Rows of these models couldn't be used where the model is expected otherwise.

Query builders change in place, but their types don't. A call like `query.withGraphFetched('pets')` whose return value isn't used doesn't change the type of `query`. Chain the calls instead, or give `query` an explicit type.

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
  static modifiers = {
    filterGender(query: QueryBuilder<Person>, gender: 'male' | 'female') {
      query.where(Person.ref('gender'), gender);
    },
  };
}

Person.query().modify('filterGender', 'female');
Person.query().modify('filterGender', 'x'); // Error
Person.query().modify('filterGendr'); // Error: Unknown modifier "filterGendr"
Person.query().withGraphFetched('children(filterGendr)'); // Error
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

**Opt out:** pass the expression as a type argument, as in `Person.ref<'legacy_column'>('legacy_column')`. Use `<string>` in generic code that works with any model class. Models that declare no columns accept any string.

## JSON field expressions in patches

`patch()`, `update()`, the `*AndFetch()` variants and `onConflict().merge()` accept field expression keys of JSON columns:

```ts
await Person.query().patch({ 'address:street': 'Main street' });
await Person.query().findById(1).patch({ 'tags:[0]': 'first' });
await Person.query().patch({ 'firstName:a': 1 }); // Error: not a JSON column
await Person.query().insert({ 'meta:a': 1 }); // Error: insert doesn't support them
```

## Typed `fn` and `ref`

`FunctionBuilder<T>` carries the result type of the function. `select(fn.x().as('alias'))` uses it. The [MySQL helpers](./mysql.md#fn-helpers-for-mysql-functions) also check their argument counts and keywords:

```ts
fn.dateFormat(Event.ref('startsAt'), '%Y-%m'); // FunctionBuilder<string | null>
fn.timestampDiff('day', Event.ref('startsAt'), fn.now()); // FunctionBuilder<number | null>
fn.timestampDiff('days', ref('a'), ref('b')); // Error: invalid unit
fn.rowNumber().as('rn'); // Error: window functions need over()
fn.coalesce(ref('a')).filter(ref('b')); // Error: filter() is only on aggregates
```

`fn.case()` results are the union of their branches.

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
  static QueryBuilder = MyQueryBuilder;
  declare QueryBuilderType: MyQueryBuilder<this>;
}

const person = await Person.query().active().findById(1).active(); // Person | undefined
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

## `AnyQueryBuilder<M>`

`AnyQueryBuilder<M>` is a query builder for model `M` of any result kind. Use it for functions that take query builders:

```ts
import { AnyQueryBuilder } from 'objection';

export function byName(query: AnyQueryBuilder<Person>, name: string) {
  query.where('firstName', name);
}

await Person.query().findById(1).modify(byName, 'Jennifer');
await Person.query().modify(byName, 1); // Error: name must be a string

function paginate<QB extends AnyQueryBuilder>(query: QB, page: number): QB {
  return query.limit(10).offset(page * 10);
}
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
    };
  };
}

class Person extends TimeStamps()(Model) {
  name!: string;
}

const row = await Person.query().first();
row?.name; // string | undefined
row?.createdAt; // Date | undefined
```

Set custom query builders in a shared base class rather than in a mixin. TypeScript intersects a mixin's query builder with the base class's query builder, and it can't type-check that intersection efficiently. See the [plugins recipe](../recipes/plugins.md).
