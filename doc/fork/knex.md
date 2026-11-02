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
await Person.query()
  .comment('monthly report')
  .groupBy('age')
  .having('age', '>', 18)
  .andHavingNotNull('age');

await Person.query()
  .delete()
  .using('pets')
  .where('pets.ownerId', ref('persons.id'))
  .where('pets.species', 'snake');

await Person.query().join('pets', (join) =>
  join.on('pets.ownerId', 'persons.id').or.on('pets.sitterId', 'persons.id'),
);
```

`updateFrom()`, `clearGroup()`, `clearHaving()` and `options()` worked but weren't typed. `clearGroup()` and `clearHaving()` now remove the operations from the query, like `clearSelect()` and `clearWhere()`, so `has()` sees them as cleared.

`orHavingIn()`, `orHavingBetween()` and `orHavingNotBetween()` used to add their conditions with `and`.

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
await Person.query()
  .insert({ email: 'jennifer@example.com', firstName: 'Jennifer' })
  .onConflict('email')
  .merge();
```

## Deletes with a limit

`delete().limit(n)` only works on MySQL. knex rejects a limit on deletes on the other databases, and so does `page()` or `range()` on a delete query.
