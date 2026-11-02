[![Tests](https://github.com/abedmurrar/objection.js/actions/workflows/test.yml/badge.svg)](https://github.com/abedmurrar/objection.js/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/@abedmurrar/objection/next)](https://www.npmjs.com/package/@abedmurrar/objection)

# @abedmurrar/objection

**A fast, strictly typed SQL ORM for Node.js, built on [knex](https://knexjs.org).** Define your models and relations once, then query them with the full power of SQL: eager loading, graph inserts and upserts, transactions, JSON columns and expressions, with types that know what each query returns.

It started as a fork of [objection.js](https://github.com/Vincit/objection.js) 3.1.5 and keeps its API, so objection.js code runs on it apart from the [breaking changes](doc/fork/breaking-changes.md), most of which fix queries that read or changed the wrong rows.

```sh
npm install @abedmurrar/objection@next knex
```

## Why this one

- **Types that know what you loaded.** Relations are inferred from `relationMappings`, query results only contain the relations the query fetched, and relation expressions, modifier names and `Model.ref()` columns are checked at compile time. See [TypeScript](doc/fork/typescript.md).
- **Fast.** objection's own work for a query takes 13% to 19% less time than in objection.js 3.1.5, `toJSON()` 44% less, validation 55% less, and a validated insert in a new transaction 91% less, with the same SQL and results. See [Performance](doc/fork/performance.md).
- **MySQL and MariaDB as first-class databases**, not only postgres: JSON field expressions, the `whereJson*` methods, batch inserts and an `fn.*` helper for every MySQL 8.4 function. MariaDB 10.6 and 11.4 are tested in CI. See [MySQL and MariaDB](doc/fork/mysql.md).
- **Expressions without raw SQL**, like `Pet.ref('age').gte(3)`, `fn.count().filter(...)`, `fn.case()` and window functions. See [Expressions](doc/fork/expressions.md).
- **Safer.** JSON field keys are escaped (in objection.js 3.1.5 they allowed SQL injection), an `orWhere()` can no longer match the rows of other relation owners, and `for()` is no longer silently ignored. See [Breaking changes](doc/fork/breaking-changes.md).
- **Modern.** Node.js 24+, ES modules and CommonJS from one package, knex 3.3, the knex methods objection didn't have, TypeScript 7, no lodash and no bluebird, and `npm audit` reports nothing. The source is moving to TypeScript.

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
npm install objection@npm:@abedmurrar/objection@next
```

Then read the [breaking changes](doc/fork/breaking-changes.md) and the [migration guide](doc/release-notes/migration.md). Most changes make queries do what they look like they do. The stricter types can flag code that only compiled because the old types were loose; the [TypeScript page](doc/fork/typescript.md) lists an opt-out for every check.

## Documentation

- [What this package adds](doc/fork/README.md) to objection.js, page by page.
- [The objection.js guide and API reference](https://vincit.github.io/objection.js) still apply to everything else: models, relations, queries, eager loading, graphs, transactions and validation.
- [Changelog](doc/release-notes/changelog.md) and [migration guide](doc/release-notes/migration.md).
- [Contributing](doc/guide/contributing.md) and [releasing](RELEASING.md).

## The approach

Like objection.js, this is less a classic ORM than **a relational query builder**: you work with queries, not with an object graph that hides the SQL.

- You get a declarative way to define models and their relations, the full power of SQL to fetch and change rows, eager loading, graph inserts and upserts, transactions, optional JSON schema validation, and a way to store documents in JSON columns.
- You don't get a query language of its own (the query builder is knex, and `raw()` is there for anything it can't express), or a schema generated from the models: [knex migrations](https://knexjs.org/guide/migrations.html) do that job.

## Credits

This project is built on [objection.js](https://github.com/Vincit/objection.js) by [Sami Koskimäki](https://github.com/koskimas) and its many contributors, maintained at [Vincit](https://github.com/Vincit). Its design, its API, most of its code and much of the documentation come from there. Thank you.

Released under the [MIT license](LICENSE), like objection.js.
