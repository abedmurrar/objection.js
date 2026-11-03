# knex methods

objection defines every knex method it supports, so that it can turn the results into models and run hooks. A knex method objection doesn't define throws `TypeError: ... is not a function`. The fork adds the knex methods objection 3.1.5 didn't have, and a test checks objection's query builder against knex's, so new knex methods are noticed.

The fork requires knex 3.3 or newer. See [Breaking changes](./breaking-changes.md#knex-3-3-or-newer-is-required).

## New methods

| Method                                                                                                                                                                                  | What it does                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `andHaving()`, `andHavingIn()`, `andHavingNotIn()`, `andHavingNull()`, `andHavingNotNull()`, `andHavingExists()`, `andHavingNotExists()`, `andHavingBetween()`, `andHavingNotBetween()` | The same as `having()`, `havingIn()` and the others, written with `and`. `andHaving()` was typed but threw. |
| `comment(text)`                                                                                                                                                                         | Adds an SQL comment before the query: `/* text */ select ...`                                               |
| `hintComment(hints)`                                                                                                                                                                    | Adds optimizer hints: `select /*+ NO_ICP(persons) */ ...` (MySQL, Oracle)                                   |
| `using(tables)`                                                                                                                                                                         | postgres `delete ... using`                                                                                 |
| `finally(callback)`                                                                                                                                                                     | Executes the query, like `then()` and `catch()`                                                             |
| `or` in join callbacks                                                                                                                                                                  | `join.on(a, b).or.on(c, d)` is the same as `join.on(a, b).orOn(c, d)`                                       |

```js
// The comment shows up in the database's query logs, which helps to find
// where a slow query comes from.
await Person.query()
  .comment('monthly report')
  .groupBy('age')
  .having('age', '>', 18)
  .andHavingNotNull('age');
// /* monthly report */ select "persons".* from "persons" group by "age" having "age" > 18 and "age" is not null

// Delete the persons who own a snake (postgres only).
await Person.query()
  .delete()
  .using('pets')
  .where('pets.ownerId', ref('persons.id'))
  .where('pets.species', 'snake');
// delete from "persons" using "pets" where "pets"."ownerId" = "persons"."id" and "pets"."species" = 'snake'

// Pets that the person owns or looks after.
await Person.query().join('pets', (join) =>
  join.on('pets.ownerId', 'persons.id').or.on('pets.sitterId', 'persons.id'),
);
// select "persons".* from "persons" inner join "pets" on "pets"."ownerId" = "persons"."id" or "pets"."sitterId" = "persons"."id"

// MySQL: tell the optimizer not to use index condition pushdown.
await Person.query().hintComment('NO_ICP(persons)').where('age', '>', 18);
// select /*+ NO_ICP(persons) */ `persons`.* from `persons` where `age` > 18
```

On other databases than postgres, `using()` throws `'using' function is only available in PostgreSQL dialect with Delete statements.`

`finally()` runs the query, like `then()`, and calls the callback whether it succeeded or failed:

```js
const timer = startTimer();

const people = await Person.query()
  .where('age', '>', 18)
  .finally(() => timer.stop());
```

`updateFrom()`, `clearGroup()`, `clearHaving()` and `options()` worked but weren't typed. `clearGroup()` and `clearHaving()` now remove the operations from the query, like `clearSelect()` and `clearWhere()`, so `has()` sees them as cleared.

```js
// postgres: update the orders of gold customers, joining customers in the update.
await Order.query()
  .patch({ status: 'vip' })
  .updateFrom('customers')
  .where('customers.id', ref('orders.customerId'))
  .where('customers.tier', 'gold');
// update "orders" set "status" = 'vip' from "customers"
// where "customers"."id" = "orders"."customerId" and "customers"."tier" = 'gold'

// The same query without the grouping: counts the orders instead of listing
// the customers with more than one order.
const perCustomer = Order.query()
  .select('customerId')
  .count('* as n')
  .groupBy('customerId')
  .having('n', '>', 1);

await perCustomer.clone().clearSelect().clearGroup().clearHaving().count('* as total');
// select count(*) as "total" from "orders"
```

`orHavingIn()`, `orHavingBetween()` and `orHavingNotBetween()` used to add their conditions with `and`:

```js
await Order.query()
  .select('customerId')
  .count('* as orders')
  .groupBy('customerId')
  .having(fn.count().gte(3))
  .andHavingBetween(fn.sum(Order.ref('total')), [100, 500])
  .orHavingIn('customerId', [1, 2]);
```

```sql
select "customerId", count(*) as "orders" from "orders" group by "customerId"
having (COUNT(*) >= 3) and SUM("orders"."total") between 100 and 500 or "customerId" in (1, 2)
```

## Left out on purpose

| knex method                            | Use instead                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `upsert()`                             | `insert(...).onConflict(columns).merge()`. See below.                                                                   |
| `pluck(column)`                        | `select(column)` and `map()`. It was removed in objection 3.                                                            |
| `clearCounters()`                      | Nothing: `increment()` and `decrement()` are patches in objection.                                                      |
| `stream()`, `pipe()`                   | `toKnexQuery().stream()`. Streams return rows, not models.                                                              |
| `toSQL()`, `toQuery()`                 | `toKnexQuery().toSQL()`, or `toKnexQuery().toQuery()`                                                                   |
| `queryContext()`                       | `context()`                                                                                                             |
| `rank()`, `denseRank()`, `rowNumber()` | `fn.rank()`, `fn.denseRank()` and `fn.rowNumber()` with `over()`. See [Expressions](./expressions.md#window-functions). |

### Upserts

knex's `upsert()` compiles to `REPLACE INTO` on MySQL, which deletes the existing row and inserts a new one, so delete triggers and `ON DELETE CASCADE` run. It throws on postgres and SQLite. Use `onConflict().merge()`, which runs objection's insert hooks and validation, returns models, and works on postgres, MySQL and SQLite:

```js
// Insert Jennifer, or update the existing row with the same email.
await Person.query()
  .insert({ email: 'jennifer@example.com', firstName: 'Jennifer' })
  .onConflict('email')
  .merge();
```

```sql
-- postgres
insert into "persons" ("email", "firstName") values ('jennifer@example.com', 'Jennifer')
on conflict ("email") do update set "email" = excluded."email", "firstName" = excluded."firstName"
returning "id"

-- MySQL
insert into `persons` (`email`, `firstName`) values ('jennifer@example.com', 'Jennifer')
on duplicate key update `email` = values(`email`), `firstName` = values(`firstName`)

-- SQLite
insert into `persons` (`email`, `firstName`) values ('jennifer@example.com', 'Jennifer')
on conflict (`email`) do update set `email` = excluded.`email`, `firstName` = excluded.`firstName`
```

The column in `onConflict()` needs a unique index or a primary key. Without arguments, `merge()` updates every inserted column. To only update some of them, list them, or pass an object of values:

```js
// Only the name is updated. An existing product keeps its stock.
await Product.query()
  .insert({ sku: 'A-1', name: 'Big tent', stock: 1 })
  .onConflict('sku')
  .merge(['name']);
// ... on conflict ("sku") do update set "name" = excluded."name" returning "id"

// Insert the row, or do nothing if the sku exists.
await Product.query()
  .insert({ sku: 'A-1', name: 'Tent', stock: 1 })
  .onConflict('sku')
  .ignore();
```

The returned model has the values passed to `insert()` and the id, not the values of the stored row. After a merge they can differ. On postgres and SQLite, `returning('*')` returns the stored row:

```js
// The stored row has stock 5. The upsert adds 3 to it.
const product = await Product.query()
  .insert({ sku: 'A-1', name: 'Tent', stock: 3 })
  .onConflict('sku')
  .merge({ stock: Product.ref('stock').plus(fn.excluded('stock')) })
  .returning('*');

product.stock; // 8. Without returning('*') it would be 3.
```

MySQL has no `returning()`. knex ignores it there with a warning, so fetch the row again with a query.

## Deletes with a limit

`delete().limit(n)` only works on MySQL. knex rejects a limit on deletes on the other databases, and so does `page()` or `range()` on a delete query.

```js
// MySQL: delete expired orders in batches of 1000.
let deleted;
do {
  deleted = await Order.query().delete().where('status', 'expired').limit(1000);
} while (deleted > 0);
// delete from `orders` where `status` = 'expired' limit 1000

// postgres and SQLite: throws
// Aborted query compilation: `limit` has no effect on a `delete` statement
```

knex leaves `orderBy()` out of deletes, also on MySQL, so the database picks which matching rows are deleted. A delete with both `orderBy()` and `limit()` warns about it on MySQL, and will throw in 5.0.

Deletes have no offset either. knex used to leave it out, so `delete().page(2, 10)` deleted the first 10 rows on MySQL, and `delete().offset(10)` deleted every matching row. An offset on a delete query now throws `offset() can't be used with a delete query`. `page(0, n)` and `offset(0)` add no offset and still work. To delete a page of rows, select their ids first:

```js
const ids = await Person.query().select('id').orderBy('id').page(2, 10);
await Person.query().delete().whereIn('id', ids.results.map((it) => it.id));
```
