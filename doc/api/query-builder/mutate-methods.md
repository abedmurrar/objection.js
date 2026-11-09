# Mutating Methods

## insert()

```js
queryBuilder = queryBuilder.insert(modelsOrObjects);
```

Creates an insert query.

The inserted objects are validated against the model's [jsonSchema](/api/model/static-properties.html#static-jsonschema). If validation fails
the Promise is rejected with a [ValidationError](/api/types/#class-validationerror).

NOTE: The return value of the insert query _only_ contains the properties given to the insert
method plus the identifier. This is because we don't make an additional fetch query after
the insert. On postgres and SQLite you can chain [returning('\*')](/api/query-builder/find-methods.html#returning) to the query to get all
properties - see [this recipe](/recipes/returning-tricks.html) for some examples. If you use
`returning(['only', 'some', 'props'])` note that the result object will still contain the input properties
**plus** the properties listed in `returning`. On other databases you can use the [insertAndFetch](/api/query-builder/mutate-methods.html#insertandfetch) method.

Batch inserts work on all databases. Postgres, SQL Server and SQLite return the
ids of all inserted rows (SQLite 3.35 or newer is needed for batch inserts). MySQL only
returns the id of the first row, so objection computes the other ids. InnoDB gives the rows of
one multi-row insert consecutive ids, `@@auto_increment_increment` apart. On MySQL:

- Set the id of either all rows or none of them. A batch where only some rows have an id
  fails before anything is inserted, because the ids of the other rows can't be known.
- With `onConflict()`, rows can be skipped or updated, so the ids aren't set.

See [Batch inserts](/fork/mysql.md#batch-inserts).

##### Arguments

| Argument        | Type                                                                                                           | Description       |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ----------------- |
| modelsOrObjects | Object&nbsp;&#124;&nbsp;[Model](/api/model/)&nbsp;&#124;&nbsp;Object[]&nbsp;&#124;&nbsp;[Model](/api/model/)[] | Objects to insert |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const jennifer = await Person.query().insert({
  firstName: 'Jennifer',
  lastName: 'Lawrence'
});

console.log(jennifer.id);
```

Batch insert:

```js
const actors = await Movie.relatedQuery('actors')
  .for(someMovie)
  .insert([
    { firstName: 'Jennifer', lastName: 'Lawrence' },
    { firstName: 'Bradley', lastName: 'Cooper' }
  ]);

console.log(actors[0].firstName);
console.log(actors[1].firstName);
```

You can also give raw expressions and subqueries as values like this:

```js
const { raw } = require('objection');

await Person.query().insert({
  age: Person.query().avg('age'),
  firstName: raw('upper(?)', ['jennifer'])
});
```

Fields marked as `extras` for many-to-many relations in [relationMappings](/api/model/static-properties.html#static-relationmappings) are automatically
written to the join table instead of the target table. The `someExtra` field in the following example is written
to the join table if the `extra` array of the relation mapping contains the string `'someExtra'`. See [this recipe](/recipes/extra-properties.html) for more info.

```js
const jennifer = await Movie.relatedQuery('actors')
  .for(someMovie)
  .insert({
    firstName: 'Jennifer',
    lastName: 'Lawrence',
    someExtra: "I'll be written to the join table"
  });

console.log(jennifer.someExtra);
```

## insertAndFetch()

```js
queryBuilder = queryBuilder.insertAndFetch(modelsOrObjects);
```

Just like [insert](/api/query-builder/mutate-methods.html#insert) but also fetches the item afterwards.

Note that on postgres and SQLite you can just chain [returning('\*')](/api/query-builder/find-methods.html#returning) to the normal insert query to get the same result without an additional query. See [this recipe](/recipes/returning-tricks.html) for some examples.

##### Arguments

| Argument        | Type                                                                                                           | Description       |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ----------------- |
| modelsOrObjects | Object&nbsp;&#124;&nbsp;[Model](/api/model/)&nbsp;&#124;&nbsp;Object[]&nbsp;&#124;&nbsp;[Model](/api/model/)[] | Objects to insert |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## insertGraph()

```js
queryBuilder = queryBuilder.insertGraph(graph, options);
```

See the [section about graph inserts](/guide/query-examples.html#graph-inserts).

##### Arguments

| Argument | Type                                                                                                           | Description       |
| -------- | -------------------------------------------------------------------------------------------------------------- | ----------------- |
| graph    | Object&nbsp;&#124;&nbsp;[Model](/api/model/)&nbsp;&#124;&nbsp;Object[]&nbsp;&#124;&nbsp;[Model](/api/model/)[] | Objects to insert |
| options  | [InsertGraphOptions](/api/types/#type-insertgraphoptions)                                                      | Optional options. |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## insertGraphAndFetch()

Exactly like [insertGraph](/api/query-builder/mutate-methods.html#insertgraph) but also fetches the graph from the db after insert. Note that on postgres, you can simply chain [returning('\*')](/api/query-builder/find-methods.html#returning) to the normal `insertGraph` query to get the same result without additional queries.

## patch()

```js
queryBuilder = queryBuilder.patch(modelOrObject);
```

Creates a patch query.

The patch object is validated against the model's [jsonSchema](/api/model/static-properties.html#static-jsonschema) (if one is defined) _but_ the `required` property of the [jsonSchema](/api/model/static-properties.html#static-jsonschema) is ignored. This way the properties in the patch object are still validated but an error isn't thrown if the patch object doesn't contain all required properties.

If validation fails the Promise is rejected with a [ValidationError](/api/types/#class-validationerror).

The return value of the query will be the number of affected rows. If you want to update a single row and retrieve the updated row as a result, you may want to use the [patchAndFetchById](/api/query-builder/mutate-methods.html#patchandfetchbyid) method or _take a look at [this recipe](/recipes/returning-tricks.html) if you're using Postgres_.

::: tip
This generates an SQL `update` query. While there's also the [update](/api/query-builder/mutate-methods.html#update) method, `patch` is what you want to use most of the time for updates. Read both methods' documentation carefully. If unsure or hate reading, use `patch` to update stuff :smile:
:::

::: warning
[raw](/api/objection/#raw), [val](/api/objection/#val), subqueries and other "query properties" in the patch object are not validated. Also fields specified using [FieldExpressions](/api/types/#type-fieldexpression) are not validated.
:::

##### Arguments

| Argument      | Type                                         | Description      |
| ------------- | -------------------------------------------- | ---------------- |
| modelOrObject | Object&nbsp;&#124;&nbsp;[Model](/api/model/) | The patch object |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

Patching a single row:

```js
const numberOfAffectedRows = await Person.query()
  .patch({ age: 24 })
  .findById(personId);

console.log(numberOfAffectedRows);
```

Patching multiple rows:

```js
const numberOfAffectedRows = await Person.query()
  .patch({ age: 20 })
  .where('age', '<', 50);
```

Increment a value atomically:

```js
const numberOfAffectedRows = await Person.query()
  .patch({ age: raw('age + 1') })
  .where('age', '<', 50);
```

You can also give raw expressions, subqueries and `ref()` as values and [FieldExpressions](/api/types/#type-fieldexpression) as keys. Note that none of these are validated. Objection cannot know what their values will be at the time the validation is done.

```js
const { ref, raw } = require('objection');

await Person.query().patch({
  age: Person.query().avg('age'),
  // You can use knex.raw instead of `raw()` if
  // you prefer.
  firstName: raw('upper(?)', ['jennifer']),
  oldLastName: ref('lastName'),
  // This updates a value nested deep inside a
  // json column `detailsJsonColumn`.
  'detailsJsonColumn:address.street': 'Elm street'
});
```

Field expression keys work on postgres and MySQL, and throw on other databases. Only the given field changes, the rest of the JSON column is kept. If the column is `NULL`, the patch creates the object, or an array if the path starts with an index. See [JSON field expressions](/fork/mysql.md#json-field-expressions) and [Breaking changes](/fork/breaking-changes.md#patching-a-field-of-a-null-json-column-creates-the-object).

## patchAndFetchById()

```js
queryBuilder = queryBuilder.patchAndFetchById(id, modelOrObject);
```

Just like [patch](/api/query-builder/mutate-methods.html#patch) for a single item, but also fetches the updated row from the database afterwards.

##### Arguments

| Argument      | Type                                         | Description                                               |
| ------------- | -------------------------------------------- | --------------------------------------------------------- |
| id            | any                                          | Identifier of the item to update. Can be a composite key. |
| modelOrObject | Object&nbsp;&#124;&nbsp;[Model](/api/model/) | The patch object                                          |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const updatedPerson = await Person.query().patchAndFetchById(134, { age: 24 });

console.log(updatedPerson.firstName);
```

## patchAndFetch()

```js
queryBuilder = queryBuilder.patchAndFetch(modelOrObject);
```

Just like [patchAndFetchById](/api/query-builder/mutate-methods.html#patchandfetchbyid) but can be used in an instance [\$query](/api/model/instance-methods.html#query) without the need to specify the id.

##### Arguments

| Argument      | Type                                         | Description      |
| ------------- | -------------------------------------------- | ---------------- |
| modelOrObject | Object&nbsp;&#124;&nbsp;[Model](/api/model/) | The patch object |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const jennifer = await Person.query().findOne({ firstName: 'Jennifer' });
const updatedJennifer = await jennifer.$query().patchAndFetch({ age: 24 });

console.log(updatedJennifer.firstName);
```

## update()

```js
queryBuilder = queryBuilder.update(modelOrObject);
```

Creates an update query.

The update object is validated against the model's [jsonSchema](/api/model/static-properties.html#static-jsonschema). If validation fails the Promise is rejected with a [ValidationError](/api/types/#class-validationerror).

Use `update` if you update the whole row with all its columns. Otherwise, using the [patch](/api/query-builder/mutate-methods.html#patch) method is recommended. When `update` method is used, the validation respects the schema's `required` properties and throws a [ValidationError](/api/types/#class-validationerror) if any of them are missing. [patch](/api/query-builder/mutate-methods.html#patch) ignores the `required` properties and only validates the ones that are found.

The return value of the query will be the number of affected rows. If you want to update a single row and retrieve the updated row as a result, you may want to use the [updateAndFetchById](/api/query-builder/mutate-methods.html#updateandfetchbyid) method or _take a look at [this recipe](/recipes/returning-tricks.html) if you're using Postgres_.

##### Arguments

| Argument      | Type                                         | Description       |
| ------------- | -------------------------------------------- | ----------------- |
| modelOrObject | Object&nbsp;&#124;&nbsp;[Model](/api/model/) | The update object |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const numberOfAffectedRows = await Person.query()
  .update({ firstName: 'Jennifer', lastName: 'Lawrence', age: 24 })
  .where('id', 134);

console.log(numberOfAffectedRows);
```

You can also give raw expressions, subqueries and `ref()` as values like this:

```js
const { raw, ref } = require('objection');

await Person.query().update({
  firstName: raw('upper(?)', ['jennifer']),
  lastName: 'Lawrence',
  age: Person.query().avg('age'),
  oldLastName: ref('lastName') // same as knex.raw('??', ['lastName'])
});
```

Updating single value inside json column and referring attributes inside json columns (postgres and MySQL) etc.:

```js
await Person.query().update({
  lastName: ref('someJsonColumn:mother.lastName').castText(),
  'detailsJsonColumn:address.street': 'Elm street'
});
```

## updateAndFetchById()

```js
queryBuilder = queryBuilder.updateAndFetchById(id, modelOrObject);
```

Just like [update](/api/query-builder/mutate-methods.html#update) for a single item, but also fetches the updated row from the database afterwards.

##### Arguments

| Argument      | Type                                         | Description                                               |
| ------------- | -------------------------------------------- | --------------------------------------------------------- |
| id            | any                                          | Identifier of the item to update. Can be a composite key. |
| modelOrObject | Object&nbsp;&#124;&nbsp;[Model](/api/model/) | The update object                                         |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const updatedPerson = await Person.query().updateAndFetchById(134, person);

console.log(updatedPerson.firstName);
```

## updateAndFetch()

```js
queryBuilder = queryBuilder.updateAndFetch(modelOrObject);
```

Just like [updateAndFetchById](/api/query-builder/mutate-methods.html#updateandfetchbyid) but can be used in an instance [\$query](/api/model/instance-methods.html#query) without the need to specify the id.

##### Arguments

| Argument      | Type                                         | Description       |
| ------------- | -------------------------------------------- | ----------------- |
| modelOrObject | Object&nbsp;&#124;&nbsp;[Model](/api/model/) | The update object |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const jennifer = await Person.query().findOne({ firstName: 'Jennifer' });
const updatedJennifer = await jennifer.$query().updateAndFetch({ age: 24 });

console.log(updatedJennifer.firstName);
```

## upsertGraph()

```js
queryBuilder = queryBuilder.upsertGraph(graph, options);
```

See the [section about graph upserts](/guide/query-examples.html#graph-upserts).

::: warning
WARNING!

Before you start using `upsertGraph` beware that it's not the silver bullet it seems to be. If you start using it because it seems to provide a "mongodb API" for a relational database, you are using it for a wrong reason!

Our suggestion is to first try to write any code without it and only use `upsertGraph` if it saves you **a lot** of code and makes things simpler. Over time you'll learn where `upsertGraph` helps and where it makes things more complicated. Don't use it by default for everything. You can search through the objection issues to see what kind of problems `upsertGraph` can cause if used too much.

For simple things `upsertGraph` calls are easy to understand and remain readable. When you start passing it a bunch of options it becomes increasingly difficult for other developers (and even yourself) to understand.

It's also really easy to create a server that doesn't work well with multiple users by overusing `upsertGraph`. That's because you can easily get into a situation where you override other user's changes if you always upsert large graphs at a time. Always try to update the minimum amount of rows and columns and you'll save yourself a lot of trouble in the long run.
:::

##### Arguments

| Argument | Type                                                                                                           | Description       |
| -------- | -------------------------------------------------------------------------------------------------------------- | ----------------- |
| graph    | Object&nbsp;&#124;&nbsp;[Model](/api/model/)&nbsp;&#124;&nbsp;Object[]&nbsp;&#124;&nbsp;[Model](/api/model/)[] | Objects to upsert |
| options  | [UpsertGraphOptions](/api/types/#type-upsertgraphoptions)                                                      | Optional options. |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## upsertGraphAndFetch()

Exactly like [upsertGraph](/api/query-builder/mutate-methods.html#upsertgraph) but also fetches the graph from the db after the upsert operation.

## delete()

```js
queryBuilder = queryBuilder.delete();
```

Creates a delete query.

The return value of the query will be the number of deleted rows. if you're using Postgres
and want to get the deleted rows, _take a look at [this recipe](/recipes/returning-tricks.html)_.

Also see [deleteById](/api/query-builder/mutate-methods.html#deletebyid).

`delete().limit(n)` only works on MySQL. knex rejects a limit on deletes on the other databases, and so does [page](/api/query-builder/other-methods.html#page) or [range](/api/query-builder/other-methods.html#range) on a delete query. See [Deletes with a limit](/fork/knex.md#deletes-with-a-limit).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const numberOfDeletedRows = await Person.query()
  .delete()
  .where('age', '>', 100);

console.log('removed', numberOfDeletedRows, 'people');
```

You can always use subqueries and all query building methods with `delete` queries, just like with every query in objection. With some databases, you cannot use joins with deletes (db restriction, not objection). You can replace joins with subqueries like this:

```js
// This query deletes all people that have a pet named "Fluffy".
await Person.query()
  .delete()
  .whereIn(
    'id',
    Person.query()
      .select('persons.id')
      .joinRelated('pets')
      .where('pets.name', 'Fluffy')
  );

// This is another way to implement the same query.
await Person.query()
  .delete()
  .whereExists(Person.relatedQuery('pets').where('pets.name', 'Fluffy'));
```

Delete can of course be used with [\$relatedQuery](/api/model/instance-methods.html#relatedquery) and [\$query](/api/model/instance-methods.html#query) too.

```js
const person = await Person.query().findById(personId);

// Delete all pets but cats and dogs of a person.
await person
  .$relatedQuery('pets')
  .delete()
  .whereNotIn('species', ['cat', 'dog']);

// Delete all pets of a person.
await person.$relatedQuery('pets').delete();
```

The where clauses you add are wrapped in parentheses, so an `orWhere()` can't delete the rows of other owners. See [Breaking changes](/fork/breaking-changes.md#orwhere-no-longer-escapes-the-conditions-objection-adds).

## del()

```js
queryBuilder = queryBuilder.del();
```

The same as [delete](/api/query-builder/mutate-methods.html#delete).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## using()

```js
await Person.query()
  .delete()
  .using('pets')
  .where('pets.ownerId', ref('persons.id'))
  .where('pets.species', 'snake');
```

postgres only. The tables a delete query can refer to: `delete from "persons" using "pets" where ...`. On other databases it throws. See [knex documentation](https://knexjs.org/guide/query-builder.html#using) and [knex methods](/fork/knex.md#new-methods).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## deleteById()

```js
queryBuilder = queryBuilder.deleteById(id);
```

Deletes an item by id.

The return value of the query will be the number of deleted rows. if you're using Postgres and want to get the deleted rows, _take a look at [this recipe](/recipes/returning-tricks.html)_.

##### Arguments

| Argument | Type                       | Description                                                                                                |
| -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| id       | any&nbsp;&#124;&nbsp;any[] | The id. Array for composite keys. This method doesn't accept multiple identifiers! See the examples below. |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const numberOfDeletedRows = await Person.query().deleteById(1);

console.log('removed', numberOfDeletedRows, 'people');
```

Delete single item with a composite key:

```js
const numberOfDeletedRows = await Person.query().deleteById([10, '20', 46]);

console.log('removed', numberOfDeletedRows, 'people');
```

## relate()

```js
queryBuilder = queryBuilder.relate(ids);
```

Relate (attach) an existing item to another item through a relation.

This method doesn't create a new item but only updates the foreign keys. In
the case of a many-to-many relation, creates a join row to the join table.

For HasMany and ManyToMany relations, several items can be related at once by giving an array of identifiers. A ManyToMany relation can relate items to several owners at once only on postgres.

The return value of the query is the number of affected items.

##### Arguments

| Argument | Type                                                                          | Description                             |
| -------- | ----------------------------------------------------------------------------- | --------------------------------------- |
| ids      | number&nbsp;&#124;&nbsp;string&nbsp;&#124;&nbsp;Array&nbsp;&#124;&nbsp;Object | Identifier(s) of the model(s) to relate |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

In the following example we relate an actor to a movie. In this example the relation between `Person` and `Movie` is a many-to-many relation but `relate` also works for all other relation types.

```js
const actor = await Person.query().findById(100);
```

```sql
select "persons".* from "persons" where "persons"."id" = 100
```

```js
const movie = await Movie.query().findById(200);
```

```sql
select "movies".* from "movies" where "movies"."id" = 200
```

```js
await actor.$relatedQuery('movies').relate(movie);
```

```sql
insert into "persons_movies" ("movieId", "personId") values (200, 100) returning "movieId"
```

You can also pass the id `200` directly to `relate` instead of passing a model instance. A more objectiony way of doing this would be to utilize the static [relatedQuery](/api/model/static-methods.html#static-relatedquery) method:

```js
await Person.relatedQuery('movies')
  .for(100)
  .relate(200);
```

```sql
insert into "persons_movies" ("movieId", "personId") values (200, 100) returning "movieId"
```

The next example relates four movies to the first person whose first name is Arnold.

```js
await Person.relatedQuery('movies')
  .for(
    Person.query()
      .where('firstName', 'Arnold')
      .limit(1)
  )
  .relate([100, 200, 300, 400]);
```

The `relate` method returns the amount of affected rows.

```js
const numRelatedRows = await Person.relatedQuery('movies')
  .for(123)
  .relate(50);

console.log('movie 50 is now related to person 123 through `movies` relation');
```

Relate multiple:

```js
const numRelatedRows = await Person.relatedQuery('movies')
  .for(123)
  .relate([50, 60, 70]);

console.log(`${numRelatedRows} rows were related`);
```

Composite key can either be provided as an array of identifiers or using an object like this:

```js
const numRelatedRows = await Person.relatedQuery('movies')
  .for(123)
  .relate({ foo: 50, bar: 20, baz: 10 });

console.log(`${numRelatedRows} rows were related`);
```

Fields marked as [extras](/api/types/#type-relationthrough) for many-to-many relations in [relationMappings](/api/model/static-properties.html#static-relationmappings) are automatically written to the join table. The `someExtra` field in the following example is written to the join table if the `extra` array of the relation mapping contains the string `'someExtra'`.

```js
const numRelatedRows = await Movie.relatedQuery('actors')
  .for(movieId)
  .relate({
    id: 50,
    someExtra: "I'll be written to the join table"
  });

console.log(`${numRelatedRows} rows were related`);
```

## unrelate()

```js
queryBuilder = queryBuilder.unrelate();
```

Remove (detach) a connection between two items.

Doesn't delete the items. Only removes the connection. For ManyToMany relations this
deletes the join row from the join table. For other relation types this sets the
join columns to null.

Note that, unlike for `relate`, you shouldn't pass arguments for the `unrelate` method.
Use `unrelate` like `delete` and filter the rows using the returned query builder.

The return value of the query is the number of affected items.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const actor = await Person.query().findById(100);
```

```sql
select "persons".* from "persons" where "persons"."id" = 100
```

```js
await actor
  .$relatedQuery('movies')
  .unrelate()
  .where('name', 'like', 'Terminator%');
```

```sql
delete from "persons_movies"
where "persons_movies"."movieId" in (
  select "movies"."id"
  from "movies"
  inner join "persons_movies" on "movies"."id" = "persons_movies"."movieId"
  where "persons_movies"."personId" in (100)
  and "name" like 'Terminator%'
)
and "persons_movies"."personId" in (100)
```

The same using the static [relatedQuery](/api/model/static-methods.html#static-relatedquery) method:

```js
await Person.relatedQuery('movies')
  .for(100)
  .unrelate()
  .where('name', 'like', 'Terminator%');
```

```sql
delete from "persons_movies"
where "persons_movies"."movieId" in (
  select "movies"."id"
  from "movies"
  inner join "persons_movies" on "movies"."id" = "persons_movies"."movieId"
  where "persons_movies"."personId" in (100)
  and "name" like 'Terminator%'
)
and "persons_movies"."personId" in (100)
```

The next query removes all Terminator movies from Arnold Schwarzenegger:

```js
// Note that we don't await this query. This query is not executed.
// It's a placeholder that will be used to build a subquery when
// the `relatedQuery` gets executed.
const arnold = Person.query().findOne({
  firstName: 'Arnold',
  lastName: 'Schwarzenegger'
});

await Person.relatedQuery('movies')
  .for(arnold)
  .unrelate()
  .where('name', 'like', 'Terminator%');
```

```sql
delete from "persons_movies"
where "persons_movies"."movieId" in (
  select "movies"."id"
  from "movies"
  inner join "persons_movies" on "movies"."id" = "persons_movies"."movieId"
  where "persons_movies"."personId" in (
    select "persons"."id"
    from "persons"
    where "firstName" = 'Arnold'
    and "lastName" = 'Schwarzenegger'
  )
  and "name" like 'Terminator%'
)
and "persons_movies"."personId" in (
  select "persons"."id"
  from "persons"
  where "firstName" = 'Arnold'
  and "lastName" = 'Schwarzenegger'
)
```

`unrelate` returns the number of affected rows.

```js
const person = await Person.query().findById(123);

const numUnrelatedRows = await person
  .$relatedQuery('movies')
  .unrelate()
  .where('id', 50);

console.log(
  'movie 50 is no longer related to person 123 through `movies` relation'
);
```

## increment()

```js
queryBuilder = queryBuilder.increment(propertyName, amount);
```

Adds `amount` to a column. This is a [patch](/api/query-builder/mutate-methods.html#patch) query that sets the column to `column + amount`, so the result is the number of affected rows. Both arguments are required. Unlike knex's `increment()`, it doesn't take an object of columns.

```js
await Person.query().increment('age', 1).where('id', 1);
// update "persons" set "age" = "age" + 1 where "id" = 1
```

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## decrement()

```js
queryBuilder = queryBuilder.decrement(propertyName, amount);
```

Subtracts `amount` from a column. Like [increment](/api/query-builder/mutate-methods.html#increment), this is a patch query.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## truncate()

See [knex documentation](https://knexjs.org/guide/query-builder.html#truncate)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## onConflict()

See [knex documentation](https://knexjs.org/guide/query-builder.html#onconflict)

Use `insert(...).onConflict(columns).merge()` to upsert. It works on postgres, MySQL and SQLite. On MySQL it compiles to `on duplicate key update`, and the columns don't appear in the SQL. See [Upserts](/fork/knex.md#upserts).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## ignore()

See [knex documentation](https://knexjs.org/guide/query-builder.html#ignore)

`insert()` and `insertAndFetch()` still return all the input models when rows are ignored. Rows returned by the database are merged into the models by the columns passed to `onConflict()` (or the identifiers if no columns are passed), so ignored models never receive another row's values. Ignored models keep their input values, and an ignored model without an explicit identifier gets no `id` and isn't fetched by `insertAndFetch()`. On MySQL there is no `returning`, so objection can't tell which rows of a multi-row insert were ignored.

```js
const people = await Person.query()
  .insert([{ email: 'existing@example.com' }, { email: 'new@example.com' }])
  .onConflict('email')
  .ignore();

console.log(people[0].id); // undefined, the row was ignored
console.log(people[1].id); // the id of the inserted row (postgres and SQLite)
```

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## merge()

See [knex documentation](https://knexjs.org/guide/query-builder.html#merge)

The keys of the merge object can be [field expressions](/api/types/#type-fieldexpression). Use [fn.excluded()](/fork/expressions.md#fn-excluded) for the value the upsert tried to insert. See [Upserts](/fork/knex.md#upserts).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |
