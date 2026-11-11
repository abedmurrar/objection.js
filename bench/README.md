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

## Concurrent graph writes

`npm run stress:graph` runs 20 `upsertGraph()` calls at the same time, without a transaction, on MySQL 8.4 and MariaDB 10.6 and 11.4 of `docker-compose.yml`. It runs every combination of foreign keys on the join table, an item that every owner shares, and graph write concurrency 1 and 4, for 20 rounds each: 9,600 calls. Each call patches, inserts, deletes and unrelates many-to-many rows and patches and inserts has-many rows. After every round it checks that each owner has exactly the graph it asked for. It fails on any wrong result or other error, and on deadlocks and lock wait timeouts between calls that write different rows, and prints the failing statements. With the shared item, the calls write the same rows (even owners delete it while odd owners unrelate it), which can deadlock with any queries, so those deadlocks are counted but don't fail it: CI saw 1 in 2,400 such calls on MariaDB 10.6.

```sh
docker compose up -d mysql mariadb10 mariadb11
npm run stress:graph
node bench/stress-graph-writes.js --rounds 3 --databases mysql   # fewer rounds, one database
node bench/stress-graph-writes.js --lib ../objection-old         # another checkout
```

It tests the 4.2.2 fix, which deletes the many-to-many rows of `upsertGraph()` by id. On 4.2.1, the release before it, 68 and 94 of the 3,200 calls on MariaDB 10.6 deadlocked in two runs, all between calls that write different rows. On 4.4.1, none of the 9,600 calls did locally. It takes about 3.5 minutes. CI runs 5 rounds of it. Run all 20 before releasing a change to graph writes.

## On a busy machine

Times depend on what else runs on the machine. Two more tools compare checkouts in ways that depend on it much less:

```sh
node bench/compare.js --baseline ../other --metric cpu   # CPU time of the worker instead of wall time
node bench/count.js --baseline ../other                  # CPU instructions per operation
```

`count.js` runs each scenario under `perf stat` in single-threaded Node processes, so that V8's background compiler and GC threads don't add to the counts. The counts repeat within about ±1%. It needs `perf` and `sudo sysctl kernel.perf_event_paranoid=1` (until the next reboot).

With `--max-change 1`, `count.js` exits with 1 when a scenario takes more than 1% more instructions than the baseline. The mock `withGraphJoined` scenario, whose count moves with unrelated changes, has its own limit of 6% in the script.

## In CI

`.github/workflows/checks.yml` runs on every pull request. It builds the pull request and `main` in two checkouts whose paths have the same length, and runs `sql-check.js`, `scripts/typings-bench.js --check` and `count.js --max-change 1` against `main`. A pull request with the `sql-change` label reports SQL differences without failing.

GitHub's runners don't have the hardware counters `perf` needs, so CI counts with valgrind (`--counter valgrind`). Its counts of the same code repeat within 0.2%, but every process takes about 20 seconds longer, so CI runs one count per checkout (`--runs 1`), fewer iterations (`--target 3e8`) and a scenario per CPU (`--jobs`). It only checks the scenarios on the mocked knex: under valgrind, the SQLite scenarios (SQLite's threads) and the "1 ms per query" ones (timers) vary by several percent between runs of the same code. See [checks on pull requests](../doc/guide/contributing.md#checks-on-pull-requests).

`node bench/profile.js "<scenario>"` runs one scenario under the CPU profiler and prints the functions with the most self time. With `--orm`, it runs an ORM scenario on MySQL instead (see below).

## Against other ORMs on MySQL

`bench/orms` runs the same 13 scenarios on this checkout, objection 4.4.2 and 3.1.5, raw knex, kysely, drizzle-orm, sequelize, typeorm and mikro-orm, on a real MySQL through the mysql2 driver: finds by id, of 100 and of 1000 rows, inserts of 1 and 100 rows, updates, deletes, eager loading with separate queries and with one query, a transaction, a nested insert, and an `upsertGraph()` with and without a transaction, which only the objection versions run. The latest results are in [Performance](../doc/fork/performance.md#compared-with-other-orms). Each contender uses its own idiomatic API on the same tables.

`fork-native-pool` is this checkout on mysql2's own pool, through knex's `connectionPool` option, instead of knex's pool. It isn't run by default: add it with `--contenders`. See [mysql2's own connection pool](../doc/fork/mysql.md#mysql2-s-own-connection-pool).

```sh
npm --prefix bench/orms install          # its dependencies, kept out of the root package
docker compose up -d mysql
npm run bench:orms                       # all contenders and scenarios
npm run bench:orms -- --contenders fork,knex,kysely --filter "find" --rounds 5
```

Every contender runs every scenario in a new process on tables copied from templates, so that each run starts from the same state. The rounds run the contenders in alternating order, and a contender's time is the median of its rounds. The database is `bench_orms` on 127.0.0.1:3306 as root; `BENCH_HOST`, `BENCH_PORT`, `BENCH_USER`, `BENCH_PASSWORD` and `BENCH_DB` change it. The writes include MySQL's commit to disk, so they are best run on an otherwise quiet machine.

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
