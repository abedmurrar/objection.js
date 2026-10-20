# Migration from objection 3.x to 4.0

The runtime changes are listed in the [changelog](/release-notes/changelog.html#_4-0-0). This section covers the typescript changes.

## typescript: Custom query builders declare `'~rebind'` instead of five `*QueryBuilderType` properties

Custom query builders no longer redeclare `ArrayQueryBuilderType`, `SingleQueryBuilderType`, `MaybeSingleQueryBuilderType`, `NumberQueryBuilderType` and `PageQueryBuilderType`. Declare `'~rebind'` instead. The custom query builder type is now kept by every method, including `throwIfNotFound()`, `castTo()`, `runAfter()` and `castTo(ModelClass)` which used to return the base `QueryBuilder`.

```ts
// 3.x
class MyQueryBuilder<M extends Model, R = M[]> extends QueryBuilder<M, R> {
  ArrayQueryBuilderType!: MyQueryBuilder<M, M[]>;
  SingleQueryBuilderType!: MyQueryBuilder<M, M>;
  MaybeSingleQueryBuilderType!: MyQueryBuilder<M, M | undefined>;
  NumberQueryBuilderType!: MyQueryBuilder<M, number>;
  PageQueryBuilderType!: MyQueryBuilder<M, Page<M>>;
}

class BaseModel extends Model {
  QueryBuilderType!: MyQueryBuilder<this>;
  static QueryBuilder = MyQueryBuilder;
}

// 4.0
class MyQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  declare '~rebind': MyQueryBuilder<this['~M'], this['~R'], this['~S']>;
}

class BaseModel extends Model {
  static QueryBuilder = MyQueryBuilder;
  declare QueryBuilderType: MyQueryBuilder<this>;
}
```

The type of the static query methods like `query()` now comes from the static `QueryBuilder` property, because that decides the query builder class at runtime. Before, a model that declared `QueryBuilderType` but didn't set `static QueryBuilder` type checked custom methods that didn't exist at runtime.

## typescript: `runAfter()` changes the result type

The return value of the `runAfter()` callback replaces the result of the query, and the result type now reflects that. A callback that returns nothing makes the result `undefined`, which is what happens at runtime.

```ts
// string[]
const names = await Person.query().runAfter((people) =>
  people.map((it) => it.firstName),
);
```

## typescript: `castTo<T>()` sets the type of the result

`castTo<T>()` sets the result type to `T`, and the methods that change the result kind are based on it. For example `castTo<Row[]>().first()` is `Row | undefined`. Before, `castTo<Row>()` after `first()` silently dropped `undefined`.

## typescript: Relations are inferred from `relationMappings`

Relation properties no longer need to be declared in models, see the [relations guide](/guide/relations.html#typescript). To use it, remove the type annotation of `relationMappings` (`: RelationMappings` or `: RelationMappingsThunk`) and the relation property declarations, or wrap the mappings in `defineRelations()`. Declared relation properties keep working as before.

Relation names passed to `relatedQuery()` and `$relatedQuery()` are now checked. If a relation can't be inferred or declared, pass the related model type explicitly: `relatedQuery<Pet>('pets')`.

`$relatedQuery()` for a to-one relation now resolves to `Model | undefined`, since that's what it returns when there is no related model. Add `throwIfNotFound()` if you expect one.

## typescript: Generic functions that pass callbacks to `ModelClass<M>.query()`

With `strictFunctionTypes` disabled (as with `strict: false`), passing a `CallbackVoid<QueryBuilder<M>>` to `onBuild()` of a `ModelClass<M>.query()` query in generic code no longer compiles. Type the callback with the model's query builder type instead: `CallbackVoid<QueryBuilderType<M>>`.

## typescript: Modifiers

Use `AnyQueryBuilder<M>` as the parameter type of functions that take query builders of any result kind. Modifier functions passed to `modify()` are only checked for the model type of their query builder parameter, so `(query: QueryBuilder<Person>) => void` can be used with `findById()` and `patch()` queries too. The rest of the arguments of `modify()` are checked against the parameters of the modifier.

## typescript: `Model.ref()` only accepts the columns of the model

`Person.ref('firstName')` must name a property of `Person` (not a relation or a method), optionally qualified with a table or an alias (`'p.firstName'`), or a field of a JSON column (`'address:street'`). `Person.ref('*')` works too.

- Declare the columns the model is missing: `country?: string | null;`.
- For a column that belongs to another table, use `ref('alias.column')` or the other model's `ref()`.
- Dynamic column names need a column type: `columns: ModelProps<UserProfile>[]` instead of `string[]`, or `as const` on a list of allowed columns.
- To skip the check, pass the expression as a type argument: `Person.ref<'legacy_column'>('legacy_column')`, or `<string>` in generic code that works with any model class.

Models that declare no columns accept any string.

## typescript: Query results only have the relations the query loaded

`await Person.query()` is `ModelRow<Person>[]`: the model without its relation properties. Relations loaded with `withGraphFetched()`, `withGraphJoined()` or `fetchGraph()` are added, with the type of the loaded graph. See the [relations guide](/guide/relations.html#loaded-relations).

```ts
// Before: compiled, and `user.organization` was `Organization | undefined`.
const user = await User.query().findById(id).throwIfNotFound();
user.organization?.name;

// After: an error, since the query didn't load `organization`. Load it:
const user = await User.query()
  .findById(id)
  .withGraphFetched('organization')
  .throwIfNotFound();
user.organization?.name; // `organization` is always there, but can be null
```

Rows can still be passed where `User` is expected. Code that reads relations the types can't see being loaded needs one of these changes:

- **A modifier loads the relation.** Results after modifiers that don't return the query builder have all relations as optional properties, like before, so this keeps working. Returning the query builder from the modifier (`return query.withGraphFetched('organization')`) gives the exact type.
- **The query is changed in place.** `query.withGraphFetched('organization')` as a separate statement doesn't change the type of `query`. Chain the call, or declare the variable with an explicit type: `const query: QueryBuilder<User> = User.query()`. Explicit types keep relations optional.
- **The relation is set by hand.** `user.organization = org` is an error on rows. Use `user.$setRelated('organization', org)`, or the model type.
- **`await row.$fetchGraph('pets')` and then `row.pets`.** Use the value that `$fetchGraph()` returns.

Models with `private` or `protected` members, and models that declare a relation as required (`pets!: Pet[]`), keep all relations as optional properties on rows.

## typescript: Relation expressions are checked

The relation names in `withGraphFetched()`, `withGraphJoined()`, `fetchGraph()`, `modifyGraph()`, `allowGraph()` and `joinRelated()` must be relations of the model, both in strings (`'[pets.toys, mom]'`) and in object notation. A misspelled name is an error like `Unknown relation "toyz" at "pets"`.

- Relations that work at runtime but aren't in the types need a property declaration: `memberships?: Membership[];`, or inferred `relationMappings`.
- To skip the check for one call, pass the expression type explicitly: `withGraphFetched<string>(expression)`. Expressions typed `string` aren't checked.
- After `castTo(Model)` relation names aren't checked, since the runtime model is still the original one.

The callback of `modifyGraph()` now gets the query builder of the related model. Callbacks with a parameter type for another model are errors.

## typescript: Named modifiers are checked

When the static `modifiers` of a model is an object without a type annotation, or a getter, `modify('name')` and modifier names in relation expressions (`'pets(onlyDogs)'`) must be modifiers of the model, and the arguments of `modify()` are checked against the modifier. Annotate the property as `static modifiers: Modifiers = {...}` to opt out. Names added with `modifiers()` aren't known, so they aren't checked after it.

## Field expressions and `NULL` JSON columns

`patch({ 'col:key': value })` on a row where `col` is `NULL` sets `col` to `{ "key": value }` (or an array, if the path starts with an index). Before, `col` stayed `NULL` on postgres.

# Migration from objection 2.x to 3.0

This document guides you through each breaking change in objection 3.0 and attempts to provide clear steps to follow. If you find something missing, please open an issue and we'll fix this guide ASAP.

Here's a list of the breaking changes

- [Dropped support for node < 12](#dropped-support-for-node-12)
- [Dropped support for knex < 0.95](#dropped-support-for-knex-0-95)
- [typescript: Methods like `findById` and `findOne` that return a single item are now typed correctly](#typescript-methods-like-findbyid-and-findone-that-return-a-single-item-are-now-typed-correctly)
- [typescript: `QueryBuilder` now inherits `PromiseLike` instead of `Promise`](#typescript-querybuilder-now-inherits-promiselike-instead-of-promise)
- [Dropped a bunch of deprecated methods and features](#dropped-a-bunch-of-deprecated-methods-and-features)

## Dropped support for node < 12

Objection 3.0 needs at least node 12 to work.

## Dropped support for knex < 0.95

Objection needs at least knex 0.95.0 to work.

This is because knex introduced some breaking changes in 0.95.0.

## typescript: Methods like `findById` and `findOne` that return a single item are now typed correctly

In 2.0 methods like `findById`, `findOne` and `first` that return one item or undefined were incorrectly typed
to always return a value. Now the return type of those methods is `SomeModel | undefined`.

You'll get compilation errors in places where you've trusted the old typings. All you need to do is to add a
check for undefined values to narrow down the type or chain the `throwIfNotFound` method that also narrows
down the type back to `SomeModel`.

Before:

```ts
const person = await Person.query().findById(id);
console.log(person.id);
```

After:

```ts
const person = await Person.query().findById(id);

if (!person) {
  throw new Error('Person not found');
}

console.log(person.id);
```

Or

```ts
const person = await Person.query().findById(id).throwIfNotFound();
console.log(person.id);
```

## typescript: `QueryBuilder` now inherits `PromiseLike` instead of `Promise`

In 2.0 and before, the `QueryBuilder` class inherited `Promise` in the typings which made code like this possible

```ts
function findPerson(id: number): Promise<Person> {
  return Person.query().findById(id);
}
```

However, `QueryBuilder` doesn't actually inherit `Promise` but instead is "thenable". Typescript has the type
`PromiseLike` for thenable objects which objection now correctly uses. There are couple of ways to fix the
compilation errors this change causes:

1. Chain `execute` to the query:

```ts
function findPerson(id: number): Promise<Person> {
  return Person.query().findById(id).execute();
}
```

2. Use `PromiseLike`:

```ts
function findPerson(id: number): PromiseLike<Person> {
  return Person.query().findById(id);
}
```

3. Make the functions `async`:

```ts
async function findPerson(id: number): Promise<Person> {
  return Person.query().findById(id);
}
```

## Dropped a bunch of deprecated methods and features

All the methods that were marked deprecated (and printed a deprection message during runtime) in 2.0 have
now been removed.

<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>
<br>

# Migration from objection 1.x to 2.0

Objection 2.0 brought a lot of great new features, but the main focus was in cleaning the API, which lead to a bunch of breaking changes. This document guides you through each change and attempts to provide clear steps to follow. If you find something missing, please open an issue and we'll fix this guide ASAP.

Here's a list of the breaking changes

- [Node 6 and 7 are no longer supported](#node-6-and-7-are-no-longer-supported)
- [modify method signature change](#modify-method-signature-change)
- [Bluebird and lodash have been removed](#bluebird-and-lodash-have-been-removed)
- [Database errors now come from db-errors library](#database-errors-now-come-from-the-db-errors-library)
- [#ref references in insertGraph and upsertGraph now require the allowRefs: true option](#ref-references-in-insertgraph-and-upsertgraph-now-require-the-allowrefs-true-option)
- [relate method now always returns the number of affected rows](#relate-method-now-always-returns-the-number-of-affected-rows)
- [\$relatedQuery no longer mutates](#relatedquery-no-longer-mutates)
- [context now acts like mergeContext](#context-now-acts-like-mergecontext)
- [Model.raw and Model.fn now return objection raw and fn](#model-raw-and-model-fn-now-return-objection-raw-and-fn)
- [QueryBuilder.toString and QueryBuilder.toSql have been removed](#querybuilder-tostring-and-querybuilder-tosql-have-been-removed)
- [Rewritten typings](#rewritten-typings)

In addition to these, **a lot** of methods were deprecated and replaced by a new method. The old methods still work, but they print a warning (once per process) when you use them. The warning message tells which method you should be using in the future and you can slowly replace the methods as you get annoyed by the warnings.

Most of the methods have simply been renamed, but in some cases the replacing methods work a little differently. Make sure to read the documentation of the new method.

## Node 6 and 7 are no longer supported

Objection now needs at least node 8 to work.

## `modify` method signature change

Before, you were able to provide multiple modifiers or modifier names to `modify` by providing multiple arguments like this:

```js
Person.query().modify('foo', 'bar');
```

Now only the first argument is used to specify modifiers and all the rest are arguments for the modifiers. The first argument can be an array so you can simply wrap the modifiers in an array if there are more than one of them:

```js
Person.query().modify(['foo', 'bar']);
```

## Bluebird and lodash have been removed

Before, all async operations returned a bluebird promise. Now the bluebird dependency has been dropped and the native `Promise` is used instead. This also means that all bluebird-specific methods

- `map`
- `reduce`
- `reflect`
- `bind`
- `spread`
- `asCallback`
- `nodeify`

have been removed from the `QueryBuilder`.

You need to go through your code and make sure you don't use any bluebird methods or trust that objection returns a bluebird promise.

Objection also used to export `Promise` and `lodash` properties like this:

```js
import { Promise, lodash } from 'objection';
```

which is not true anymore. Both of those exports have been removed.

## Database errors now come from the db-errors library

Before, when a database operation failed, objection simply passed through the native error thrown by the database client. In 2.0 the errors are wrapped using the [db-errors](https://github.com/Vincit/db-errors) library.

The `db-errors` library errors expose a `nativeError` property. If you rely on the properties of the old errors, you can simply change code like this

```js
try {
  await Person.query().where('foo', 'bar')
} catch (err) {
  if (err.code === 13514) {
    ...
  }
}
```

into this:

```js
try {
  await Person.query().where('foo', 'bar')
} catch (err) {
  err = err.nativeError || err

  if (err.code === 13514) {
    ...
  }
}
```

A preferred way to handle this would be to use the new `db-error` classes as described [here](/recipes/error-handling.html#error-handling), but the fastest migration path is to do the above trick.

## #ref references in insertGraph and upsertGraph now require the allowRefs: true option

The usage of `'#ref': 'someId'` and `#ref{someId.someProp}` now requires an explicit `allowRefs: true` option to be passed to the called method:

```js
await Person.query().insertGraph(graphWithRefs, { allowRefs: true });
```

This change was made for security reasons. An attacker could, in theory, use a `#ref{someId.someProperty}` reference to access for example the password hash of a user:

```js
const graphUpsertSentByTheAttacker = {
  user: {
    id: 13431,
    '#id': 'user',
  },

  movie: {
    name: '#ref{user.passwordHash}',
  },
};
```

and then the attacker could just take the password hash out of the movies's name in a client of some sort.

For this attack to work, the attacker must already have an access to the API that modifies the user's information. Additionally and more importantly, the graph described above (and all other graphs I could think of) would only yield the password hash in the movie's name **if the program sets the hash to the graph before the `upsertGraph` call is executed**. This is a highly unlikely scenario and in case of passowords, would require the attacker to be able to access a route that changes the user's password. The reference can never access the property in the database, only in the object itself.

Even though there's very little chance this kind of attack could be carried out at the moment, I'd advice you to never use `upsertGraph` with `{ allowRefs: true }` and unvalidated user input with references!

## relate method now always returns the number of affected rows

`relate` used to return the inserted pivot table row in case of `ManyToManyRelation` and the number of updated rows in case of other relations. Now an integer indicating the number of affected rows is always returned.

You need to go through your code and check how the return values of `relate` queries are used.

## \$relatedQuery no longer mutates

With objection 1.x, doing this

```js
await somePerson.$relatedQuery('pets');
```

added a property `pets` for `somePerson` and saved the result there. This no longer happens with objection 2. Also inserting a new item using

```js
await somePerson.$relatedQuery('pets').insert(pet);
```

would previously add the inserted pet to the `pets` array of `somePerson`. This also no longer happens.

You can use `withGraphFetched` and `fetchGraph` methods if you want to populate the relations. Also, nothing prevents you from doing this:

```js
somePerson.pets = await somePerson.$relatedQuery('pets');
```

You can also use the `Model.relatedInsertQueryMutates` and `Model.relatedFindQueryMutates` properties to revert back to 1.x behavior. Note that those properties are now deprecated and will be removed in 3.0.

## context() now acts like mergeContext()

The `context` method of `QueryBuilder` now merges the given object with the current context object instead of replacing it. You can use `clearContext` to clear the context if you need the old behaviour.

## Model.raw and Model.fn now return objection raw and fn

Previously `Model.raw` returned a knex raw builder and `Model.fn` returned a knex `FunctionHelper` instance. In 2.0 objection's [raw](/api/objection/#raw) and [fn](/api/objection/#fn) helpers are returned. To get a knex `raw` builder, you need to use `knex.raw` directly.

## QueryBuilder.toString and QueryBuilder.toSql have been removed

You can use `QueryBuilder.toKnexQuery().toSQL()` instead.

## Rewritten typings

The typings have been completely rewritten in 2.0 and many of the types have changed names. By default you shouldn't get that many errors, but whenever you have explicitly defined an objection type for something other than `Model`, you may need to adjust that type. For example the `QueryBuilder` no longer takes three generic arguments, but two.

For this breaking change we can't easily provide clear migration steps, because we don't know how much you have trusted the typescript type inference, and how much you have used explicit types.

One notable change is that you should no longer define your relations properties using `Partial<Model>` or `Partial<Model>[]`. You can simply use `Model` and `Model[]` and methods like `insertGraph` and `upsertGraph` will just work.
