---
layout: home
title: '@abedmurrar/objection: the TypeScript SQL ORM for Node.js, built on knex'
titleTemplate: false
hero:
  name: '@abedmurrar/objection'
  text: The SQL ORM for Node.js that knows what your queries return
  tagline: Built on knex. Strictly typed, fast, and at home on Postgres, MySQL, MariaDB and SQLite. A fork of objection.js.
  actions:
    - theme: brand
      text: Get Started →
      link: /guide/installation
    - theme: alt
      text: What's new in the fork
      link: /fork/
    - theme: alt
      text: GitHub
      link: https://github.com/abedmurrar/objection.js
features:
  - title: Types that know what you loaded
    details: Relations are inferred from relationMappings, results only contain the relations a query fetched, and relation expressions, modifiers and Model.ref() columns are checked at compile time.
    link: /fork/typescript
  - title: Fast
    details: 13% to 19% less of objection's own work per query than objection.js 3.1.5, toJSON() 44% less, validation 55% less, a validated insert in a new transaction 91% less. Same SQL, same results.
    link: /fork/performance
  - title: MySQL and MariaDB, not just postgres
    details: JSON field expressions, the whereJson* methods, batch inserts and an fn.* helper for every MySQL 8.4 function. MariaDB 10.6 and 11.4 are tested in CI.
    link: /fork/mysql
  - title: Expressions without raw SQL
    details: Pet.ref('age').gte(3), fn.count().filter(...), fn.case(), window functions and more, all typed.
    link: /fork/expressions
  - title: Safer queries
    details: Escaped JSON field keys (an SQL injection in objection.js 3.1.5), orWhere() that can't match other owners' rows, and a for() that is no longer ignored.
    link: /fork/breaking-changes
  - title: Modern
    details: Written in strict TypeScript. Node.js 22+, ES modules and CommonJS from one package, knex 3.3, no lodash and no bluebird.
    link: /fork/
---

`@abedmurrar/objection` is an [ORM](https://en.wikipedia.org/wiki/Object-relational_mapping) for [Node.js](https://nodejs.org/), or more precisely **a relational query builder**: you get everything an SQL query builder gives you, plus models, relations, eager loading, graph inserts and upserts, transactions and validation. It's built on [knex](https://knexjs.org), so every database knex supports works. Postgres, MySQL, MariaDB and SQLite are tested in CI.

It started as a fork of objection.js 3.1.5 by Sami Koskimäki and its contributors, and keeps its API. The [guide](/guide/) and the [API reference](/api/objection/) of this site come from objection.js and apply as they are; the [fork section](/fork/) covers what this package adds and changes.

```sh
npm install @abedmurrar/objection knex
```

Coming from objection.js? Install it as `objection@npm:@abedmurrar/objection` and existing imports keep working. Then read the [breaking changes](/fork/breaking-changes) and the [migration guide](/release-notes/migration).

What you get:

- **A declarative way of [defining models](/guide/models.html) and the relations between them**
- **[Fetching, inserting, updating and deleting](/guide/query-examples.html) objects with the full power of SQL**
- **[Eager loading](/guide/query-examples.html#eager-loading), [inserting](/guide/query-examples.html#graph-inserts) and [upserting](/guide/query-examples.html#graph-upserts) object graphs**
- **Easy [transactions](/guide/transactions.html)**
- **[Strict TypeScript types](/fork/typescript)**
- **Optional [JSON schema](/guide/validation.html) validation**
- **A way to [store complex documents](/guide/documents.html) as single rows**

What you don't get:

- **A query language of its own.** SQL is the query language. You don't have to write SQL strings: the query builder is [knex](https://knexjs.org), and the [raw](/api/objection/#raw) helper is there for anything it can't express.
- **A database schema generated from the models.** That gets in the way as soon as things aren't trivial, so the schema is left to you. knex has a great [migration tool](https://knexjs.org/guide/migrations.html) for this job.

The best way to get started is the [example project](https://github.com/abedmurrar/objection.js/tree/main/examples/koa). There's also a [TypeScript version](https://github.com/abedmurrar/objection.js/tree/main/examples/koa-ts).
