# Joins and model classes

## Model classes in place of table names

Model classes can be used wherever a table name goes: `join()` and every join variant (`innerJoin`, `leftJoin`, `leftOuterJoin`, `rightJoin`, `rightOuterJoin`, `fullOuterJoin`, `crossJoin`), `from()`, `table()`, `into()`, and subqueries. An object maps an alias to a model class. With these, queries don't need `Model.tableName`.

```js
const people = await Person.query()
  .innerJoin(Animal, Animal.ref('ownerId'), Person.ref('id'))
  .leftJoin(Movie, (join) => {
    join
      .on(Movie.ref('directorId'), Person.ref('id'))
      .andOnVal(Movie.ref('year'), '>', 2000);
  })
  .innerJoin({ parent: Person }, 'parent.id', Person.ref('parentId'));
```

```sql
select "persons".*
from "persons"
inner join "animals" on "animals"."ownerId" = "persons"."id"
left join "movies" on "movies"."directorId" = "persons"."id" and "movies"."year" > 2000
inner join "persons" as "parent" on "parent"."id" = "persons"."parentId"
```

```js
// An alias for the root model.
await Person.query().from({ p: Person }).where(Person.ref('id'), 1);
// select "p".* from "persons" as "p" where "p"."id" = 1
```

`Model.ref()` refers to the model's table. For the root model, it refers to the alias set with `alias()` or `from({ alias: Model })` instead. To refer to the columns of an aliased join, use `ref('parent.id')`.

## `Model.ref()` in join callbacks

Before, `Model.ref()` inside a join callback put the source code of the model class into the SQL as the table name. That's fixed: model classes are now converted to table names in every builder.

In TypeScript, join callbacks get objection's `JoinBuilder` instead of knex's `JoinClause`. That means `ref()` and `Model.ref()` work for every column, and so do the [expression methods](./expressions.md):

```js
await Person.query().join(Pet, (join) =>
  join
    .on(Pet.ref('ownerId'), Person.ref('id'))
    .andOn(
      Pet.ref('version').eq(
        Pet.query()
          .alias('p2')
          .max('version')
          .where('p2.ownerId', Person.ref('id')),
      ),
    ),
);
```

## `onJsonPathEquals()` in join callbacks

Join callbacks now have `onJsonPathEquals()` and `orOnJsonPathEquals()`, alongside the existing `andOnJsonPathEquals()`. They pass `(columnFirst, jsonPathFirst, columnSecond, jsonPathSecond)` straight to the knex method of the same name.

```js
await Person.query().join(Pet, (join) =>
  join.onJsonPathEquals('persons.settings', '$.petId', 'pets.meta', '$.id'),
);
```

## Subqueries in join callbacks

On MySQL, subqueries in join callbacks used to throw `parentQuery.isUpdate is not a function`. They work now:

```js
await Person.query().join(Pet, (join) =>
  join.on(Pet.ref('version'), Pet.query().alias('p2').max('version')),
);
```

## Raw columns in `whereIn()`

`whereIn()`, `whereNotIn()` and the `onIn()`/`onNotIn()` family of join callbacks with a raw column that has bindings used to produce queries with the wrong bindings. knex compiles the values before the column, so the column got the values' bindings. These queries are now built as raw SQL with the bindings in order:

```js
await Person.query().whereIn(fn.lower(ref('name')), names);
```

Other `whereIn()` queries are unchanged.
