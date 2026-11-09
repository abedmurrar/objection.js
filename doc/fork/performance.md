# Performance

The fork does less work per query than objection.js 3.1.5. The generated SQL and the results are the same; the difference is in the work objection does around the database.

## What is faster

| Change                                 | What it affects                                                                                                                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bound classes share their validator    | A class bound to a knex instance with `bindKnex()` or `bindTransaction()`, which happens for every transaction that uses them, used to create a validator of its own: two Ajv instances and a new compile of the schema. It now uses the validator of the class it is bound from. |
| Faster deep clone                      | `toJSON()` clones the object and array attributes of every model, and validation clones the input when the schema has default values. Every value is now cloned without lodash, with the same result as lodash's `cloneDeep`, and the package no longer ships a copy of it.       |
| Schema defaults checked once           | Validation used to walk the whole schema on every validate to find out whether it has default values. The answer is now cached per schema.                                                                                                                                        |
| No relation parsing without relations  | `fromJson()` and the other methods that turn JSON into models skip the relation parsing, and its allocations, when the JSON has no relations.                                                                                                                                     |
| Joined rows parsed without string keys | `withGraphJoined()` used to build and hash a key like `/1/pets/3/toys/7` for every table of every row. Models are now looked up by id in a map per parent and relation.                                                                                                           |
| Static hooks only when they exist      | Every query used to create the arguments of the static hooks (`beforeFind`, `afterInsert`, ...) and call them, even when the model doesn't define them.                                                                                                                           |
| Operation walks without allocations    | A query walks its list of operations about twenty times while it is built and executed. The walks no longer allocate functions, and checking whether a query is a find takes one walk instead of five.                                                                            |
| Operations summarized once (4.2.5) | A query asked the same questions about its operations over and over: a plain find walked them 17 times, and most walks found nothing. It now keeps a summary of them, its hooks and the kinds of its operations, made by one walk and kept up to date when operations are added: `findById()` takes 18.7% fewer instructions, a find 8.0% fewer, a delete with a where 14.6% fewer. |
| Faster keys for ids                    | Relations and graphs are matched by keys made from ids. Numbers and strings, which almost all ids are, are now converted first.                                                                                                                                                   |
| Hooks run without promises (4.1.3)     | Every phase of a query (`onBefore1` ... `onAfter3`, `runBefore()`, `runAfter()`) used to chain promises and await each hook, about 40 promises per query, even with no hooks. The hooks now run one after another and only wait when a hook returns a promise.                  |
| Graph inserts in one query per table on MySQL (4.1.2) | `insertGraph()` and `upsertGraph()` inserted one row per query on MySQL. They now insert the rows of a table together, as on postgres: a person with 2 pets with 2 toys each takes 3 inserts instead of 7.                                                                         |
| Graph unrelates in one statement (4.2.3) | `upsertGraph()` deletes the join rows of the many-to-many rows it unrelates by the ids of both sides in one statement. MySQL fetched their ids in a separate query first: an `upsertGraph()` that unrelates one item takes 4.6 ms instead of 5.1 ms on MySQL 8.4. See [Many-to-many writes](./mysql.md#many-to-many-writes). |
| Rows written to models directly | Every row of a query went through `fromDatabaseJson()`, `$setDatabaseJson()` and `$parseDatabaseJson()`, and with `snakeCaseMappers()` it was copied into a mapped object before it was copied onto the model. `withGraphJoined()` built such an object for every model of every row. When a model class keeps these methods, the columns are now written to the model directly: `withGraphJoined()` takes 22.5% fewer instructions, `withGraphFetched()` 13.8% fewer, and 1000 rows with `snakeCaseMappers()` 22.2% fewer. |

## Benchmarks

Measured with the [benchmarks in the repository](https://github.com/abedmurrar/objection.js/tree/main/bench) on Node.js 24. They were run against 4.0.0-alpha.0, the release of the fork before these changes. That release has the same implementation of these parts as objection.js 3.1.5.

| Operation                                              |   Before |    After |     Change |
| ------------------------------------------------------ | -------: | -------: | ---------: |
| A validated insert in a new transaction (`bindKnex()`) |  1.44 ms | 122.7 µs | **−91.5%** |
| Validating 1000 models with default values             |  2.71 ms |  1.23 ms | **−54.8%** |
| `toJSON()` of 1000 models with JSON attributes         |  2.34 ms |  1.31 ms | **−44.0%** |
| `withGraphJoined('pets.toys')` of 100 persons          |  1.51 ms |  1.21 ms | **−19.5%** |
| `findById()`                                           |  34.4 µs |  27.7 µs | **−19.4%** |
| `insert()` of 1 row                                    |  14.4 µs |  11.8 µs | **−18.6%** |
| `upsertGraph()` of 20 persons with pets                |  3.97 ms |  3.38 ms | **−14.7%** |
| A find returning 1 row                                 |  18.0 µs |  15.6 µs | **−13.6%** |
| `insertGraph()` of 50 persons with pets, validated     |  1.17 ms |  1.02 ms | **−12.6%** |
| A batch `insert()` of 100 rows                         | 181.9 µs | 161.2 µs | **−11.4%** |
| Building a query with expressions                      |  56.9 µs |  52.1 µs |  **−8.4%** |

Cloning without lodash was measured separately, against the fork just before the change:

| Operation                                                                          |   Before |   After |     Change |
| ---------------------------------------------------------------------------------- | -------: | ------: | ---------: |
| `toJSON()` of 1000 models whose JSON attributes hold a class instance, Map and Set | 24.91 ms | 3.19 ms | **−87.2%** |

Models whose JSON attributes hold only plain objects, arrays and dates are cloned as before.

These measure objection's own work, against a mocked database. With a real database, the database's time comes on top: reading 1000 rows from SQLite, for example, is mostly SQLite's time and the `JSON.parse()` of the JSON columns, and is about 6% faster. The full results, including the end-to-end runs on SQLite, are in [bench/README.md](https://github.com/abedmurrar/objection.js/blob/main/bench/README.md).

### Since 4.1

Measured as the CPU instructions per operation (`bench/count.js`), which unlike times barely depend on what else runs on the machine:

| The change of 4.1.3, against 4.1.1 | Change     |
| ---------------------------------- | ---------: |
| `findById()`                    | **−27.2%** |
| `delete()` with a where clause  | **−14.2%** |
| A find returning 1 row          | **−11.5%** |
| `insert()` of 1 row             | **−10.5%** |
| `findById()` on SQLite          |  **−7.4%** |

The scenarios that are dominated by rows, graphs and validation are unchanged by it. On a real MySQL, the batched graph inserts of 4.1.2 made a nested `insertGraph()` (a person with 2 pets with 2 toys each, in a transaction) go from 29% slower than objection.js 3.1.5 to 16% faster: it runs 5 queries instead of 9.

## Compared with other ORMs

`bench/orms` runs the same scenarios on a real MySQL 8.4 through the mysql2 driver with this fork, objection 3.1.5 and 4.4.2, raw knex, kysely, drizzle-orm, sequelize, typeorm and mikro-orm, each with its own API. These are the results of 4.2.5, on Linux with Node.js 24.17 and MySQL 8.4 in Docker, median time per operation of 3 rounds, all from one run on a quiet machine:

| Scenario                        | This fork | objection 3.1.5 | objection 4.4.2 | Fastest other ORM     | knex (no ORM) | kysely   |
| ------------------------------- | --------: | --------------: | --------------: | --------------------- | ------------: | -------: |
| Find by id                      |  178.2 µs |        204.9 µs |        226.8 µs | typeorm, 190.8 µs     |      144.2 µs | 111.3 µs |
| Find 100 rows                   |  252.2 µs |        262.6 µs |        334.0 µs | typeorm, 325.4 µs     |      206.1 µs | 188.6 µs |
| Find 1000 rows                  |  714.1 µs |        772.3 µs |         1.09 ms | drizzle-orm, 1.16 ms  |      528.2 µs | 499.2 µs |
| Delete by id                    |  169.2 µs |        172.7 µs |        199.6 µs | drizzle-orm, 127.3 µs |      103.1 µs |  97.1 µs |
| Eager loading, separate queries |   2.66 ms |         2.73 ms |         3.35 ms | drizzle-orm, 3.23 ms  |       1.98 ms |  1.97 ms |
| Eager loading, one query        |   2.27 ms |         2.59 ms |         3.23 ms | typeorm, 2.85 ms      |       1.61 ms | 100.2 ms |
| Batch insert of 100 rows        |   4.16 ms |    not on MySQL |    not on MySQL | mikro-orm, 4.14 ms    |       3.89 ms |  3.96 ms |
| Nested insert                   |   4.64 ms |         5.00 ms |         5.48 ms | drizzle-orm, 4.25 ms  |       4.17 ms |  4.09 ms |
| `upsertGraph()` in a transaction |   6.22 ms |         6.45 ms |         7.33 ms | none has one          |               |          |

The nested insert is a person with 2 pets with 2 toys each, in a transaction. kysely's eager loading in one query builds the graph from JSON aggregates, which is slow on MySQL.

Among the ORMs, the fork was the fastest at finding rows and at eager loading. drizzle-orm, typeorm and sequelize deleted a row by id faster, and drizzle-orm and mikro-orm were faster at the nested insert; mikro-orm's batch insert was even. Inserts and updates of single rows and transactions take mostly MySQL's commit to disk, about 3 to 4 ms here, and all contenders were within 9% of each other there.

knex and kysely, which are query builders and don't create models, are faster than every ORM at the small queries. The fork builds on knex, so knex's own work per query is part of every query: a find by id took 34 µs more than knex and 67 µs more than kysely. kysely also uses mysql2's connection pool, but that explains only a small part of its lead over knex (23% at a find by id in this run): with mysql2's pool, the fork found rows by id 2% to 17% faster. See [mysql2's own connection pool](./mysql.md#mysql2-s-own-connection-pool). Times on a database depend on the machine and on what else runs on it; run the benchmark on your own setup before relying on these numbers.

## The TypeScript build

The source is TypeScript, compiled to CommonJS by `tsc`. The compiled code does the same work as the JavaScript it replaced, and it's as fast. Against the last JavaScript build, 7 rounds of every benchmark scenario, the largest differences were within noise:

| Operation                                   | JavaScript | TypeScript |  Change |
| ------------------------------------------- | ---------: | ---------: | ------: |
| A batch `insert()` of 100 rows              |   118.9 µs |   118.7 µs |  −0.2%  |
| `toJSON()` of 1000 models                   |   979.6 µs |   969.4 µs |  −1.0%  |
| Validating 1000 models with default values  |   919.3 µs |   919.7 µs |  +0.0%  |
| `withGraphJoined('pets.toys')` of 100 persons |   821.5 µs |   815.0 µs |  −0.8%  |
| Reading 1000 rows                           |    1.25 ms |    1.27 ms |  +1.2%  |

4.0.0-beta.6 to beta.8 were up to 20% slower, because two modules exported getters (see [Contributing](/guide/contributing) for why that matters); beta.9 fixed it.

## Eager loading on MySQL

4.0.0-alpha.0 ran every query of `withGraphFetched()` and `fetchGraph()` one at a time on MySQL, along with the graph writes, which deadlocked when they ran concurrently. Reads don't deadlock, so eager loading runs its queries 4 at a time again, as in objection.js 3.1.5. Since 4.1.2, graph writes insert the rows of a table in one query, and since 4.2.2 they run 4 queries at a time on MySQL too: with 1 ms per query, `upsertGraph()` of 20 persons with pets takes 32 ms instead of 101 ms (68% less), and on a real MySQL 8.4 an `upsertGraph()` of a person, 2 pets and 4 toys takes 14.0 ms instead of 28.2 ms without a transaction, and 6.6 ms instead of 7.5 ms in one. See [Graph operations run 4 queries at a time](./mysql.md#graph-operations-run-4-queries-at-a-time). With 1 ms per query, `withGraphFetched('[pets.toys, movies]')` takes 23.5% less time than in 4.0.0-alpha.0.

The number of queries doesn't change: eager loading runs one query per relation in the expression for all the models, not one per model.

## Running the benchmarks

```sh
npm run bench                                   # all scenarios
npm run bench -- --filter graph                 # scenarios whose name matches
npm run bench:compare -- --baseline ../other    # compare two checkouts
node bench/sql-check.js --baseline ../other     # check that the SQL and results are the same
node bench/count.js --baseline ../other         # CPU instructions, for busy machines
npm run bench:orms                              # against other ORMs on MySQL
```

[bench/README.md](https://github.com/abedmurrar/objection.js/blob/main/bench/README.md) explains how to set them up.
