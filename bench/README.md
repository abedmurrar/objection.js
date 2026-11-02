# Benchmarks

Runtime benchmarks of objection's own overhead. They are not part of the published package.

```sh
npm run bench                                   # all scenarios
npm run bench -- --filter rows                  # scenarios whose name matches a regex
npm run bench:compare -- --baseline ../other    # compare against another checkout
node bench/sql-check.js --baseline ../other     # check that both generate the same SQL
```

- `scenarios/mock.js` runs against a mocked knex (`testUtils/mockKnex.js`) that answers queries with canned rows. These scenarios measure only objection: building queries, running them through the operation pipeline, turning rows into models, eager loading, graph inserts and validation.
- `scenarios/sqlite.js` runs the same kind of queries end to end on an in-memory SQLite database, which includes the database's own time.

Every scenario runs in its own process, warms up, and is then timed in samples (`--samples`, `--sample-ms`, `--warmup-ms`). `bench:compare` alternates between the two checkouts for `--rounds` rounds, so changes in machine load affect both alike. A change only counts when it is more than 3 times the spread between rounds.

To get a baseline checkout of another commit:

```sh
git worktree add ../objection-baseline <commit>
ln -s "$PWD/node_modules" ../objection-baseline/node_modules
# Commits from the TypeScript move on keep their source in src/; build it.
(cd ../objection-baseline && [ -d src ] && npm run build)
npm run bench:compare -- --baseline ../objection-baseline
```

## Results of the perf branch

`npm run bench:compare -- --rounds 5` of the perf branch against `7f34d7a6`, the commit before it, on Node 24.17 (a 4-core laptop). "noise" means the change was smaller than 3 times the spread between rounds.

| Scenario                                                             |   Before |    After |         Change |
| -------------------------------------------------------------------- | -------: | -------: | -------------: |
| transaction: bindKnex + validated insert                             |  1.44 ms | 122.7 µs |     **−91.5%** |
| validate: 1000 models with defaults                                  |  2.71 ms |  1.23 ms |     **−54.8%** |
| rows: toJSON 1000 models                                             |  2.34 ms |  1.31 ms |     **−44.0%** |
| graph: withGraphFetched [pets.toys, movies] on MySQL, 1 ms per query |  8.90 ms |  6.80 ms |     **−23.5%** |
| graph: withGraphJoined [pets.toys] x100                              |  1.51 ms |  1.21 ms |     **−19.5%** |
| execute: findById                                                    |  34.4 µs |  27.7 µs |     **−19.4%** |
| execute: insert 1 row                                                |  14.4 µs |  11.8 µs |     **−18.6%** |
| write: upsertGraph 20 persons with pets                              |  3.97 ms |  3.38 ms |     **−14.7%** |
| execute: find 1 row                                                  |  18.0 µs |  15.6 µs |     **−13.6%** |
| write: insertGraph 50 persons with pets (validated)                  |  1.17 ms |  1.02 ms |     **−12.6%** |
| write: batch insert 100 rows                                         | 181.9 µs | 161.2 µs |     **−11.4%** |
| build: expressions                                                   |  56.9 µs |  52.1 µs |      **−8.4%** |
| build: where/orderBy/limit                                           |  14.4 µs |  12.7 µs | −12.1% (noise) |
| build: $relatedQuery with orWhere                                    |  19.5 µs |  17.6 µs |  −9.7% (noise) |
| graph: withGraphFetched [pets.toys, movies] x100                     |  1.45 ms |  1.36 ms |  −6.6% (noise) |
| rows: find 1000 rows                                                 |  1.71 ms |  1.69 ms |  −1.0% (noise) |
| rows: find 1000 rows (snakeCaseMappers)                              |  2.23 ms |  2.22 ms |  −0.7% (noise) |
| sqlite: findById                                                     | 154.2 µs | 138.8 µs | −10.0% (noise) |
| sqlite: withGraphJoined [pets.toys] x100                             | 10.08 ms |  9.41 ms |  −6.6% (noise) |
| sqlite: find 1000 rows                                               | 10.41 ms |  9.74 ms |  −6.4% (noise) |
| sqlite: insertGraph 20 persons in a transaction (validated)          |  7.42 ms |  7.01 ms |  −5.6% (noise) |
| sqlite: withGraphFetched [pets.toys, movies] x100                    |  7.19 ms |  7.19 ms |  −0.0% (noise) |

Most of the time of reading 1000 rows is `JSON.parse()` of the two JSON columns, which objection can't avoid. On SQLite the database's own time is most of the total.
