# Fork additions

`@abedmurrar/objection` is a fork of [objection.js](https://github.com/Vincit/objection.js) 3.1.5. This section only documents what the fork adds or changes. For everything else, the [objection.js documentation](https://vincit.github.io/objection.js) still applies.

## Installation

```sh
npm install @abedmurrar/objection@next knex
```

Existing code imports from `'objection'`. To keep those imports working, install the fork under that name:

```sh
npm install objection@npm:@abedmurrar/objection@next
```

Until 4.0 is final, releases are prereleases (`4.0.0-alpha.0`, ...) and are published under the `next` dist-tag.

## Requirements

| Dependency | Requirement                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| knex       | 3.3 or newer                                                                                         |
| ajv        | 8.20 or newer (comes as a dependency)                                                                |
| MySQL      | 8.0.17 or newer (tested on 8.4 with the `mysql2` driver). MySQL 5.7 and older aren't supported       |
| MariaDB    | 10.6 or newer (tested on 10.6 and 11.4 with the `mariadb` driver). See [MariaDB](./mysql.md#mariadb) |
| SQLite     | 3.35 or newer for batch inserts, 3.25 or newer for window functions                                  |
| Node.js    | 24 or newer (24 and 26 are tested)                                                                   |

## What the fork adds

| Page                                      | Summary                                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Breaking changes](./breaking-changes.md) | Security and behaviour fixes that change what queries do: escaped JSON keys, `orWhere` grouping, `for()` checks, unsupported dialects, `NULL` JSON columns, knex 3.3, MySQL graph concurrency.                                 |
| [MySQL](./mysql.md)                       | MySQL and MariaDB. JSON field expressions, the `whereJson*` methods, `whereJsonOverlaps()`, MySQL casts, batch inserts (also on SQLite), and an `fn.*` helper for every MySQL 8.4 built-in function.                           |
| [Expressions](./expressions.md)           | `eq()`, `gt()`, `and()`, `plus()`, ... on `ref()`, `val()`, `fn()` and `raw()`. Also `fn.case()`, `fn.exists()`, `fn.excluded()`, filtered aggregates, window functions and `none()`.                                          |
| [Joins and model classes](./joins.md)     | Model classes in place of table names, `Model.ref()` in join callbacks, `onJsonPathEquals()`, and fixes for raw columns in `whereIn()` and subqueries in joins.                                                                |
| [Performance](./performance.md)           | Less work per query than objection.js 3.1.5: shared validators for bound classes, a faster deep clone, cached schema checks, and faster parsing of joined rows. With benchmarks.                                               |
| [knex methods](./knex.md)                 | The knex methods objection didn't have: `andHaving*`, `comment()`, `hintComment()`, `using()`, `finally()` and `or` in joins. How to upsert, and what is left out on purpose.                                                  |
| [TypeScript](./typescript.md)             | Relations inferred from `relationMappings`, results that only contain loaded relations, checked relation expressions, modifiers and `Model.ref()` columns, typed `fn`/`ref` results, and a simpler custom query builder setup. |

The [changelog](../release-notes/changelog.md) lists each change per release. The [migration guide](../release-notes/migration.md) has before and after examples for upgrading TypeScript code.
