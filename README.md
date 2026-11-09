[![Tests](https://github.com/abedmurrar/objection.js/actions/workflows/test.yml/badge.svg)](https://abedmurrar.github.io/objection.js/)
[![Docs](https://img.shields.io/badge/docs-abedmurrar.github.io-blue)](https://abedmurrar.github.io/objection.js/)
[![npm](https://img.shields.io/npm/v/@abedmurrar/objection)](https://www.npmjs.com/package/@abedmurrar/objection)

# @abedmurrar/objection

**A fast, strictly typed SQL ORM for Node.js, built on [knex](https://knexjs.org).** Define your models and relations once, then query them with the full power of SQL: eager loading, graph inserts and upserts, transactions, JSON columns and expressions, with types that know what each query returns.

It started as a fork of objection.js 3.1.5 and keeps its API, so objection.js code runs on it apart from the [breaking changes](https://abedmurrar.github.io/objection.js/fork/breaking-changes), most of which fix queries that read or changed the wrong rows.

```sh
npm install @abedmurrar/objection knex
```

## Why this one

- **Types that know what you loaded.** Relations are inferred from `relationMappings`, query results only contain the relations the query fetched, and relation expressions, modifier names and `Model.ref()` columns are checked at compile time. See [TypeScript](https://abedmurrar.github.io/objection.js/fork/typescript).
- **Fast.** objection's own work for a query takes 13% to 19% less time than in objection.js 3.1.5, and since 4.1.3 another 10% to 27% fewer CPU instructions; `toJSON()` takes 44% less, validation 55% less, and a validated insert in a new transaction 91% less, with the same SQL and results. On a real MySQL, among the ORMs we measured (objection, sequelize, typeorm, mikro-orm, drizzle-orm) it was the fastest at finding rows and eager loading, and found a row by id 13% faster than objection.js 3.1.5; drizzle-orm, typeorm and sequelize were faster at deleting a row by id. Since 4.2.2, `upsertGraph()` on MySQL takes half the time without a transaction, because graph writes run 4 queries at a time there again. See [Performance](https://abedmurrar.github.io/objection.js/fork/performance).
- **MySQL and MariaDB as first-class databases**, not only postgres: JSON field expressions, the `whereJson*` methods, batch inserts and an `fn.*` helper for every MySQL 8.4 function. MariaDB 10.6 and 11.4 are tested in CI. See [MySQL and MariaDB](https://abedmurrar.github.io/objection.js/fork/mysql).
- **Expressions without raw SQL**, like `Pet.ref('age').gte(3)`, `fn.count().filter(...)`, `fn.case()` and window functions. See [Expressions](https://abedmurrar.github.io/objection.js/fork/expressions).
- **Safer.** JSON field keys are escaped (in objection.js 3.1.5 they allowed SQL injection), an `orWhere()` can no longer match the rows of other relation owners, `for()` is no longer silently ignored, many-to-many `unrelate()` and patches only touch the join rows that match their filters, and with [`useAfterFindInGraphs`](https://abedmurrar.github.io/objection.js/api/model/static-properties#static-useafterfindingraphs) the `afterFind()` filters of related models apply to eager loading too. See [Breaking changes](https://abedmurrar.github.io/objection.js/fork/breaking-changes).
- **Modern.** Node.js 24+, ES modules and CommonJS from one package, knex 3.3, the knex methods objection didn't have, no lodash and no bluebird, and `npm audit` reports nothing. The source is written in strict TypeScript and compiled with TypeScript 7.

## A quick look

```ts
import { Model, defineRelations } from '@abedmurrar/objection';
import { knex } from 'knex';

Model.knex(knex({ client: 'pg', connection: process.env.DATABASE_URL }));

class Pet extends Model {
  static tableName = 'pets';

  id!: number;
  name!: string;
  ownerId!: number;
}

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;

  static relationMappings = defineRelations(() => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'persons.id', to: 'pets.ownerId' },
    },
  }));
}

const people = await Person.query().where('firstName', 'like', 'J%').withGraphFetched('pets');

people[0].pets[0].name; // `pets` is in the type because the query loaded it
people[0].firstName;

// A person and their pets in one insert.
await Person.query().insertGraph({
  firstName: 'Jennifer',
  pets: [{ name: 'Doggo' }],
});
```

## Requirements

| Dependency | Version                                                |
| ---------- | ------------------------------------------------------ |
| Node.js    | 24 or newer (24 and 26 are tested)                     |
| knex       | 3.3 or newer                                           |
| MySQL      | 8.0.17 or newer (tested on 8.4 with `mysql2`)          |
| MariaDB    | 10.6 or newer (tested on 10.6 and 11.4 with `mariadb`) |
| SQLite     | 3.35 or newer for batch inserts                        |

Postgres is tested on the current release.

## Coming from objection.js

Install the package under the name `objection`, and existing `import { Model } from 'objection'` code keeps working:

```sh
npm install objection@npm:@abedmurrar/objection
```

Then read the [breaking changes](https://abedmurrar.github.io/objection.js/fork/breaking-changes) and the [migration guide](https://abedmurrar.github.io/objection.js/release-notes/migration). Most changes make queries do what they look like they do. The stricter types can flag code that only compiled because the old types were loose; the [TypeScript page](https://abedmurrar.github.io/objection.js/fork/typescript) lists an opt-out for every check.

## Documentation

- [What this package adds](https://abedmurrar.github.io/objection.js/fork/) to objection.js, page by page.
- **[The documentation site](https://abedmurrar.github.io/objection.js/)**: the guide and the API reference for everything else (models, relations, queries, eager loading, graphs, transactions and validation), which come from objection.js.
- [Changelog](https://abedmurrar.github.io/objection.js/release-notes/changelog) and [migration guide](https://abedmurrar.github.io/objection.js/release-notes/migration).
- [Contributing](https://abedmurrar.github.io/objection.js/guide/contributing).

## The approach

Like objection.js, this is less a classic ORM than **a relational query builder**: you work with queries, not with an object graph that hides the SQL.

- You get a declarative way to define models and their relations, the full power of SQL to fetch and change rows, eager loading, graph inserts and upserts, transactions, optional JSON schema validation, and a way to store documents in JSON columns.
- You don't get a query language of its own (the query builder is knex, and `raw()` is there for anything it can't express), or a schema generated from the models: [knex migrations](https://knexjs.org/guide/migrations.html) do that job.

## Credits

This project is built on objection.js by Sami Koskimäki and its many contributors, maintained at Vincit. Its design, its API, most of its code and much of the documentation come from there. Thank you.

Many fixes are ported from [ditojs/objection](https://github.com/ditojs/objection) by Jürg Lehni and its contributors, with credit in each commit. [Ported from ditojs/objection](https://abedmurrar.github.io/objection.js/fork/dito) lists them.

Released under the MIT license, like objection.js.
