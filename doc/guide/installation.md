# Installation

`@abedmurrar/objection` can be installed using `npm` or `yarn`. It uses [knex](https://knexjs.org/) as its database access layer, so you also need to install it.

```bash
npm install @abedmurrar/objection knex
yarn add @abedmurrar/objection knex
```

Coming from objection.js? Install it under the name `objection` and existing imports keep working:

```bash
npm install objection@npm:@abedmurrar/objection
```

You also need to install one of the following depending on the database you want to use:

```bash
npm install pg
npm install sqlite3
npm install mysql
npm install mysql2
```

You can use the `next` tag to install a prerelease, when there is one:

```bash
npm install @abedmurrar/objection@next
```
