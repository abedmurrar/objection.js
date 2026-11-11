# Contribution guide

## Issues

You can use [GitHub issues](https://github.com/abedmurrar/objection.js/issues) to request features and file bug reports. An issue is also a good place to ask questions. We are happy to help out if you have reached a dead end, but please try to solve the problem yourself first.

When creating an issue there are couple of things you need to remember:

1. **Update to the latest version of objection if possible and see if the problem remains.**
   If updating is not an option you can still request critical bug fixes for older versions.

2. **Describe your problem.**
   Answer the following questions: Which objection version are you using? What are you doing? What code are you running? What is happening? What are you expecting to happen instead? If you provide code examples (please do!), **use the actual code you are running**. People often leave out details or use made up examples because they think they are only leaving out irrelevant stuff. If you do that, you have already made an assumption about what the problem is and it's usually something else. Also provide all possible stack traces and error messages.

3. **If possible, provide an actual reproduction**
   The fastest way to get your bug fixed or problem solved is to create a simple standalone app or a test case that demonstrates your problem. There's a file called [reproduction-template.js](https://github.com/abedmurrar/objection.js/blob/main/reproduction-template.js) you can use as a starting point for your reproduction.

Please bear in mind that objection has thousands of tests and if you run into a problem, say with `insert` method, it doesn't mean that `insert` is completely broken, but some small part of it you are using is. That's why enough context is necessary. It's not enough to say, "insert fails". You need to provide the code that fails and usually the models that are used too. And let's say this again: **don't provide made up code examples!** When you do, you only write the parts you think are relevant and usually leave out the useful information. Use the actual code that you have tested to fail.

## Pull requests

If you have found a bug or want to add a feature, pull requests are always welcome! It's better to create an issue first to open a discussion if the feature is something that should be added to objection. In case of bugfixes it's also a good idea to open an issue indicating that you are working on a fix.

For a pull request to get merged it needs to have the following things:

1. **A good description of what the PR fixes or adds. You can just add a link to the corresponding issue.**

2. **Tests that verify the fix/feature.** It's possible to create a PR without tests and ask for someone else to write them but in that case it may take a long time or forever until someone finds time to do it. _Untested code will never get merged!_

3. **For features you also need to write documentation.** See the [development setup](/guide/contributing.html#development-setup) section for instructions on how to write documentation.

4. **The checks have to pass.** Besides the tests, CI compares every pull request with `main`. See [checks on pull requests](#checks-on-pull-requests).

## Development setup

1. **Fork objection in github**

2. **Clone objection**

```bash
git clone git@github.com:<your-account>/objection.js.git objection
```

3. **Run `npm install` at the root of the repo**

4. **Run `docker compose up` at the root of the repo**
   - If you have local databases running, shut them down or port binding will conflict.

5. **Create test users and databases by running `node setup-test-db` at the root of the repo**

6. **Run `npm test` in objection's root to see if everything works.** The source is TypeScript in `src/` and is compiled into `lib/` by `npm run build` (`tsc -p tsconfig.build.json`), which `npm test` runs first. The tests and the package use `lib/`. The package entry `src/objection.js` stays a small JavaScript file on purpose, so that `require()` returns exactly the same object as before, and the PEG.js parsers in `src/queryBuilder/parsers/` are generated JavaScript.

7. **Run `npm run docs:dev` and go to `http://localhost:5173/objection.js/` to see the generated documentation site when you change the markdown files in the `doc` folder.**

You can run the tests on a subset of databases by setting the `DATABASES` env variable

```bash
# Only run tests on sqlite. No need for docker compose.
DATABASES=sqlite3 npm test
```

The code runs on Node.js 22 and newer, so it can only use what Node.js 22 supports. `@types/node` is kept at 22, so `tsc` rejects newer APIs, and CI runs the tests on 22, 24 and 26.

Two rules keep the compiled code as fast as the JavaScript it replaced:

- **Don't re-export an imported binding** (`export { x } from './x'`, or importing `x` and listing it in `export { ... }`). tsc compiles it to a getter on `exports`, which puts the whole exports object of the module in V8's slow dictionary mode, and every call through it gets several times slower. Export a local constant instead: `const x = importedX; export { x };`. `tests/unit/moduleExports.js` fails if a compiled module exports a getter.
- **Import JavaScript modules by name** (`import { parse } from './parser'`), not with `import * as`, which wraps them in an object of getters.

[Biome](https://biomejs.dev/) lints and formats the code. `npm run lint` checks both, and `npm run format` fixes what can be fixed automatically. Run it before committing; CI runs `biome ci`.

## Checks on pull requests

Besides the tests on every database and Node.js version, the `checks` workflow (`.github/workflows/checks.yml`) builds the pull request and `main`, and compares them:

- **The SQL.** `bench/sql-check.js` runs every mocked benchmark scenario on postgres, MySQL and SQLite, and compares the SQL, the bindings and the returned models. Any difference fails. If the pull request changes SQL on purpose, for example to fix a bug, add the `sql-change` label: the check then still shows the difference, but doesn't fail.
- **The size of the types.** `scripts/typings-bench.js --check` fails when compiling `tests/ts` takes more than 10% more types or instantiations than `tests/ts-bench-baseline.json`. If the growth is worth it, update the baseline with `npm run bench:typings -- --update`.
- **The speed.** `bench/count.js --max-change 1` counts the CPU instructions per operation of the benchmark scenarios that run on a mocked knex, and fails when one takes more than 1% more than on `main`. Instruction counts repeat, unlike times: in CI, valgrind counts them (GitHub's runners don't have the hardware counters `perf` needs), and the counts of the same code repeat within 0.2%. The SQLite scenarios and the ones that wait 1 ms per query aren't checked there, because their counts depend on threads and timers.

To run them locally, see the [benchmarks](https://github.com/abedmurrar/objection.js/tree/main/bench) README.
