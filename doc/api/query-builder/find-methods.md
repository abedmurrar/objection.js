# Find Methods

## findById()

```js
queryBuilder = queryBuilder.findById(id);
```

Finds a single item by id.

##### Arguments

| Argument | Type                       | Description     |
| -------- | -------------------------- | --------------- |
| id       | any&nbsp;&#124;&nbsp;any[] | The identifier. |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const person = await Person.query().findById(1);
```

Composite key:

```js
const person = await Person.query().findById([1, '10']);
```

`findById` can be used together with `patch`, `delete` and any other query method. All it does is adds the needed `where` clauses to the query.

```js
await Person.query()
  .findById(someId)
  .patch({ firstName: 'Jennifer' });
```

The id condition isn't wrapped in parentheses, so `findById(1).orWhere('b', 2)` finds the rows where `id = 1 or b = 2`. Methods that add the id condition themselves, like `deleteById()`, wrap the other conditions. See [Breaking changes](/fork/breaking-changes.md#orwhere-no-longer-escapes-the-conditions-objection-adds).

## findByIds()

```js
queryBuilder = queryBuilder.findByIds(ids);
```

Finds a list of items. The order of the returned items is not guaranteed to be the same as the order of the inputs.

##### Arguments

| Argument | Type  | Description            |
| -------- | ----- | ---------------------- |
| ids      | any[] | A List of identifiers. |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const [person1, person2] = await Person.query().findByIds([1, 2]);
```

Composite key:

```js
const [person1, person2] = await Person.query().findByIds([
  [1, '10'],
  [2, '10']
]);
```

## findOne()

```js
queryBuilder = queryBuilder.findOne(...whereArgs);
```

Shorthand for `where(...whereArgs).first()`.

NOTE: [`.first()`](/api/query-builder/other-methods.md#first) doesn't add `limit 1` to the query by default. You can override the [Model.useLimitInFirst](/api/model/static-properties.html#static-uselimitinfirst) property to change this behaviour.

##### Arguments

| Argument  | Type   | Description                                                                      |
| --------- | ------ | -------------------------------------------------------------------------------- |
| whereArgs | ...any | Anything the [where](/api/query-builder/find-methods.html#where) method accepts. |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const person = await Person.query().findOne({
  firstName: 'Jennifer',
  lastName: 'Lawrence'
});
```

```js
const person = await Person.query().findOne('age', '>', 20);
```

```js
const person = await Person.query().findOne(raw('random() < 0.5'));
```

## alias()

```js
queryBuilder = queryBuilder.alias(alias);
```

Give an alias for the table to be used in the query.

##### Arguments

| Argument | Type   | Description                |
| -------- | ------ | -------------------------- |
| alias    | string | Table alias for the query. |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
await Person.query()
  .alias('p')
  .where('p.id', 1)
  .join('persons as parent', 'parent.id', 'p.parentId');
```

## aliasFor()

```js
queryBuilder = queryBuilder.aliasFor(tableNameOrModelClass, alias);
```

Give an alias for any table in the query.

##### Arguments

| Argument              | Type                               | Description                        |
| --------------------- | ---------------------------------- | ---------------------------------- |
| tableNameOrModelClass | string&nbsp;&#124;&nbsp;ModelClass | The table or model class to alias. |
| alias                 | string                             | The alias.                         |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
// This query uses joinRelated to join a many-to-many relation which also joins
// the join table `persons_movies`. We specify that the `persons_movies` table
// should be called `pm` instead of the default `movies_join`.
await Person.query()
  .aliasFor('persons_movies', 'pm')
  .joinRelated('movies')
  .where('pm.someProp', 100);
```

Model class can be used instead of table name

```js
await Person.query()
  .aliasFor(Movie, 'm')
  .joinRelated('movies')
  .where('m.name', 'The Room');
```

## select()

See [knex documentation](https://knexjs.org/guide/query-builder.html#select)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## forUpdate()

See [knex documentation](https://knexjs.org/guide/query-builder.html#forupdate)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## forShare()

See [knex documentation](https://knexjs.org/guide/query-builder.html#forshare)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## forNoKeyUpdate()

See [knex documentation](https://knexjs.org/guide/query-builder.html#fornokeyupdate)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## forKeyShare()

See [knex documentation](https://knexjs.org/guide/query-builder.html#forkeyshare)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## skipLocked()

See [knex documentation](https://knexjs.org/guide/query-builder.html#skiplocked)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## noWait()

See [knex documentation](https://knexjs.org/guide/query-builder.html#nowait)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## as()

See [knex documentation](https://knexjs.org/guide/query-builder.html#as)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## columns()

See [knex documentation](https://knexjs.org/guide/query-builder.html#column)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## column()

See [knex documentation](https://knexjs.org/guide/query-builder.html#column)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## from()

See [knex documentation](https://knexjs.org/guide/query-builder.html#from)

The table can also be a model class, or an object like `{ p: Person }` that gives the model's table an alias. See [Joins and model classes](/fork/joins.md#model-classes-in-place-of-table-names).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## fromRaw()

See [knex documentation](https://knexjs.org/guide/query-builder.html#fromraw)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## updateFrom()

See [knex documentation](https://knexjs.org/guide/query-builder.html#updatefrom)

Only works on postgres. See [knex methods](/fork/knex.md#new-methods) for an example.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## into()

See [knex documentation](https://knexjs.org/guide/query-builder.html)

Takes a table name or a model class, like [from](/api/query-builder/find-methods.html#from).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## with()

See [knex documentation](https://knexjs.org/guide/query-builder.html#with)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## withMaterialized()

See [knex documentation](https://knexjs.org/guide/query-builder.html#withmaterialized)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## withNotMaterialized()

See [knex documentation](https://knexjs.org/guide/query-builder.html#withnotmaterialized)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## withRecursive()

See [knex documentation](https://knexjs.org/guide/query-builder.html#withrecursive)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## withWrapped()

The same as [with](/api/query-builder/find-methods.html#with).

## withSchema()

See [knex documentation](https://knexjs.org/guide/query-builder.html#withschema)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## table()

See [knex documentation](https://knexjs.org/guide/query-builder.html)

Takes a table name or a model class, like [from](/api/query-builder/find-methods.html#from).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## distinct()

See [knex documentation](https://knexjs.org/guide/query-builder.html#distinct)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## distinctOn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#distincton)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## where()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## none()

```js
queryBuilder = queryBuilder.none();
```

Makes the query match no rows by adding `where (1 = 0)`. Useful in modifiers when there is nothing to match:

```js
function forUsers(query, userIds) {
  if (userIds.length === 0) {
    return query.none();
  }

  query.whereIn('userId', userIds);
}
```

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## andWhere()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhere()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

The conditions objection adds itself, like the owner condition of `$relatedQuery()` or the id condition of `deleteById()`, are kept apart from yours with parentheses, so an `orWhere()` can't match rows outside them. See [Breaking changes](/fork/breaking-changes.md#orwhere-no-longer-escapes-the-conditions-objection-adds).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereNot()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenot)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereNot()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenot)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## andWhereNot()

The same as [whereNot](/api/query-builder/find-methods.html#wherenot).

## whereRaw()

See [knex documentation](https://knexjs.org/guide/query-builder.html#whereraw)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereWrapped()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## havingWrapped()

See [knex documentation](https://knexjs.org/guide/query-builder.html#having)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereRaw()

See [knex documentation](https://knexjs.org/guide/query-builder.html#whereraw)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## andWhereRaw()

The same as [whereRaw](/api/query-builder/find-methods.html#whereraw).

## whereExists()

See [knex documentation](https://knexjs.org/guide/query-builder.html#whereexists)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereExists()

See [knex documentation](https://knexjs.org/guide/query-builder.html#whereexists)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereNotExists()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenotexists)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereNotExists()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenotexists)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereIn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherein)

The column can be an expression with bindings, like `whereIn(fn.lower(ref('name')), names)`. The same goes for `orWhereIn()`, `whereNotIn()` and `orWhereNotIn()`. See [Joins and model classes](/fork/joins.md#raw-columns-in-wherein).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereIn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherein)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereNotIn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenotin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereNotIn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenotin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereNull()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenull)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereNull()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenull)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereNotNull()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenotnull)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereNotNull()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenotnull)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereBetween()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherebetween)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereNotBetween()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenotbetween)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereBetween()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherebetween)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereNotBetween()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherenotbetween)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## andWhereBetween()

The same as [whereBetween](/api/query-builder/find-methods.html#wherebetween).

## andWhereNotBetween()

The same as [whereNotBetween](/api/query-builder/find-methods.html#wherenotbetween).

## whereColumn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## andWhereColumn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereColumn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereNotColumn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## andWhereNotColumn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereNotColumn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#where)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereLike()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherelike)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## andWhereLike()

The same as [whereLike](/api/query-builder/find-methods.html#wherelike).

## orWhereLike()

See [whereLike](/api/query-builder/find-methods.html#wherelike)

## whereILike()

See [knex documentation](https://knexjs.org/guide/query-builder.html#whereilike)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## andWhereILike()

The same as [whereILike](/api/query-builder/find-methods.html#whereilike).

## orWhereILike()

See [whereILike](/api/query-builder/find-methods.html#whereilike)

## groupBy()

See [knex documentation](https://knexjs.org/guide/query-builder.html#groupby)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## groupByRaw()

See [knex documentation](https://knexjs.org/guide/query-builder.html#groupbyraw)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orderBy()

See [knex documentation](https://knexjs.org/guide/query-builder.html#orderby)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orderByRaw()

See [knex documentation](https://knexjs.org/guide/query-builder.html#orderbyraw)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## union()

See [knex documentation](https://knexjs.org/guide/query-builder.html#union)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## unionAll()

See [knex documentation](https://knexjs.org/guide/query-builder.html#unionall)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## intersect()

See [knex documentation](https://knexjs.org/guide/query-builder.html#intersect)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## except()

See [knex documentation](https://knexjs.org/guide/query-builder.html#except)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## having()

See [knex documentation](https://knexjs.org/guide/query-builder.html#having)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## havingRaw()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingraw)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHaving()

See [knex documentation](https://knexjs.org/guide/query-builder.html#having)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHavingRaw()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingraw)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## havingIn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHavingIn()

See [havingIn](/api/query-builder/find-methods.html#havingin). Adds the condition with `or`. In objection 3.1.5 it was added with `and`. See [knex methods](/fork/knex.md#new-methods).

## havingNotIn()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingnotin)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHavingNotIn()

See [havingNotIn](/api/query-builder/find-methods.html#havingnotin).

## havingNull()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingnull)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHavingNull()

See [havingNull](/api/query-builder/find-methods.html#havingnull).

## havingNotNull()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingnotnull)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHavingNotNull()

See [havingNotNull](/api/query-builder/find-methods.html#havingnotnull).

## havingExists()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingexists)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHavingExists()

See [havingExists](/api/query-builder/find-methods.html#havingexists).

## havingNotExists()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingnotexists)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHavingNotExists()

See [havingNotExists](/api/query-builder/find-methods.html#havingnotexists).

## havingBetween()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingbetween)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHavingBetween()

See [havingBetween](/api/query-builder/find-methods.html#havingbetween). Adds the condition with `or`. In objection 3.1.5 it was added with `and`. See [knex methods](/fork/knex.md#new-methods).

## havingNotBetween()

See [knex documentation](https://knexjs.org/guide/query-builder.html#havingnotbetween)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orHavingNotBetween()

See [havingNotBetween](/api/query-builder/find-methods.html#havingnotbetween). Adds the condition with `or`. In objection 3.1.5 it was added with `and`. See [knex methods](/fork/knex.md#new-methods).

## andHaving()

The same as [having](/api/query-builder/find-methods.html#having). There are also `andHavingIn()`, `andHavingNotIn()`, `andHavingNull()`, `andHavingNotNull()`, `andHavingExists()`, `andHavingNotExists()`, `andHavingBetween()` and `andHavingNotBetween()`, which are the same as the methods without `and`. See [knex methods](/fork/knex.md#new-methods).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## clearGroup()

Removes the `groupBy` and `groupByRaw` calls of the query.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## clearHaving()

Removes the `having` calls of the query, including `havingIn`, `orHaving` and the others.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## comment()

```js
queryBuilder = queryBuilder.comment('monthly report');
```

Adds an SQL comment before the query: `/* monthly report */ select ...`. See [knex documentation](https://knexjs.org/guide/query-builder.html#comment) and [knex methods](/fork/knex.md#new-methods).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## hintComment()

```js
queryBuilder = queryBuilder.hintComment(['NO_ICP(persons)']);
```

Adds optimizer hints to the query: `select /*+ NO_ICP(persons) */ ...`. MySQL and Oracle use the hints. Other databases read them as plain comments. Takes a string or an array of strings. See [knex documentation](https://knexjs.org/guide/query-builder.html#hintcomment) and [knex methods](/fork/knex.md#new-methods).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## offset()

See [knex documentation](https://knexjs.org/guide/query-builder.html#offset)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## limit()

See [knex documentation](https://knexjs.org/guide/query-builder.html#limit)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## count()

See [knex documentation](https://knexjs.org/guide/query-builder.html#count)

Also see the [resultSize](/api/query-builder/other-methods.md#resultsize) method for a cleaner way to just get the number of rows a query would create.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## countDistinct()

See [knex documentation](https://knexjs.org/guide/query-builder.html#count)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## min()

See [knex documentation](https://knexjs.org/guide/query-builder.html#min)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## max()

See [knex documentation](https://knexjs.org/guide/query-builder.html#max)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## sum()

See [knex documentation](https://knexjs.org/guide/query-builder.html#sum)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## sumDistinct()

See [knex documentation](https://knexjs.org/guide/query-builder.html#sum)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## avg()

See [knex documentation](https://knexjs.org/guide/query-builder.html#avg)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## avgDistinct()

See [knex documentation](https://knexjs.org/guide/query-builder.html#avg)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## returning()

See [knex documentation](https://knexjs.org/guide/query-builder.html#returning)

MySQL has no `returning()`. knex ignores it there with a warning.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## columnInfo()

```js
const info = await Person.query().columnInfo();
```

See [knex documentation](https://knexjs.org/guide/query-builder.html#columninfo)

Returns the column info of the model's table, not this query builder. Calls made on the query builder before `columnInfo()` don't affect it, except `withSchema()` and `debug()`.

##### Return value

| Type               | Description                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| knex query builder | A separate knex query. Await it to get an object keyed by the column names. |

## whereComposite()

```js
queryBuilder = queryBuilder.whereComposite(columns, operator, values);
```

[where](/api/query-builder/find-methods.html#where) for (possibly) composite keys.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
builder.whereComposite(['id', 'name'], '=', [1, 'Jennifer']);
```

This method also works with a single column - value pair:

```js
builder.whereComposite('id', 1);
```

## whereInComposite()

```js
queryBuilder = queryBuilder.whereInComposite(columns, values);
```

[whereIn](/api/query-builder/find-methods.html#wherein) for (possibly) composite keys.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
builder.whereInComposite(
  ['a', 'b'],
  [
    [1, 2],
    [3, 4],
    [1, 4]
  ]
);
```

```js
builder.whereInComposite('a', [[1], [3], [1]]);
```

```js
builder.whereInComposite('a', [1, 3, 1]);
```

```js
builder.whereInComposite(['a', 'b'], SomeModel.query().select('a', 'b'));
```

## whereNotInComposite()

```js
queryBuilder = queryBuilder.whereNotInComposite(columns, values);
```

[whereNotIn](/api/query-builder/find-methods.html#wherenotin) for (possibly) composite keys. Takes the same arguments as [whereInComposite](/api/query-builder/find-methods.html#whereincomposite).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## jsonExtract()

See [knex documentation](https://knexjs.org/guide/query-builder.html#jsonextract)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## jsonSet()

See [knex documentation](https://knexjs.org/guide/query-builder.html#jsonset)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## jsonInsert()

See [knex documentation](https://knexjs.org/guide/query-builder.html#jsoninsert)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## jsonRemove()

See [knex documentation](https://knexjs.org/guide/query-builder.html#jsonremove)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## whereJsonObject()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherejsonobject)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereJsonObject()

See [whereJsonObject](/api/query-builder/find-methods.html#wherejsonobject)

## andWhereJsonObject()

The same as [whereJsonObject](/api/query-builder/find-methods.html#wherejsonobject).

## whereNotJsonObject()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherejsonobject)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereNotJsonObject()

See [whereNotJsonObject](/api/query-builder/find-methods.html#wherenotjsonobject)

## andWhereNotJsonObject()

The same as [whereNotJsonObject](/api/query-builder/find-methods.html#wherenotjsonobject).

## whereJsonPath()

See [knex documentation](https://knexjs.org/guide/query-builder.html#wherejsonpath)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereJsonPath()

See [whereJsonPath](/api/query-builder/find-methods.html#wherejsonpath)

## andWhereJsonPath()

The same as [whereJsonPath](/api/query-builder/find-methods.html#wherejsonpath).

## whereJsonSupersetOf()

```js
queryBuilder = queryBuilder.whereJsonSupersetOf(
  fieldExpression,
  jsonObjectOrFieldExpression
);
```

Where left hand json field reference is a superset of the right hand json value or reference.

Works on postgres (`@>`) and MySQL (`JSON_CONTAINS()`), and throws on other databases. Like on postgres, an object is only contained in an object on MySQL too: `whereJsonSupersetOf('arrayColumn', { a: 1 })` doesn't find `[{ "a": 1 }]`. Below the top level MySQL's rules apply, which also find objects inside arrays. See [MySQL](/fork/mysql.md#the-wherejson-methods).

##### Arguments

| Argument                    | Type                                                                                               | Description                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| fieldExpression             | [FieldExpression](/api/types/#type-fieldexpression)                                                | Reference to column / json field, which is tested for being a superset |
| jsonObjectOrFieldExpression | Object&nbsp;&#124;&nbsp;Array&nbsp;&#124;&nbsp;[FieldExpression](/api/types/#type-fieldexpression) | To which to compare                                                    |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const people = await Person.query().whereJsonSupersetOf(
  'additionalData:myDogs',
  'additionalData:dogsAtHome'
);

// These people have all or some of their dogs at home. Person might have some
// additional dogs in their custody since myDogs is superset of dogsAtHome.

const people = await Person.query().whereJsonSupersetOf(
  'additionalData:myDogs[0]',
  { name: 'peter' }
);

// These people's first dog name is "peter", but the dog might have
// additional attributes as well.
```

Object and array are always their own supersets.

For arrays this means that left side matches if it has all the elements listed in the right hand side. e.g.

```
[1,2,3] isSuperSetOf [2] => true
[1,2,3] isSuperSetOf [2,1,3] => true
[1,2,3] isSuperSetOf [2,null] => false
[1,2,3] isSuperSetOf [] => true
```

`whereJsonNotSupersetOf()` and `whereJsonNotSubsetOf()` don't match rows where a field in the comparison is missing or `NULL`. For example, for the table

```
 id |    jsonObject
----+--------------------------
  1 | {}
  2 | NULL
  3 | {"a": 1}
  4 | {"a": 1, "b": 2}
  5 | {"a": ["3"], "b": ["3"]}
```

this query:

```js
builder.whereJsonNotSupersetOf('jsonObject:a', 'jsonObject:b');
```

returns only the row `4`, which has the keys `a` and `b`, and `a` doesn't contain `b`. It doesn't return the rows that don't have `jsonObject.a` or `jsonObject.b`.

## orWhereJsonSupersetOf()

See [whereJsonSupersetOf](/api/query-builder/find-methods.html#wherejsonsupersetof)

## andWhereJsonSupersetOf()

The same as [whereJsonSupersetOf](/api/query-builder/find-methods.html#wherejsonsupersetof).

## whereJsonNotSupersetOf()

See [whereJsonSupersetOf](/api/query-builder/find-methods.html#wherejsonsupersetof)

## andWhereJsonNotSupersetOf()

The same as [whereJsonNotSupersetOf](/api/query-builder/find-methods.html#wherejsonnotsupersetof).

## orWhereJsonNotSupersetOf()

See [whereJsonSupersetOf](/api/query-builder/find-methods.html#wherejsonsupersetof)

## whereJsonSubsetOf()

```js
queryBuilder = queryBuilder.whereJsonSubsetOf(
  fieldExpression,
  jsonObjectOrFieldExpression
);
```

Where left hand json field reference is a subset of the right hand json value or reference.

Object and array are always their own subsets. Works on postgres and MySQL, and throws on other databases.

See [whereJsonSupersetOf](/api/query-builder/find-methods.html#wherejsonsupersetof)

##### Arguments

| Argument                    | Type                                                                                               | Description                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| fieldExpression             | [FieldExpression](/api/types/#type-fieldexpression)                                                | Reference to column / json field, which is tested for being a subset |
| jsonObjectOrFieldExpression | Object&nbsp;&#124;&nbsp;Array&nbsp;&#124;&nbsp;[FieldExpression](/api/types/#type-fieldexpression) | To which to compare                                                  |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereJsonSubsetOf()

See [whereJsonSubsetOf](/api/query-builder/find-methods.html#wherejsonsubsetof)

## andWhereJsonSubsetOf()

The same as [whereJsonSubsetOf](/api/query-builder/find-methods.html#wherejsonsubsetof).

## whereJsonNotSubsetOf()

See [whereJsonSubsetOf](/api/query-builder/find-methods.html#wherejsonsubsetof)

## andWhereJsonNotSubsetOf()

The same as [whereJsonNotSubsetOf](/api/query-builder/find-methods.html#wherejsonnotsubsetof).

## orWhereJsonNotSubsetOf()

See [whereJsonSubsetOf](/api/query-builder/find-methods.html#wherejsonsubsetof)

## whereJsonIsArray()

```js
queryBuilder = queryBuilder.whereJsonIsArray(fieldExpression);
```

Where json field reference is an array. Works on postgres and MySQL, and throws on other databases.

##### Arguments

| Argument        | Type                                                | Description |
| --------------- | --------------------------------------------------- | ----------- |
| fieldExpression | [FieldExpression](/api/types/#type-fieldexpression) |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereJsonIsArray()

See [whereJsonIsArray](/api/query-builder/find-methods.html#wherejsonisarray)

## whereJsonNotArray()

Where json field reference isn't an array. A `NULL` or missing field isn't an array, so those rows are found too. See [whereJsonIsArray](/api/query-builder/find-methods.html#wherejsonisarray)

## orWhereJsonNotArray()

See [whereJsonIsArray](/api/query-builder/find-methods.html#wherejsonisarray)

## whereJsonIsObject()

```js
queryBuilder = queryBuilder.whereJsonIsObject(fieldExpression);
```

Where json field reference is an object. Works on postgres and MySQL, and throws on other databases.

##### Arguments

| Argument        | Type                                                | Description |
| --------------- | --------------------------------------------------- | ----------- |
| fieldExpression | [FieldExpression](/api/types/#type-fieldexpression) |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereJsonIsObject()

See [whereJsonIsObject](/api/query-builder/find-methods.html#wherejsonisobject)

## whereJsonNotObject()

Where json field reference isn't an object. A `NULL` or missing field isn't an object, so those rows are found too. See [whereJsonIsObject](/api/query-builder/find-methods.html#wherejsonisobject)

## orWhereJsonNotObject()

See [whereJsonIsObject](/api/query-builder/find-methods.html#wherejsonisobject)

## whereJsonHasAny()

```js
queryBuilder = queryBuilder.whereJsonHasAny(fieldExpression, keys);
```

Where any of given strings is found from json object keys, the string items of an array, or a string. Works on postgres and MySQL, and throws on other databases.

::: tip
Only the string items of arrays are matched. To check if an array contains an item of another type, use [whereJsonSupersetOf](/api/query-builder/find-methods.html#wherejsonsupersetof) with an array: `whereJsonSupersetOf('numbers', [1])`.
:::

##### Arguments

| Argument        | Type                                                | Description                                  |
| --------------- | --------------------------------------------------- | -------------------------------------------- |
| fieldExpression | [FieldExpression](/api/types/#type-fieldexpression) |
| keys            | string&nbsp;&#124;&nbsp;string[]                    | Strings that are looked from object or array |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereJsonHasAny()

See [whereJsonHasAny](/api/query-builder/find-methods.html#wherejsonhasany)

## whereJsonHasAll()

```js
queryBuilder = queryBuilder.whereJsonHasAll(fieldExpression, keys);
```

Where all of given strings are found from json object keys, the string items of an array, or a string. Works on postgres and MySQL, and throws on other databases.

::: tip
Only the string items of arrays are matched. To check if an array contains items of another type, use [whereJsonSupersetOf](/api/query-builder/find-methods.html#wherejsonsupersetof) with an array: `whereJsonSupersetOf('numbers', [1, 2])`.
:::

##### Arguments

| Argument        | Type                                                | Description                                  |
| --------------- | --------------------------------------------------- | -------------------------------------------- |
| fieldExpression | [FieldExpression](/api/types/#type-fieldexpression) |
| keys            | string&nbsp;&#124;&nbsp;string[]                    | Strings that are looked from object or array |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## orWhereJsonHasAll()

See [whereJsonHasAll](/api/query-builder/find-methods.html#wherejsonhasall)

## whereJsonOverlaps()

```js
queryBuilder = queryBuilder.whereJsonOverlaps(
  fieldExpression,
  jsonObjectOrFieldExpression
);
```

MySQL only. Where the json field and the json value or reference overlap: two arrays share an item, two objects share a key and value, or an array contains a scalar. Uses `JSON_OVERLAPS()`, which can use multi-valued indexes. On postgres it throws `whereJsonOverlaps is only supported on mysql.`, and on MariaDB it needs 10.9 or newer. See [MySQL](/fork/mysql.md#wherejsonoverlaps-and-wherejsonnotoverlaps).

##### Arguments

| Argument                    | Type                                                                                               | Description          |
| --------------------------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| fieldExpression             | [FieldExpression](/api/types/#type-fieldexpression)                                                | Reference to a field |
| jsonObjectOrFieldExpression | Object&nbsp;&#124;&nbsp;Array&nbsp;&#124;&nbsp;[FieldExpression](/api/types/#type-fieldexpression) | To which to compare  |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

```js
const jobs = await Job.query().whereJsonOverlaps('attributes:countryCodes', ['FI', 'SE']);
```

## orWhereJsonOverlaps()

See [whereJsonOverlaps](/api/query-builder/find-methods.html#wherejsonoverlaps)

## andWhereJsonOverlaps()

The same as [whereJsonOverlaps](/api/query-builder/find-methods.html#wherejsonoverlaps).

## whereJsonNotOverlaps()

MySQL only. The negation of [whereJsonOverlaps](/api/query-builder/find-methods.html#wherejsonoverlaps). A NULL or missing field doesn't overlap anything, so rows without the field are found.

```js
// Jobs that aren't restricted to any of the countries.
const jobs = await Job.query().whereJsonNotOverlaps('attributes:countryCodes', ['FI', 'SE']);
```

## andWhereJsonNotOverlaps()

The same as [whereJsonNotOverlaps](/api/query-builder/find-methods.html#wherejsonnotoverlaps).

## orWhereJsonNotOverlaps()

See [whereJsonNotOverlaps](/api/query-builder/find-methods.html#wherejsonnotoverlaps)
