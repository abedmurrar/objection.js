# Joins and model classes

## Model classes in place of table names

Model classes can be used wherever a table name goes: `join()` and every join variant (`innerJoin`, `leftJoin`, `leftOuterJoin`, `rightJoin`, `rightOuterJoin`, `fullOuterJoin`, `crossJoin`), `from()`, `table()`, `into()`, and subqueries. An object maps an alias to a model class. With these, queries don't need `Model.tableName`.

```js
const people = await Person.query()
  // A model class instead of 'animals'.
  .innerJoin(Animal, Animal.ref('ownerId'), Person.ref('id'))
  .leftJoin(Movie, (join) => {
    join
      .on(Movie.ref('directorId'), Person.ref('id'))
      // andOnVal() compares with a value instead of a column.
      .andOnVal(Movie.ref('year'), '>', 2000);
  })
  // { alias: ModelClass } joins the persons table again, as "parent".
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

```js
// Each person with the name of their parent. The root model is "child", so
// Person.ref('parentId') is "child"."parentId".
await Person.query()
  .alias('child')
  .select('child.firstName', 'parent.firstName as parentName')
  .leftJoin({ parent: Person }, 'parent.id', Person.ref('parentId'));
```

```sql
select "child"."firstName", "parent"."firstName" as "parentName"
from "persons" as "child"
left join "persons" as "parent" on "parent"."id" = "child"."parentId"
```

A left join with `whereNull()` finds the rows that have no match, here the persons without pets:

```js
await Person.query()
  .select(Person.ref('*'))
  .leftJoin(Pet, Pet.ref('ownerId'), Person.ref('id'))
  .whereNull(Pet.ref('id'));
```

```sql
select "persons".* from "persons"
left join "pets" on "pets"."ownerId" = "persons"."id"
where "pets"."id" is null
```

A report with a join and aggregates. The condition on the status is in the join, not in `where()`, so customers without paid orders are still listed, with a count of 0 and a revenue of `NULL`:

```js
await Customer.query()
  .select(
    Customer.ref('id'),
    Customer.ref('name'),
    fn.count(Order.ref('id')).as('orderCount'),
    fn.sum(Order.ref('total')).as('revenue'),
  )
  .leftJoin(Order, (join) =>
    join
      .on(Order.ref('customerId'), Customer.ref('id'))
      .andOn(Order.ref('status').eq('paid')),
  )
  // Pass the columns as an array. knex only uses the first argument of
  // groupBy() when it is a reference or raw SQL.
  .groupBy([Customer.ref('id'), Customer.ref('name')])
  .orderBy('revenue', 'desc');
```

```sql
select "customers"."id", "customers"."name",
  COUNT("orders"."id") as "orderCount", SUM("orders"."total") as "revenue"
from "customers"
left join "orders" on "orders"."customerId" = "customers"."id" and ("orders"."status" = 'paid')
group by "customers"."id", "customers"."name"
order by "revenue" desc
```

On SQLite, a customer without paid orders comes back as `{ id: 2, name: 'B', orderCount: 0, revenue: null }`.

Subqueries can be joined too. `as()` names the subquery, and its columns are referred to with that name:

```js
await Customer.query()
  .select(Customer.ref('name'), 'totals.revenue')
  .innerJoin(
    Order.query()
      .select('customerId')
      .sum({ revenue: 'total' })
      .groupBy('customerId')
      .as('totals'),
    'totals.customerId',
    Customer.ref('id'),
  );
```

```sql
select "customers"."name", "totals"."revenue"
from "customers"
inner join (select "customerId", sum("total") as "revenue" from "orders" group by "customerId") as "totals"
  on "totals"."customerId" = "customers"."id"
```

## `Model.ref()` in join callbacks

Before, `Model.ref()` inside a join callback put the source code of the model class into the SQL as the table name. That's fixed: model classes are now converted to table names in every builder.

In TypeScript, join callbacks get objection's `JoinBuilder` instead of knex's `JoinClause`. That means `ref()` and `Model.ref()` work for every column, and so do the [expression methods](./expressions.md):

```js
// Each person, joined with their pet that has the highest version.
await Person.query().join(Pet, (join) =>
  join
    .on(Pet.ref('ownerId'), Person.ref('id'))
    // An expression as a join condition: the version equals the result of a
    // subquery. The subquery uses its own alias, so it doesn't clash with "pets".
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

```sql
select "persons".* from "persons"
inner join "pets" on "pets"."ownerId" = "persons"."id"
  and ("pets"."version" = (select max("version") from "pets" as "p2" where "p2"."ownerId" = "persons"."id"))
```

## `onJsonPathEquals()` in join callbacks

Join callbacks now have `onJsonPathEquals()` and `orOnJsonPathEquals()`, alongside the existing `andOnJsonPathEquals()`. They pass `(columnFirst, jsonPathFirst, columnSecond, jsonPathSecond)` straight to the knex method of the same name.

```js
await Person.query().join(Pet, (join) =>
  join.onJsonPathEquals('persons.settings', '$.petId', 'pets.meta', '$.id'),
);
```

```sql
-- postgres
select "persons".* from "persons"
inner join "pets" on jsonb_path_query_first("persons"."settings", '$.petId') = jsonb_path_query_first("pets"."meta", '$.id')

-- MySQL
select `persons`.* from `persons`
inner join `pets` on json_extract(`persons`.`settings`, '$.petId') = json_extract(`pets`.`meta`, '$.id')
```

## Subqueries in join callbacks

On MySQL, subqueries in join callbacks used to throw `parentQuery.isUpdate is not a function`. They work now:

```js
await Person.query().join(Pet, (join) =>
  join.on(Pet.ref('version'), Pet.query().alias('p2').max('version')),
);
// select `persons`.* from `persons`
// inner join `pets` on `pets`.`version` = (select max(`version`) from `pets` as `p2`)
```

## Raw columns in `whereIn()`

`whereIn()`, `whereNotIn()` and the `onIn()`/`onNotIn()` family of join callbacks with a raw column that has bindings used to produce queries with the wrong bindings. knex compiles the values before the column, so the column got the values' bindings. These queries are now built as raw SQL with the bindings in order:

```js
// Case-insensitive match against a list of names.
await Person.query().whereIn(fn.lower(ref('name')), names);
// With names = ['a', 'b']:
// select "persons".* from "persons" where LOWER("name") in ('a', 'b')
```

Other `whereIn()` queries are unchanged.
