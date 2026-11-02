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
| Faster keys for ids                    | Relations and graphs are matched by keys made from ids. Numbers and strings, which almost all ids are, are now converted first.                                                                                                                                                   |

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

4.0.0-alpha.0 ran every query of `withGraphFetched()` and `fetchGraph()` one at a time on MySQL, along with the graph writes, which deadlocked when they ran concurrently. Reads don't deadlock, so eager loading runs its queries 4 at a time again, as in objection.js 3.1.5. Graph writes still run one at a time on MySQL. With 1 ms per query, `withGraphFetched('[pets.toys, movies]')` takes 23.5% less time than in 4.0.0-alpha.0.

The number of queries doesn't change: eager loading runs one query per relation in the expression for all the models, not one per model.

## Running the benchmarks

```sh
npm run bench                                   # all scenarios
npm run bench -- --filter graph                 # scenarios whose name matches
npm run bench:compare -- --baseline ../other    # compare two checkouts
node bench/sql-check.js --baseline ../other     # check that the SQL and results are the same
```
