# Installation

`@abedmurrar/objection` can be installed using `npm` or `yarn`. It uses [knex](https://knexjs.org/) as its database access layer, so you also need to install it. It needs Node.js 24 or newer and knex 3.3 or newer. The [requirements](/fork/#requirements) list the supported database versions.

```bash
npm install @abedmurrar/objection knex
yarn add @abedmurrar/objection knex
```

Coming from objection.js? Install it under the name `objection` and existing imports keep working:

```bash
npm install objection@npm:@abedmurrar/objection
```

The examples in these docs import from `'objection'`, which works when the package is installed under that name. Otherwise, import from `'@abedmurrar/objection'`.

You also need to install one of the following depending on the database you want to use:

```bash
npm install pg       # postgres
npm install sqlite3  # SQLite
npm install mysql2   # MySQL
npm install mariadb  # MariaDB
```

MySQL is tested with the `mysql2` driver and MariaDB with the `mariadb` driver. See [MariaDB](/fork/mysql#connecting) for how to connect to MariaDB.

You can use the `next` tag to install a prerelease, when there is one:

```bash
npm install @abedmurrar/objection@next
```
