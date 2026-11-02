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
npm run bench:compare -- --baseline ../objection-baseline
```
