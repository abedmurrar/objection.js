# Fork additions

`@abedmurrar/objection` is a fork of objection.js 3.1.5. This section only documents what the fork adds or changes. For everything else, the [guide](/guide/) and the [API reference](/api/objection/) of this site, which come from objection.js, still apply.

## Installation

```sh
npm install @abedmurrar/objection knex
```

Existing code imports from `'objection'`. To keep those imports working, install the fork under that name:

```sh
npm install objection@npm:@abedmurrar/objection
```

Releases are published under npm's `latest` dist-tag. Prereleases, when there are any, go to `next`.

## Requirements

| Dependency | Requirement                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| knex       | 3.3 or newer                                                                                         |
| ajv        | 8.20 or newer (comes as a dependency)                                                                |
| MySQL      | 8.0.17 or newer (tested on 8.4 with the `mysql2` driver). MySQL 5.7 and older aren't supported       |
| MariaDB    | 10.6 or newer (tested on 10.6 and 11.4 with the `mariadb` driver). See [MariaDB](./mysql.md#mariadb) |
| SQLite     | 3.35 or newer for batch inserts, 3.25 or newer for window functions                                  |
| Node.js    | 22 or newer (22, 24 and 26 are tested)                                                               |

## What the fork adds

| Page                                      | Summary                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Breaking changes](./breaking-changes.md) | Security and behaviour fixes that change what queries do: escaped JSON keys, `orWhere` grouping, `for()` checks, unsupported dialects, `NULL` JSON columns, knex 3.3, MySQL graph concurrency.                                 |
| [MySQL](./mysql.md)                       | MySQL and MariaDB. JSON field expressions, the `whereJson*` methods, `whereJsonOverlaps()`, MySQL casts, batch inserts (also on SQLite), and an `fn.*` helper for every MySQL 8.4 built-in function.                           |
| [Expressions](./expressions.md)           | `eq()`, `gt()`, `and()`, `plus()`, ... on `ref()`, `val()`, `fn()` and `raw()`. Also `fn.case()`, `fn.exists()`, `fn.excluded()`, filtered aggregates, window functions and `none()`.                                          |
| [Joins and model classes](./joins.md)     | Model classes in place of table names, `Model.ref()` in join callbacks, `onJsonPathEquals()`, and fixes for raw columns in `whereIn()` and subqueries in joins.                                                                |
| [Performance](./performance.md)           | Less work per query than objection.js 3.1.5: shared validators for bound classes, a faster deep clone, cached schema checks, faster parsing of joined rows, hooks without promises and batched graph inserts on MySQL. With benchmarks, also against other ORMs on MySQL.                                               |
| [knex methods](./knex.md)                 | The knex methods objection didn't have: `andHaving*`, `comment()`, `hintComment()`, `using()`, `finally()` and `or` in joins. How to upsert, and what is left out on purpose.                                                  |
| [Ported from ditojs/objection](./dito.md) | Fixes ported from Jürg Lehni's fork, which publishes the `objection` package, with links to the original commits.                                                                                                              |
| [TypeScript](./typescript.md)             | Relations inferred from `relationMappings`, results that only contain loaded relations, checked relation expressions, modifiers and `Model.ref()` columns, typed `fn`/`ref` results, and a simpler custom query builder setup. |

## Compared with objection.js 3.1.5

Every pull request is checked against objection.js 3.1.5: the [benchmark scenarios](https://github.com/abedmurrar/objection.js/tree/main/bench#compared-with-objectionjs-315) run on both on postgres, MySQL and SQLite, and the SQL, the bindings and the returned models are compared. Finds, `findById()`, eager loading with `withGraphFetched()` and `withGraphJoined()`, deletes, `toJSON()`, validation and transactions generate the same SQL and results as 3.1.5. The scenarios that differ, on purpose:

- **`orWhere()` through a relation** is grouped, so it can't match the rows of other owners. See [`orWhere` no longer escapes the conditions objection adds](./breaking-changes.md#orwhere-no-longer-escapes-the-conditions-objection-adds).
- **Batch inserts** (`insert([...])`) work on MySQL and SQLite, where 3.1.5 throws. `insertGraph()` and `upsertGraph()` on MySQL insert the new rows of a table together, instead of one query per row. See [batch inserts](./mysql.md#batch-inserts).
- **Expression methods** like `ref('age').gte(18)` are new. See [expressions](./expressions.md#expression-methods).

A difference that isn't on this list fails the check.

The [changelog](../release-notes/changelog.md) lists each change per release. The [migration guide](../release-notes/migration.md) has before and after examples for upgrading TypeScript code.
