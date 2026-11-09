# Changelog

Releases of `@abedmurrar/objection`, a fork of objection.js 3.1.5. The versions before 4.0 are the releases of objection.js.

## Unreleased

### Fixes

- After an `insertGraph()` or `upsertGraph()` failed on a `#ref{}` it couldn't resolve, the next graph could keep one of its `#ref{}` references as literal text instead of replacing it. The references are searched with the shared global regex `Model.propRefRegex`, and the failed search left it in the middle of a string, so the next search started there. Each string is now searched with `matchAll()`, which uses a copy of the regex.
- A `DelegateOperation` subclass that defines its own `toFindOperation()` reported having none when its delegate had none, because `hasToFindOperation()` compared the wrong method. No operation of objection's own was affected.

## 4.2.7 (2026-11-09)

### Performance

- Deletes no longer wait for promises when the model has no static `beforeDelete()` or `afterDelete()` hook: these two hooks of every delete were `async` functions, so each delete waited on two promises that had nothing to do. A query with only one where operation, like `deleteById()` or `findById()`, also no longer looks for where clauses to group, since it takes two to have two scopes. Instruction counts of the mock benchmarks: `deleteById()` −16.2%, a delete with a where −12.0%; no other scenario changed by more than run-to-run variation. On a real MySQL 8.4, `deleteById()` of a missing row took 206.0 µs instead of 216.4 µs (median of 5 alternating rounds). The SQL is the same, and hooks that exist still run, with their errors rejecting the query as before.

## 4.2.6 (2026-11-09)

### Performance

- A query no longer walks its operations to find the table it reads from, whether it has a select, and whether its where clauses need to be grouped: the summary of its operations from 4.2.5 holds these too. The kinds of an operation that come from its name are looked up once per name. `execute()` runs the phases of a query one after another instead of chaining them with about 12 functions per query. Instruction counts of the mock benchmarks against 4.2.5: an insert of 1 row −9.8%, a delete with a where −7.7%, building a query with where, orderBy and limit −5.8%, `upsertGraph()` of 20 persons with pets −4.0%, a find −2.6%. On a real MySQL 8.4, finds and deletes took 2% to 4% less time, about as much as the times vary between runs. The SQL is the same.

## 4.2.5 (2026-11-09)

### Performance

- A query walks its operations far less often. A plain find walked them 17 times while it was built and executed: once per hook phase (`onBefore1` ... `onAfter3`, `onBuild`), and once each for `isFind()`, the find operation, the eager operation, the query executor and `isInsert()`, and most of these walks found nothing. The query now keeps a summary of its operations, made by one walk and stamped with a version that changes with the operations: the hooks they have, and whether one is a write, insert, find or eager operation. An operation that is added is taken into a current summary. The hooks of an operation are found once, by comparing them with the base class, and its kind once for it and its clones. `clone()`, which every execution does, no longer creates a context, internal options and arrays that it then replaces. Instruction counts of the mock benchmarks: `findById()` −18.7%, a delete with a where −14.6%, a find −8.0%, building a query with where, orderBy and limit −9.6%, `upsertGraph()` of 20 persons with pets −6.6%. The SQL is the same.

## 4.2.4 (2026-11-09)

### Performance

- The rows of a query are written to their models directly when the model class keeps the default `fromDatabaseJson()`, `$setDatabaseJson()` and `$parseDatabaseJson()`, and its `columnNameMappers` are `snakeCaseMappers()` or none. Each row used to go through those three methods, and with `snakeCaseMappers()` it was copied into a mapped object first and then onto the model. `withGraphJoined()` built an object for each model of each row and then copied it the same way; it now writes the columns of each table to its model directly, with the properties worked out once per query. The keys, the JSON parsing and the resulting models are the same. Classes that override one of the methods, or have other column name mappers, keep the old path. The `$afterFind()` hooks are now checked with one property read per model, and no array is allocated when no model has one. Instruction counts of the mock benchmarks: `withGraphJoined()` −22.5%, `withGraphFetched()` −13.8%, 1000 rows with `snakeCaseMappers()` −22.2%, 1000 rows with two JSON attributes −1.5%.

## 4.2.3 (2026-11-09)

### Performance

- `upsertGraph()` unrelates many-to-many rows in one statement that deletes their join rows by the ids of both sides, `delete from owner_item where ownerId in (?) and itemId in (?, ?)`. MySQL and MariaDB first fetched the ids of the join rows in a separate query, and the other databases filtered the join rows with a subquery of the related table. `upsertGraph()` has just fetched these rows through the relation, as it has the rows it deletes since 4.2.2. Measured on MySQL 8.4, an `upsertGraph()` that unrelates one item takes 4.6 ms instead of 5.1 ms (median). Relations with their own `modify` or `filter`, or that don't join the id columns of the related table, keep the subquery. On MySQL, a single statement with the subquery wasn't an option: it locks the related rows, and in the stress test of 4.2.2 with a cascading foreign key, 30 of 1,200 concurrent `upsertGraph()` calls deadlocked with it, and none with the ids.

## 4.2.2 (2026-11-09)

### Bug fixes

- MySQL and MariaDB: `upsertGraph()` deleted the many-to-many rows that were missing from the graph with a subquery that joins the join table, `delete from items where id in (select items.id from items inner join owner_items ...)`. The subquery locks the join rows it reads, and the delete deadlocked with concurrent writes of the join table, also between separate `upsertGraph()` calls that ran one query at a time. The rows are now deleted by their ids only, as the patches are since 4.1.4: `upsertGraph()` has just fetched them through the relation. In a stress test of 20 concurrent `upsertGraph()` calls without a transaction, repeated 20 times on MySQL 8.4, MariaDB 10.6 and 11.4, with and without foreign keys, 62 of 9,600 calls deadlocked before and none after. `delete()` through a relation outside `upsertGraph()` keeps its relation filter.

### Performance

- MySQL and MariaDB: graph writes like `insertGraph()` and `upsertGraph()` run up to 4 queries at a time again, as on the other databases. From 4.0.0 to 4.2.1 they ran one at a time, because of the deadlocks fixed above and in 4.1.4. Measured on MySQL 8.4, an `upsertGraph()` of a person, 2 pets and 4 toys takes 14.0 ms instead of 28.2 ms without a transaction, and 6.6 ms instead of 7.5 ms in one, where the queries share one connection. Set `static concurrency = 1` on the model to keep the old behaviour. The idea of patching many-to-many rows by their ids comes from Jürg Lehni's [ditojs/objection](https://github.com/ditojs/objection) (0d4d4c71, #135).

## 4.2.1 (2026-11-03)

### Bug fixes

- SQLite: the ids that a multi-row `insert()` returns were merged into the models by position, but SQLite doesn't guarantee the order of the rows that `returning` returns, and ids that the models already had were overwritten. The rows of models with an id are now matched by that id, and the rows the database gave an id, ordered by it, are merged into the other models in their order: SQLite inserts the rows in the order of the input and gives them increasing ids. An insert of models that all have an id doesn't ask for ids.

## 4.2.0 (2026-11-03)

### What's new

- `static useAfterFindInGraphs`: with it, eager loading respects the static `afterFind()` hook of a related model class. `withGraphJoined()` calls the hook for the joined relations of the class, which it didn't at all, and the related models that the hook returns, e.g. filtered ones, are what `withGraphJoined()` and `withGraphFetched()` put in the graph. Before, `withGraphFetched()` assigned the related models before the hook ran, so an `afterFind()` that filters out models the user may not see didn't filter them in eager loading. Off by default; it will be on in 5.0. See [afterFind() with eager loading](/api/model/static-methods.html#with-eager-loading). The bug and the design are from Jürg Lehni's [ditojs/objection](https://github.com/ditojs/objection) (#1963).

## 4.1.4 (2026-11-03)

### Bug fixes

- Many-to-many `unrelate()` and patches with join table extras modified every join row between the owner and the matching related rows. Filters on join table columns, like `unrelate().where('persons_movies.role', 'extra')`, were ignored, so join rows they didn't match were deleted or patched too (#1853, #2127). The join rows are now filtered by a correlated subquery, so only the join rows that match are modified, also on MySQL and MariaDB.
  - On MySQL, filters that read the join table themselves (joins, `joinRelated()`, subqueries, raw SQL) can't be used in that subquery. The ids of the matching join rows are then fetched in a separate query first.
  - The same happens when a trigger on the join table changes a table that the subquery reads, which MySQL rejects (#2406). The statement is run again with the ids, and the join table is remembered for the next statements.
- `upsertGraph()` patches many-to-many rows by their ids, without a subquery that joins the join table (#135).
- `asFindQuery()` of a many-to-many patch or delete keeps its filters (#2266).
- A query resolved with `resolve()` in a hook doesn't patch join rows, update the instance of `$query().patch()`, or clear the owner keys of a BelongsToOne `delete()` (#2184). `resolve(0)` and `resolve(false)` count as resolved.
- `whereInComposite()` with an empty list of composite values built invalid SQL, `(a, b) in (())` (#1914).

The bugs were found by Jürg Lehni in [ditojs/objection](https://github.com/ditojs/objection), whose tests are ported. The correlated subquery follows his design; the MySQL code is this fork's own: dito fetches the ids first on every MySQL statement, which takes an extra query and modifies join rows that differ only in their other columns. The MySQL trigger case was first handled in ditojs/objection by Marcin L. See [Ported from ditojs/objection](/fork/dito.md).

## 4.1.3 (2026-11-03)

### Performance

- Queries create far fewer promises. The hooks of a query run one after another, and only wait when a hook returns a promise, instead of about 40 promises per query. A `findById()` runs 27% fewer CPU instructions in objection, a `delete()` 14%, a single-row `insert()` or find 11%. The hooks run in the same order and see the same results.

## 4.1.2 (2026-11-03)

### Performance

- MySQL: `insertGraph()` and `upsertGraph()` insert the new rows of each table in one query, as on PostgreSQL, instead of one query per row. A person with 2 pets with 2 toys each takes 3 inserts instead of 7, and the graph insert benchmark on MySQL 8.4 went from 29% slower than objection 3.1.5 to 16% faster. Rows with an id and rows without one are inserted separately, because the ids of a multi-row insert can only be computed when none of the rows has one.

## 4.1.1 (2026-11-03)

### Bug fixes

Ported from [ditojs/objection](https://github.com/ditojs/objection): fixes by Jürg Lehni, and the `$defs` support by Jérémy Lal. [Ported from ditojs/objection](/fork/dito.md) links the original commits.

- MySQL:
  - `patch()` and `delete()` with a subquery of the same table inside a where group (`where(qb => qb.whereIn('id', subquery))`) or a join clause failed with `ER_UPDATE_TABLE_USED`.
  - `delete().orderBy().limit()` warns: knex leaves the order out of MySQL deletes and keeps the limit, so the query deletes any of the matching rows. It will throw in 5.0. See [Deletes with a limit](/fork/knex.md#deletes-with-a-limit).
  - `insert().onConflict().ignore()` gave ignored models the id `0`. They now keep no id.
- `insert().onConflict().ignore()` on PostgreSQL and SQLite merged the returned rows into the models by position, so models got the values of other rows when some were ignored. The rows are matched by the conflict columns now. `insertAndFetch()` only fetches the models that have an id.
- Graph inserts and upserts:
  - With `relate`, HasMany and HasOne children whose composite id contains the foreign key were treated as relates and dropped.
  - `upsertGraph()` with cyclic references rejected, but its deletes still ran afterwards, outside the transaction.
  - When a graph write failed, the query rejected before its other running queries finished, so in a transaction they could commit rows after the rollback.
  - The models that `upsertGraph()` returns kept leaving out their unchanged props, so a later `$query().patch()` on them skipped those props.
  - `upsertGraph()` with `relate` and `noUpdate` didn't write the foreign keys of related HasMany and HasOne models.
  - `noInsert` still inserted the models below the skipped ones, as orphans. Models that a `#ref` from outside points to are still inserted.
  - `upsertGraph()` with `noUpdate`, `noDelete`, `noUnrelate` and `insertMissing` ran as an insert and failed with a `UniqueViolationError` on the existing rows.
  - BelongsToOne `$relatedQuery().insertGraph()` inserted the model but didn't relate it to the owner.
- Relations:
  - `through.modify` of many-to-many relations was lost on `bindKnex()` classes, so `unrelate()` deleted join rows that the filter protects.
  - BelongsToOne `unrelate()` ignored the relation's `modify` when the query had no where clause, and cleared the keys of owner models it didn't unrelate. It now unrelates only the owners whose related row matches, like the other relations.
- Executing a `patchAndFetch()` or `updateAndFetch()` query a second time, e.g. by awaiting it twice, wrote the row that the first run fetched back over later changes. It now throws; create a new query for each run.
- A `patch()` or `merge()` with a field expression like `'meta:color'` wrote nothing when the query was built before it ran, e.g. by `toKnexQuery()` or `clone()`.
- A `raw()` set on a JSON attribute in `$beforeInsert()` or `$beforeUpdate()` was stored as the serialized raw builder instead of its value.
- `withGraphJoined()` with a model that has no primary key merged rows or gave children the wrong owner. It throws now, pointing to `withGraphFetched()`.
- Patch validation: boolean subschemas, `not` (which rejected every patch), `required` in nullable or untyped objects, anyOf/oneOf options with only `required`, and `$defs`. The `JSONSchema` type has `$defs`, and `definitions` is deprecated.

Also fixed:

- MariaDB: same-table subqueries of updates and deletes were wrapped like on MySQL, which MariaDB doesn't need. The wrap broke correlated subqueries, e.g. a filtered BelongsToOne `unrelate()` of a self-referencing relation failed with `Unknown column`.

## 4.1.0 (2026-11-03)

### Bug fixes

- Types:
  - `modify()` on an `AnyQueryBuilder<M>`, as in modifiers that call other modifiers, returned a union of two query builders whose methods couldn't be called. It returns the query builder.
  - `$setRelated()` and `$appendRelated()` check the relation name and the related models, like `relatedQuery()`. A misspelled name, or models of another model class, is a compile error. Names the types can't check take the related model type explicitly: `$setRelated<Pet>(name, pets)`. Unknown names already threw at runtime.

## 4.0.5 (2026-11-03)

### Bug fixes

- Types:
  - `Model.knex(knex)` returns nothing and `query.knex(knex)` returns the query builder. Both were typed as returning `Knex`.
  - `Model.ValidationError` and `Model.NotFoundError` are declared.
  - `QueryBuilderOperation`, `QueryBuilderBase`, `Relation` and `RelationExpression` can be imported in TypeScript, and `clear()` takes an operation class like `clear(QueryBuilderOperation)`.
- The check for an offset on delete queries, added in 4.0.4, no longer has a measurable cost.
- Docs:
  - The raw value examples of `insert()`, `patch()` and `update()` used `'Jenni' || 'fer'`, which means `or` on MySQL. They now use `upper(?)`.
  - `outerJoin()` and `outerJoinRelated()` build a bare `outer join`, which postgres, MySQL and SQLite reject. Their docs say so, and that MySQL has no full outer joins.

## 4.0.4 (2026-11-03)

### Bug fixes

- An offset on a delete query throws `offset() can't be used with a delete query`. Deletes have no offset, and knex left it out: `delete().page(2, 10)` deleted the first 10 rows on MySQL, and `delete().offset(10)` deleted every matching row on every database. `page(0, n)` and `offset(0)` still work. See [Deletes with a limit](/fork/knex.md#deletes-with-a-limit).
- Types:
  - `$transaction()` returns the result of its callback, like `Model.transaction()`. It was typed as returning `Knex`.
  - `knexIdentifierMapping` is declared, so it can be imported in TypeScript.
  - `Model.concurrency`, `Model.cloneObjectAttributes` and `QueryBuilder.parseRelationExpression()` are declared.

## 4.0.3 (2026-11-02)

### What's new

- The documentation site has a sitemap, canonical URLs, a description and Open Graph and Twitter tags on every page, structured data on the home page, a social card image, a favicon and the date each page last changed. The pages are served without `.html`.
- The site and the guide link to this package's repository, examples and issues instead of objection.js's. The links to the v1 and v2 documentation of objection.js are gone.
- The npm package has a homepage (the documentation site), a longer description and more keywords.

## 4.0.2 (2026-11-02)

### What's new

- Every link in the README goes to the documentation site, including the badges. The README no longer links to files on GitHub.

## 4.0.1 (2026-11-02)

### What's new

- The README links to the documentation site of this package instead of to files in the repository, and no longer links to the objection.js repository. It still credits objection.js and its authors.

## 4.0.0 (2026-11-02)

### What's new

- `4.0.0` is the first stable release of the fork. It's published under npm's `latest` dist-tag, so `npm install @abedmurrar/objection` installs it; `@next` is no longer needed. See [Breaking changes](/fork/breaking-changes) for what changed since objection.js 3.1.5.
- The deprecation warning of `skipUndefined()` says it will be removed in a future major version, instead of in 4.0.

## 4.0.0-beta.11 (2026-11-02)

### What's new

- The performance page shows that the TypeScript build is as fast as the JavaScript one, and the contributing guide explains the rules that keep it that way.

## 4.0.0-beta.10 (2026-11-02)

### Breaking changes

- `Model`, `QueryBuilder`, `Validator` and `AjvValidator` are exported as the classes themselves instead of ES5 constructor functions that inherited from them. ES5-style subclasses that call `Model.call(this)` or `QueryBuilder.call(this)` throw, as does code compiled to that form by TypeScript with `target: "es5"` or by Babel 6. A `static init()` override of a `QueryBuilder`, `Validator` or `AjvValidator` subclass is now called when the class is constructed. See [Breaking changes](/fork/breaking-changes#the-exported-classes-are-real-classes)

## 4.0.0-beta.9 (2026-11-02)

### Bug fixes

- 4.0.0-beta.6 to beta.8 were up to 20% slower than the JavaScript build: building queries up to 18%, batch inserts 20%, `toJSON()` 10% and validation 8%. Two utility modules exported getters, which made every call to them about three times slower. They export plain values again, and every benchmark is back within noise of the JavaScript build. A test keeps compiled modules from exporting getters.

## 4.0.0-beta.8 (2026-11-02)

### What's new

- The README and the documentation say that the source is TypeScript, and the contributing guide explains the build.

## 4.0.0-beta.7 (2026-11-02)

### What's new

- The model (`Model`, the validators, the errors and the model graph), `transaction()` and `initialize()` are TypeScript now. With that, the whole source is TypeScript, apart from the small package entry and the generated parsers. The compiled code and its behaviour are the same.

## 4.0.0-beta.6 (2026-11-02)

### What's new

- The query builder core (`QueryBuilder`, its operation support, the graph inserts and upserts and the transformations) is TypeScript now. The compiled code and its behaviour are the same.

## 4.0.0-beta.5 (2026-11-02)

### What's new

- The relations guide no longer recommends `RelationsOf` for models whose relations lead back to them, which fails with a circularity error. It recommends `ModelInstance` instead.

## 4.0.0-beta.4 (2026-11-02)

### What's new

- The expression builders (`ref()`, `val()`, `raw()`, `fn()`, relation expressions and the join code) are TypeScript now. The compiled code and its behaviour are the same.

## 4.0.0-beta.3 (2026-11-02)

### What's new

- The fork documentation has many more examples, each with comments, the real SQL it produces and checked types, and fixes for seven mistakes in the existing pages.

## 4.0.0-beta.2 (2026-11-02)

### What's new

- The query operations (`src/queryBuilder/operations`) are TypeScript now. The compiled code and its behaviour are the same.

## 4.0.0-beta.1 (2026-11-02)

### What's new

- `src/relations` is TypeScript now. The compiled code and its behaviour are the same.

## 4.0.0-beta.0 (2026-11-02)

### Breaking changes

- package.json has an `exports` map, so only the package entry can be imported. Imports of files inside the package, which were never documented, throw `ERR_PACKAGE_PATH_NOT_EXPORTED`
- Node.js 24 or newer is required, the two LTS lines that are still maintained (24 and 26). Node.js 20 reached its end of life in April 2026.
- knex 3.3 or newer is required. Older versions compile some queries differently: `delete().limit(n)` on MySQL ignores the limit and deletes every matching row on knex 3.1, and `updateFrom()` with a raw query gets its bindings in the wrong order before knex 3.3. knex 3.2 also rejects queries that combine `delete()` with a limit on databases that don't support it, which includes `page()` and `range()` on deletes on postgres and SQLite.

### What's new

- An ES module entry: `import { Model } from '@abedmurrar/objection'` works without CommonJS interop, with its own types. It re-exports the CommonJS build, so `import` and `require()` give the same classes and objection is loaded once
- Faster queries: objection's own work for a small query takes 13% to 19% less time, `toJSON()` 44% less, validating models 55% less, and a class bound to a transaction with `bindKnex()` no longer creates and compiles a validator of its own (91% less for a validated insert in a new transaction). `withGraphJoined()` parses the joined rows 20% faster and graph inserts and upserts take 12% to 15% less time. The generated SQL and the results are the same. See `bench/README.md` in the repository
- On MySQL, `withGraphFetched()` and `fetchGraph()` run their queries 4 at a time again, like on the other databases. 4.0.0-alpha.0 ran every query of graph operations one at a time to stop the deadlocks of concurrent `upsertGraph()` updates, which only writes need. A concurrency set on the model still applies to all queries
- A documentation site at https://abedmurrar.github.io/objection.js/, with a [Fork additions](/fork/) section that covers only what the fork adds to objection.js 3.1.5.
- The source is moving to TypeScript, one part at a time, starting with `src/utils`. The compiled code and its behaviour are the same.
- MariaDB support, tested on 10.6 and 11.4: objection recognizes knex 3.3's `mariadb` client, or a `version` like `'11.4.0-MariaDB'` in the knex config with mysql2, and generates SQL that MariaDB accepts for the MySQL features (JSON field expressions, the `whereJson*` methods, `val()` and casts of JSON). The `fn` helpers of functions MariaDB doesn't have throw a clear error. See [MariaDB](/fork/mysql#mariadb)
- Add the knex methods objection didn't have: `andHaving()` (which was typed but threw), `andHavingIn()`, `andHavingNotIn()`, `andHavingNull()`, `andHavingNotNull()`, `andHavingExists()`, `andHavingNotExists()`, `andHavingBetween()` and `andHavingNotBetween()`, `comment()`, `hintComment()`, `using()` for postgres `delete ... using`, `finally()`, and `or` in join callbacks: `join.on(a, b).or.on(c, d)`
- Types: `updateFrom()`, `clearGroup()`, `clearHaving()` and `options()`, which worked but weren't typed
- `clearGroup()` and `clearHaving()` remove the operations, like `clearSelect()` and `clearWhere()`, so `has()` sees them as cleared
- The tests no longer use bluebird. The native promises and `node:timers/promises` cover what they used it for, and the test of unhandled rejections now sees the rejections of objection's own promises, which bluebird's handler never did
- No more lodash: the package shipped a copy of lodash's `cloneDeep`, which is replaced by a native clone with the same results, and the tests no longer use lodash. The package is 59 kB smaller, and `toJSON()` of models whose JSON attributes hold class instances, Maps or Sets takes 87% less time

### Bug fixes

- `orHavingIn()`, `orHavingBetween()` and `orHavingNotBetween()` added their conditions with `and`, as `havingIn()` and the others
- `onIn()` and the other `in` conditions of join callbacks with a raw column and a raw value, like `join.onIn(fn.lower(ref('name')), raw('select ...'))`, lost the parentheses around the value.

## 4.0.0-alpha.0 (2026-10-20)

### Security

- Require ajv 8.20 or newer, which fixes the advisories of ajv and its dependency fast-uri.
- Escape the keys of JSON field expressions. Keys containing `'` allowed SQL injection through `ref('col:key')`, `patch({ 'col:key': value })`, `onConflict().merge()` and the `whereJson*` methods, and keys containing `?` corrupted the bindings. Keys with `,`, `{`, `}`, `"`, whitespace or `NULL` now refer to the actual key instead of being split [#2077](https://github.com/Vincit/objection.js/issues/2077)

### Breaking changes

- knex 3.1 or newer is required. The fork is only tested with knex 3.
- On MySQL, graph operations (`insertGraph()`, `upsertGraph()`, `fetchGraph()`, ...) run one query at a time by default. Concurrent updates of `upsertGraph()` deadlocked without a transaction. Set [concurrency](/api/model/static-properties.html#static-concurrency) on the model to run queries in parallel again.
- `orWhere` (and raw `where` clauses) can no longer escape the conditions objection adds itself. `$relatedQuery('pets').where(a).orWhere(b).delete()` used to produce `owner and a or b` (or `a or b and owner` for writes) and touch the rows of other owners. The same applied to relation `filter`/`modify`, `joinTableModify`, `relate()`, `unrelate()`, `$query()`, `deleteById()`, `patchAndFetchById()`, `updateAndFetchById()` and static `relatedQuery()` subqueries. These clauses are now wrapped in parentheses. Queries without such clauses generate the same SQL as before. A `findById()` you call yourself is not grouped, so `findById(1).orWhere(...)` still means "id = 1 or ...". [#2191](https://github.com/Vincit/objection.js/issues/2191), [#1909](https://github.com/Vincit/objection.js/issues/1909)
- `for()` can only be used with queries created using the static `relatedQuery()`. Before, `Person.query().for(1).delete()` ignored `for()` and deleted every row. Write methods of `relatedQuery()` reject if `for()` is not called before them; before, `delete().for(1)` silently did nothing and `insert().for(1)` inserted rows with `null` foreign keys [#2185](https://github.com/Vincit/objection.js/issues/2185)
- JSON field expressions (`'col:key'`) and the `whereJson*` methods throw on databases other than postgres and MySQL instead of generating invalid SQL. On MySQL the generated `#>` started a comment, silently dropping the rest of the `where` clause.
- Patching a field of a `NULL` JSON column (`patch({ 'col:key': value })`) creates the object. Before, the column stayed `NULL` on postgres.
- Types: Relation expressions are checked in `withGraphFetched()`, `withGraphJoined()`, `fetchGraph()`, `$fetchGraph()`, `modifyGraph()`, `allowGraph()` and `joinRelated()` and its variants, in string and in object notation. Unknown relations give errors like `Unknown relation "toyz" at "pets"` and syntax errors like `Missing "]" in relation expression`. Expressions that aren't known at compile time (like a `string` variable) aren't checked, and neither are expressions after `castTo(Model)`
- Types: `withGraphFetched()`, `withGraphJoined()`, `fetchGraph()` and `$fetchGraph()` add the relations they load to the result type, including nested relations, aliases (`'pets as animals'`, `$relation`) and repeated calls. To-many relations are arrays and to-one relations are `| null` (or `| undefined` for relations declared as optional without `| null`). Modifiers that return the query builder add the relations they load, in `modify()` and in `$modify`. `Loaded<Person, '[pets, mom]'>` is the type of a model with relations loaded. See the [relations guide](/guide/relations.html#loaded-relations)
- Types: Named modifiers are checked against the static `modifiers` of the model when it's an object without a type annotation or a getter: in `modify('name', ...args)` (including the arguments and lists of modifiers) and in relation expressions (`'pets(onlyDogs)'`, `$modify: 'onlyDogs'`). Names added with `modifiers()` aren't known, so they aren't checked after it. See the [modifiers recipe](/recipes/modifiers.html#typescript)
- Types: The callback of `modifyGraph()` gets the query builder of the related model, also for aliases. The model can still be given explicitly: `modifyGraph<Pet>(expr, modifier)`
- Types: `withGraphFetched()` and the methods that keep the result kind keep union result types like `Person[] | Person | number` instead of turning them into one kind
- Types: Query results only have the relations the query loaded. `await Person.query()` is `ModelRow<Person>[]`, the model without its relation properties, so reading `person.pets` without loading it is a compile error. Rows can still be used where the model is expected. After modifiers that don't return the query builder, named modifiers, `insertGraph()`, `upsertGraph()` and `castTo(Model)` the result has all relations of the model as optional properties again, as before. So do models with `private` or `protected` members and models that declare a relation as required (`pets!: Pet[]`). Query builders whose type is written explicitly (`QueryBuilder<Person>`) keep their meaning. See the [relations guide](/guide/relations.html#loaded-relations)

### What's new

- JSON field expressions work on MySQL: `ref('col:a.b').castInt()` in selects, wheres, joins and orderBys, and `patch({ 'col:a.b': value })`, `update()` and `onConflict().merge()`, which use `JSON_SET()`
- The `whereJson*` methods (`whereJsonSupersetOf()`, `whereJsonSubsetOf()`, `whereJsonIsArray()`, `whereJsonIsObject()`, `whereJsonHasAny()`, `whereJsonHasAll()` and their variants) work on MySQL and find the same rows as on postgres
- `fn` has a typed helper for every MySQL 8.4 built-in function, like `fn.dateFormat()`, `fn.timestampDiff('day', a, b)`, `fn.groupConcat(expr, { orderBy, separator })` and `fn.jsonObject({ ... })`. Objects and arrays passed as JSON documents are cast to JSON, and keywords like interval units are checked. MySQL-only functions throw on other databases. See [fn](/api/objection/#fn)
- Types: `FunctionBuilder<T>` carries the type of the result of the function
- `ref()`, `val()`, `fn()` and `raw()` have expression methods, so comparisons, conditions and arithmetic don't need raw SQL: `Pet.ref('age').gte(3)`, `eq()`, `ne()`, `gt()`, `gte()`, `lt()`, `lte()`, `in()`, `notIn()`, `like()`, `between()`, `isNull()`, `isNotNull()`, `isBlank()`, `isNotBlank()`, `and()`, `or()`, `not()`, `plus()`, `minus()`, `times()` and `div()`. They can be used in selects, wheres, havings, orderBys, join callbacks and patches. In TypeScript the values are checked against the type of the column. See [Expressions](/api/objection/#expressions)
- Add `fn.case()`, `fn.exists()` and `fn.excluded()` (the value an upsert tried to insert)
- Aggregate functions have `filter(condition)`: `fn.count().filter(Pet.ref('species').eq('dog'))`. `fn.count()` without arguments is `COUNT(*)`
- Add window functions: `fn.rowNumber()`, `fn.rank()`, `fn.denseRank()`, `fn.percentRank()`, `fn.cumeDist()`, `fn.ntile()`, `fn.lag()`, `fn.lead()`, `fn.firstValue()`, `fn.lastValue()` and `fn.nthValue()`, and `over({ partitionBy, orderBy })` for them and the aggregate functions
- Add `none()`, which makes a query match no rows
- Fix subqueries in join callbacks on MySQL, like `join(Pet, (join) => join.on(Pet.ref('version'), Pet.query().max('version')))`. They threw `parentQuery.isUpdate is not a function`
- Types: `Model.ref()` only accepts the columns of the model (with an optional table or alias), `'*'` and fields of JSON columns, whose first key is checked when the column type has known keys. `ReferenceBuilder<T>` carries the type of the column, and the casts change it
- Types: `patch()`, `update()`, `*AndFetch()` and `merge()` accept field expression keys of JSON columns: `patch({ 'payload:courseName': 'Physics' })`
- Types: Relations typed as a union of a model and an array of models are recognized as relations by `ModelProps` and `ModelRelations`
- Add `whereJsonOverlaps()` and `whereJsonNotOverlaps()` for MySQL's `JSON_OVERLAPS()`
- `val()` of an object or an array is cast to `JSON` on MySQL, so it can be compared with JSON columns
- Casts (`castInt()`, `castText()`, `castBool()`...) of `ref()` and `val()` use types MySQL supports. `CAST(x AS integer)` for example is a syntax error on MySQL
- Fix the bindings of `whereIn()`, `whereNotIn()` and `onIn()` with a raw column that has bindings, like `whereIn(fn.lower(ref('name')), names)`. knex compiled the values before the column, so the column got the bindings of the values
- Batch inserts (`insert([...])`, `insertAndFetch([...])` and relation inserts) work on MySQL and SQLite. On MySQL the ids of the inserted rows are computed from the id of the first row, using `@@auto_increment_increment`. A MySQL batch where only some rows have an id is rejected before inserting. SQLite batch inserts need SQLite 3.35 or newer
- Model classes can be used in place of table names: `join(Pet, Pet.ref('ownerId'), Person.ref('id'))`, `from(Person)`, and alias objects like `innerJoin({ p: Pet }, ...)`
- `Model.ref()` works inside join callbacks. Before, it produced the source code of the model class as the table name
- Add `onJsonPathEquals()` and `orOnJsonPathEquals()` to join callbacks
- Types: Join callbacks get objection's `JoinBuilder` instead of knex's `JoinClause`, so `ref()` and `Model.ref()` can be used for every column
- Types: Custom query builders only need to declare `'~rebind'` and keep their type through every method, including `throwIfNotFound()`, `castTo()` and `runAfter()`. See the [migration guide](/release-notes/migration.html)
- Types: The type of `query()` comes from the static `QueryBuilder` property
- Types: `runAfter()` and `castTo<T>()` set the result type, which is used by `first()`, `throwIfNotFound()` and the other methods that change the result kind
- Types: `modify()` checks the arguments passed to modifier functions and accepts modifiers written for any result kind. `AnyQueryBuilder<M>` is a query builder for model `M` of any result kind
- Types: Model classes can be used as the base class of mixins
- Types: The types of relations are inferred from `relationMappings`, so relation properties don't need to be declared in the model. To-one relations are `Model | null`, to-many relations arrays, and many-to-many relations include their `extra` columns. `defineRelations()` preserves the exact mapping types, and `interface Person extends RelationsOf<typeof Person> {}` adds the relations to the instance type. See the [relations guide](/guide/relations.html#typescript)
- Types: `relatedQuery()` and `$relatedQuery()` only accept known relation names. For names that can't be checked, pass the related model type: `relatedQuery<Pet>(name)`
- Types: `$relatedQuery()` of a to-one relation can resolve to `undefined`
- Types: Relation properties typed `Model | null` are recognized as relations by `ModelRelations` and `ModelProps`
- Fix infinite recursion in `andWhereJsonNotSupersetOf()`

## 3.1.5

### What's new

- Types: Fix generic static `this` [#2533](https://github.com/Vincit/objection.js/pull/2533)
- Types: Add `fromRaw` to `FromSelector regex [#2628](https://github.com/Vincit/objection.js/issues/2628)
- Types: Fix argument types of `onConflict()` [#2635](https://github.com/Vincit/objection.js/pull/2635)
- Types: Make `trx` optional for `Model.transaction(trx, cb)` [#2694](https://github.com/Vincit/objection.js/pull/2694)

## 3.1.4

### What's new

- Fix `upsertGraph()` `$beforeUpdate()` calls on empty relates [#2605](https://github.com/Vincit/objection.js/issues/2605)
- Don't call `onError()` with internal exceptions [#2603](https://github.com/Vincit/objection.js/issues/2603)
- Remove docs and typings for nonexistent `$pick()`
- Make `$omitFromJson()` + `$omitFromDatabaseJson()` compatible with old `$omit()` syntax

## 3.1.3

### What's new

- Revert generic constructor type change [#2531](https://github.com/Vincit/objection.js/issues/2531), [#2399](https://github.com/Vincit/objection.js/pull/2399)

### What's new

- Patch Validator: Prevent recursion on inner properties [#2520](https://github.com/Vincit/objection.js/pull/2520)

## 3.1.2

### What's new

- Patch Validator: Prevent recursion on inner properties [#2520](https://github.com/Vincit/objection.js/pull/2520)

## 3.1.1

### What's new

- Only add Ajv formats if they weren't added in user-land already [#2482](https://github.com/Vincit/objection.js/pull/2482)

## 3.1.0

### What's new

- Support `$beforeUpdate()` mutations in `upsertGraph()` [#2233](https://github.com/Vincit/objection.js/issues/2233)
- Remove deprecated `$afterGet()` hook [#2477](https://github.com/Vincit/objection.js/pull/2477)
- Drop support for Node v12 [#2478](https://github.com/Vincit/objection.js/pull/2478)

## 3.0.5

### What's new

- Fixes [#2183](https://github.com/Vincit/objection.js/pull/2183)
- Fixes [#2257](https://github.com/Vincit/objection.js/pull/2257)
- Fixes [#2276](https://github.com/Vincit/objection.js/pull/2276)
- Fixes [#2453](https://github.com/Vincit/objection.js/pull/2453)
- Fixes [#2476](https://github.com/Vincit/objection.js/pull/2476)

## 3.0.4

### What's new

- Fixes [#2447](https://github.com/Vincit/objection.js/issues/2447)

## 3.0.3

### What's new

- Fixes [#1673](https://github.com/Vincit/objection.js/issues/1673)
- Fixes [#1957](https://github.com/Vincit/objection.js/issues/1957)
- Fixes [#2105](https://github.com/Vincit/objection.js/issues/2105)
- Fixes [#2132](https://github.com/Vincit/objection.js/issues/2132)
- Fixes [#2251](https://github.com/Vincit/objection.js/issues/2251)
- Fixes [#2262](https://github.com/Vincit/objection.js/issues/2262)
- Fixes [#2271](https://github.com/Vincit/objection.js/issues/2271)
- Fixes [#2277](https://github.com/Vincit/objection.js/issues/2277)
- Fixes [#2308](https://github.com/Vincit/objection.js/pull/2308)
- Fixes [#2311](https://github.com/Vincit/objection.js/issues/2311)
- Fixes [#2311](https://github.com/Vincit/objection.js/pull/2311)
- Fixes [#2311](https://github.com/Vincit/objection.js/pull/2311)
- Fixes [#2332](https://github.com/Vincit/objection.js/issues/2332)
- Fixes [#2337](https://github.com/Vincit/objection.js/issues/2337)
- Fixes [#2372](https://github.com/Vincit/objection.js/pull/2372)
- Fixes [#2379](https://github.com/Vincit/objection.js/pull/2379)
- Fixes [#2383](https://github.com/Vincit/objection.js/pull/2383)
- Fixes [#2399](https://github.com/Vincit/objection.js/pull/2399)
- Fixes [#2404](https://github.com/Vincit/objection.js/pull/2404)
- Fixes [#2405](https://github.com/Vincit/objection.js/pull/2405)
- Fixes [#2408](https://github.com/Vincit/objection.js/pull/2408)
- Fixes [#2409](https://github.com/Vincit/objection.js/pull/2409)
- Fixes [#2423](https://github.com/Vincit/objection.js/pull/2423)

## 3.0.2

### What's new

- Fixes [#1356](https://github.com/Vincit/objection.js/issues/1356)
- Fixes [#1957](https://github.com/Vincit/objection.js/issues/1957)
- Fixes [#2192](https://github.com/Vincit/objection.js/issues/2192)
- Fixes [#2247](https://github.com/Vincit/objection.js/pull/2247)
- Fixes [#2307](https://github.com/Vincit/objection.js/pull/2307)
- Fixes [#2308](https://github.com/Vincit/objection.js/pull/2308)
- Fixes [#2311](https://github.com/Vincit/objection.js/pull/2311)
- Fixes [#2323](https://github.com/Vincit/objection.js/pull/2323)
- Fixes [#2337](https://github.com/Vincit/objection.js/issues/2337)
- Fixes [#2362](https://github.com/Vincit/objection.js/pull/2362)

## 3.0.1

### What's new

- Fixes [#2123](https://github.com/Vincit/objection.js/issues/2123)
- Fixes [#2150](https://github.com/Vincit/objection.js/issues/2150)
- Fixes [#2179](https://github.com/Vincit/objection.js/pull/2179)

## 3.0.0

### What's new

- Fixes [#1986](https://github.com/Vincit/objection.js/issues/1986)
- Fixes [#1987](https://github.com/Vincit/objection.js/issues/1987)
- Fixes [#1954](https://github.com/Vincit/objection.js/issues/1954)
- Fixes [#1993](https://github.com/Vincit/objection.js/issues/1993)
- Fixes [#1688](https://github.com/Vincit/objection.js/issues/1688)
- Fixes [#1651](https://github.com/Vincit/objection.js/issues/1651)
- Fixes [#2135](https://github.com/Vincit/objection.js/issues/2135)
- Fixes [#1936](https://github.com/Vincit/objection.js/issues/1936)
- Fixes [#1905](https://github.com/Vincit/objection.js/issues/1905)
- Fixes [#1997](https://github.com/Vincit/objection.js/issues/1997)
- Fixes [#2024](https://github.com/Vincit/objection.js/issues/2024)

### Breaking changes

See the [migration guide](/release-notes/migration.md).

## 2.2.10

### What's new

- Add `modelClass` property for `ValidationError` and `NotFoundError`.

## 2.2.9

### What's new

- Add `noWait` query builder method.

## 2.2.8

### What's new

- Fixes [#1982](https://github.com/Vincit/objection.js/issues/1982)
- Fixes [#1983](https://github.com/Vincit/objection.js/issues/1983)

## 2.2.7

### What's new

- `QueryBuilder.castTo` can now be used to cast query results to any typescript type.

## 2.2.6

### What's new

- Fixes [#1964](https://github.com/Vincit/objection.js/issues/1964)

## 2.2.5

### What's new

- Fixes [#1855](https://github.com/Vincit/objection.js/issues/1855)

## 2.2.4

### What's new

- Add support for onConflict, merge and ignore knex methods.

## 2.2.2

### What's new

- [#1722](https://github.com/Vincit/objection.js/issues/1722)

## 2.2.1

### What's new

- Fixes [#1757](https://github.com/Vincit/objection.js/issues/1757)
- Fixes [#1729](https://github.com/Vincit/objection.js/issues/1729)

## 2.2.0

### What's new

- Fixes [#1770](https://github.com/Vincit/objection.js/issues/1770)
- Fixes [#1699](https://github.com/Vincit/objection.js/issues/1699)
- Fixes [#1703](https://github.com/Vincit/objection.js/issues/1703)
- Fixes [#1675](https://github.com/Vincit/objection.js/issues/1675)
- Fixes [#1708](https://github.com/Vincit/objection.js/issues/1708)
- Fixes [#1743](https://github.com/Vincit/objection.js/issues/1743)
- Fixes [#1731](https://github.com/Vincit/objection.js/issues/1731)
- Fixes [#1761](https://github.com/Vincit/objection.js/issues/1761)

## 2.1.4

### What's new

- Fixes [#1750](https://github.com/Vincit/objection.js/issues/1750)

## 2.1.3

### What's new

- Add `underscoreBetweenUppercaseLetters` option for snake case mappers. [#1676](https://github.com/Vincit/objection.js/issues/1676)

## 2.1.2

### What's new

- Fix `startTransaction` typings.

## 2.1.1

### What's new

- Fixes [#1489](https://github.com/Vincit/objection.js/issues/1489)

## 2.1.0

### What's new

- Fixes [#1638](https://github.com/Vincit/objection.js/issues/1638)
- Fixes [#1636](https://github.com/Vincit/objection.js/issues/1636)
- Fixes [#1615](https://github.com/Vincit/objection.js/issues/1615)

# Changelog

## 2.0.10

### What's new

- Fixes [#1630](https://github.com/Vincit/objection.js/issues/1630)

## 2.0.9

### What's new

- Fixes [#1606](https://github.com/Vincit/objection.js/issues/1606)

## 2.0.8

### What's new

- Fixes [#1627](https://github.com/Vincit/objection.js/issues/1627)

## 2.0.7

### What's new

- Fixes [#1607](https://github.com/Vincit/objection.js/issues/1607)

## 2.0.6

### What's new

- Fixes [#1603](https://github.com/Vincit/objection.js/issues/1603)

## 2.0.5

### What's new

- Fixes `upsertGraph` bug where composite keys were not selected correctly. See the fix [here](https://github.com/Vincit/objection.js/commit/0e58cf010348efc33e5459c055eea141f62f7561).

## 2.0.4

### What's new

- New `skipFetched` option for `fetchGraph` and `$fetchGraph`

## 2.0.3

### What's new

- Fixes [#1585](https://github.com/Vincit/objection.js/issues/1585)
- Fixes [#1361](https://github.com/Vincit/objection.js/issues/1361)
- Fixes [#1488](https://github.com/Vincit/objection.js/issues/1488)

## 2.0.0

### What's new

- Cleaner and more consistent API. A lot of methods have been renamed, removed combined and cleaned up. Most of the old methods still exist, but print a deprecation warning when first used. Some examples:

  - `eager` -> `withGraphFetched`
  - `joinEager` -> `withGraphJoined`
  - removed `eagerAlgorithm` (you must explicitly use either `withGraphFetched` or `withGraphJoined`)
  - merged `allowEager`, `allowInsert` and `allowUpsert` into one method `allowGraph`
  - `$loadRelated` -> `$fetchGraph`
  - `joinRelation` -> `joinRelated`
  - `$relatedQuery` no longer mutates the receiving model instances

- New [static hook API](/guide/hooks.html#static-query-hooks). The old instance hooks are still around.

- `relatedQuery` can now be used for more than just subqueries. See the examples [here](/guide/query-examples.html#relation-queries).

- modifiers can now take arguments and are a lot more useful. See [this recipe](https://vincit.github.io/objection.js/recipes/modifiers.html) for more info.

- Objection now uses the [db-errors](https://github.com/Vincit/db-errors) library by default to wrap the database errors.

- `insertMissing` `upsertGraph` option now works as expected with `relate: true`: items that are not found in the database are inserted.

- Brand new typings written from scratch with many improvements and finally a support for [custom query builders](/recipes/custom-query-builder.html#custom-query-builder)

- A bunch of improvements and bug fixes for `upsertGraph`, including a huge speedup in some cases due to less data fetching.

- A brand new [fn](/api/objection/#fn) helper for calling SQL functions.

- Objection now uses native promises instead of bluebird.

- Objection is now leaner as we dropped a bunch of dependencies like `bluebird` and `lodash`.

- In addition to all of this, a huge number of bugs has been squashed!

### Breaking changes

See the [migration guide](/release-notes/migration.md).

## 1.6.10

- Fixes [#1455](https://github.com/Vincit/objection.js/issues/1455)

## 1.6.9

- Revert fix for [#1089](https://github.com/Vincit/objection.js/issues/1089). It was causing more bugs than it fixed. #1089 will be addressed in 2.0.
- Typings updates

## 1.6.8

- Fix [#1287](https://github.com/Vincit/objection.js/issues/1287)

## 1.6.7

- A bunch of regression bug fixes.

## 1.6.3

- Fixes: [#1227](https://github.com/Vincit/objection.js/issues/1227)

## 1.6.2

- Add `as` method for `raw` making it possible to use `raw` expressions in `joinEager` modifiers (as long as you give names to your raw expressions using `as`).

## 1.6.1

- Fix some very rare upsertGraph edge cases.

## 1.6.0

- Add `Model.traverseAsync` and `modelInstance.$traverseAsync` methods.

- Fixes: [#842](https://github.com/Vincit/objection.js/issues/842) and [#1205](https://github.com/Vincit/objection.js/issues/1205). This bug is about subqueries "inheriting" parent query table name and alias. This bug has been around a long time and there is a small chance that people have started accidentally or on purpose use it as a feature. If you get weird reference errors from subqueries (relation not found, table not found etc.) you may need to explicitly give an alias or use `from` in your subqueries after this update. This is a borderline breaking change, but since 2.0 is still pretty far away, I wanted to get this out faster. If I'm wrong and people are heavily depending on this bug, I'll revert the change.

- Fixes: [#1215](https://github.com/Vincit/objection.js/issues/1215)
- Fixes: [#1206](https://github.com/Vincit/objection.js/issues/1206)

## 1.5.3

### What's new

- Fixes [#1204](https://github.com/Vincit/objection.js/issues/1204)

## 1.5.1

### What's new

- Relations are now loaded lazily [#1202](https://github.com/Vincit/objection.js/issues/1202)
- `relationMappings.modelClass` can now be a function that returns a model class.

## 1.5.0

### What's new

- fix [#1131](https://github.com/Vincit/objection.js/issues/1131)
- fix [#1114](https://github.com/Vincit/objection.js/issues/1114)
- fix [#1185](https://github.com/Vincit/objection.js/issues/1185)
- fix [#1109](https://github.com/Vincit/objection.js/issues/1109)
- fix [#1110](https://github.com/Vincit/objection.js/issues/1110)
- add eagerObject and eagerModifiers accessors to QueryBuilder.
- complete rewrite of `insertGraph` and `upsertGraph` code. The rewrite brought a bunch of small performance optimizations and makes future development easier. No breaking changes.
- Chaining `returning('*')` to `insertGraph` or `upsertGraph` now propagates the call to all insert, update and delete operations.
- Code using objectio can now be transpilsed to ES5. No need to add babel workarounds anymore.

## 1.4.0

### What's new

- Add `modifierNotFound` hook [#1120](https://github.com/Vincit/objection.js/issues/1120)
- fix [#1121](https://github.com/Vincit/objection.js/issues/1121)
- fix [#1126](https://github.com/Vincit/objection.js/issues/1126)

## 1.3.0

### What's new

- Use `objection.raw` instead of `knex.raw` in `Model.raw`. [#1077](https://github.com/Vincit/objection.js/issues/1077)
- Allow modifiers (namedFilters) to be used in `modifyEager` too.
- Add `underscoreBeforeDigits` option for snake case converters. [#1025](https://github.com/Vincit/objection.js/issues/1025)
- fix [#1074](https://github.com/Vincit/objection.js/issues/1074)
- Typing fixes

## 1.2.3

### What's new

- fix [#1007](https://github.com/Vincit/objection.js/issues/1007)
- fix [#1008](https://github.com/Vincit/objection.js/issues/1008)
- fix [#1047](https://github.com/Vincit/objection.js/issues/1047)

## 1.2.2

### What's new

- Improve reference cycle detection in `upsertGraph`

## 1.2.1

### What's new

- fix [#1009](https://github.com/Vincit/objection.js/issues/1009)

## 1.2.0

### What's new

- fix [#919](https://github.com/Vincit/objection.js/issues/919)
- fix [#964](https://github.com/Vincit/objection.js/issues/964)
- Add `aliasFor` method to public API
- Prevent bluebird warnings
- UPPER_SNAKE_CASE support for `snakeCaseMappers` and `knexSnakeCaseMappers`

## 1.1.10

### What's new

- Nothing! the npm release was somehow borked. This was just a rerelease of 1.1.9.

## 1.1.9

### What's new

- fix [#782](https://github.com/Vincit/objection.js/issues/782)

## 1.1.8

### What's new

- fix [#909](https://github.com/Vincit/objection.js/issues/909)

## 1.1.7

### What's new

- fix [#884](https://github.com/Vincit/objection.js/issues/884)

## 1.1.6

### What's new

- Add typings for fetchTableMetadata, tableMetadata and onbuildknex

## 1.1.5

### What's new

- Make [Model.fetchTableMetadata](#fetchtablemetadata) and [Model.tableMetadata](#tablemetadata) methods public. [#871](https://github.com/Vincit/objection.js/issues/871)
- Add [onBuildKnex](#onbuildknex) query builder hook. [#807](https://github.com/Vincit/objection.js/issues/807)

## 1.1.4

### What's new

- fix subquery bug causing incompatibility with knex 0.14.5 and sqlite3

## 1.1.3

### What's new

- fix regression in 1.1.2 (sorry about this) [#869](https://github.com/Vincit/objection.js/issues/869)

## 1.1.2

### What's new

- Add `virtuals` option for `toJSON` and `$toJson` [#866](https://github.com/Vincit/objection.js/issues/866)
- fix [#868](https://github.com/Vincit/objection.js/issues/868)

## 1.1.1

### What's new

- fix [#865](https://github.com/Vincit/objection.js/issues/865)
- fix bug where the static `Model.relatedQuery` didn't use the relation name as an alias for the table. This may break
  code if you have explicitly referenced the subquery table. [#859](https://github.com/Vincit/objection.js/issues/859)

## 1.1.0

### What's new

- Optional [object notation](#relationexpression-object-notation) for relation expressions.
- fix [#855](https://github.com/Vincit/objection.js/issues/855)
- fix [#858](https://github.com/Vincit/objection.js/issues/858)

## 1.0.1

### What's new

- Added public [Relation.joinModelClass](#relation) accessor
- Don't call `returning` on sqlite (prevents a warning message added in knex 0.14.4)
- fix [#844](https://github.com/Vincit/objection.js/issues/844)
- Small documentation updates
- Small typing fixes end updates

## 1.0.0 🎉

### What's new

- The static [`relatedQuery`](#relatedquery) method.
- New reflection methods:
  [`isFind`](#isfind),
  [`isInsert`](#isinsert),
  [`isUpdate`](#isupdate),
  [`isDelete`](#isdelete),
  [`isRelate`](#isrelate),
  [`isUnrelate`](#isunrelate),
  [`hasWheres`](#haswheres),
  [`hasSelects`](#hasselects),
  [`hasEager`](#haseager),
  [`has`](#has).
  [`clear`](#clear).
  [`columnNameToPropertyName`](#columnnametopropertyname),
  [`propertyNameToColumnName`](#propertynametocolumnname).
- `ManyToMany` extras now work consistently in queries and filters. [#760](https://github.com/Vincit/objection.js/issues/760)

### Breaking changes

- `modelInstance.$query().delete().returning(something)` now returns a single instance instead of an array. [#659](https://github.com/Vincit/objection.js/issues/659)

- Node 6.0.0 is now the minimum. Objection will not work on node < 6.0.0.

- [`ValidationError`](#validationerror) overhaul. This is a big one, so read this carefully! There are three things to check when you migrate to 1.0:

  1. The [`createValidationError`](#createvalidationerror) and [`ValidationError`](#validationerror) interfaces have changed.
     If you have overridden the `createValidationError` method in your project, or you create custom `ValidationError` instances
     you need migrate to the interfaces.
  2. The model validation errors (jsonSchema violations) have remained pretty much the same but there are couple of differences. Before, the
     keys of `error.data` were property names even when a nested object in a graph failed a validation. Now the keys for nested
     validation errors are key paths like `foo.bar[2].spam`. Another tiny difference is the order of validation errors for each key in
     `error.data`. Let's say a property `spam` failed for your model and `error.data.spam` contains an array of objects that describe
     the failures. Before, the first failed validation was the last item in the array, now it is the first item.
  3. All [`ValidationErrors`](#validationerror) now have a `type` field. Before all [`ValidationErrors`](#validationerror) but the model
     validation errors (errors like "invalid relation expression", or "cyclic model graph") had no type, and could only be identified
     based on the existence of some weird key in `error.data`. The `error.data` is now removed from those errors and the `type` should be
     used instead. The message from the data is now stored in `error.message`.

- Removed deprecated methods `whereRef`, `whereJsonField` and `whereJsonEquals`. The [`ref`](#ref) helper can be used to replace the
  `whereRef` calls. [`ref`](#ref) and [`lit`](#lit) can be used to replace the removed json methods.

- `ManyToMany` extras now work consistently in queries and filters. [#760](https://github.com/Vincit/objection.js/issues/760). This is not
  a breaking change per se, but can cause some queries to fail with a "ambiguous identifier" error because the join table is now joined
  in places where it previously wasn't. You need to explicitly specify the table for those failing columns using `Table.theColumn` syntax.

### Changes

- `isFindQuery` is renamed to [`isFind`](https://vincit.github.io/objection.js/#isfind) and deprecated.

## 0.9.4

### What's new

- Fixed [#627](https://github.com/Vincit/objection.js/issues/627)
- Fixed [#671](https://github.com/Vincit/objection.js/issues/671)
- Fixed [#672](https://github.com/Vincit/objection.js/issues/672)
- Fixed [#674](https://github.com/Vincit/objection.js/issues/674)

## 0.9.3

### What's new

- Add beforeInsert hook for relations. [#649](https://github.com/Vincit/objection.js/issues/649) [#19](https://github.com/Vincit/objection.js/issues/19)
- Add [`relatedFindQueryMutates`](#relatedfindquerymutates) and [`relatedInsertQueryMutates`](#relatedinsertquerymutates) configs as well as [`$setRelated`](#_s_setrelated) and [`$appendRelated`](#_s_appendrelated) helpers. [#599](https://github.com/Vincit/objection.js/issues/599)
- Fixed [#648](https://github.com/Vincit/objection.js/issues/648)

## 0.9.2

### What's new

- Fix regression: `from` fails with a subquery.

## 0.9.1

### What's new

- [`castTo`](https://vincit.github.io/objection.js/#castto) method for setting the model class of query result rows.
- [`onError`](https://vincit.github.io/objection.js/#onerror) `QueryBuilder` method.
- [`knexSnakeCaseMappers`](https://vincit.github.io/objection.js/#objection-knexsnakecasemappers) and [`snakeCaseMappers`](https://vincit.github.io/objection.js/#objection-snakecasemappers) for snake_case to camelCase conversions.

## 0.9.0

### What's new

- Relations can now be defined using keys inside JSON columns. See the examples [here](https://vincit.github.io/objection.js/#relationmappings).
- [`lit`](https://vincit.github.io/objection.js/#lit) helper function [#275](https://github.com/Vincit/objection.js/issues/275)
- Fixes for [`upsertGraph`](https://vincit.github.io/objection.js/#upsertgraph) when using composite keys. [#517](https://github.com/Vincit/objection.js/issues/517)
- Added `noDelete`, `noUpdate`, `noInsert`, `noRelate` and `noUnrelate` options for `upsertGraph`. See [UpsertGraphOptions docs](#upsertgraphoptions) for more info.
- `insertGraph` now accepts an options object just like `upsertGraph`. `relate` option can be used instead of `#dbRef`. [#586](https://github.com/Vincit/objection.js/issues/586)

### Breaking changes

- Instance update/patch with `returning` now return a single object instead of an array. [#423](https://github.com/Vincit/objection.js/issues/423)

- Because of the support for JSON relations [the `Relation` class](https://vincit.github.io/objection.js/#relation)
  has changed a bit.

## 0.8.8

### What's new

- Typing updates: [#489](https://github.com/Vincit/objection.js/issues/489) [#487](https://github.com/Vincit/objection.js/issues/487)
- Improve `resultSize` method. [#213](https://github.com/Vincit/objection.js/issues/213)
- Avoid unnecessary updates in upsertGraph [#480](https://github.com/Vincit/objection.js/issues/480)

## 0.8.7

### What's new

- `throwIfNotFound` now also throws when update or delete doesn't change any rows.
- [`mixin`](#mixin) and [`compose`](#compose) helpers for applying multiple plugins. [#475](https://github.com/Vincit/objection.js/issues/475) [#473](https://github.com/Vincit/objection.js/issues/473)
- Typing updates [#474](https://github.com/Vincit/objection.js/issues/474) [#479](https://github.com/Vincit/objection.js/issues/479)
- `upsertGraph` now validates patched models correctly. [#477](https://github.com/Vincit/objection.js/issues/477)

## 0.8.6

### What's new

- Finally: the first version of [`upsertGraph`](#graph-upserts) method! Please open issues about bugs, WTFs and missing features.
- Strip readonly virtual properties in fromJson & friends [#432](https://github.com/Vincit/objection.js/issues/432)
- Fixed [#439](https://github.com/Vincit/objection.js/issues/439)

## 0.8.5

### What's new

- Add [`Model.useLimitInFirst`](https://vincit.github.io/objection.js/#uselimitinfirst) configuration flag.

## 0.8.4

### What's new

- New shorthand methods [`joinEager`](https://vincit.github.io/objection.js/#joineager), [`naiveEager`](https://vincit.github.io/objection.js/#naiveeager),
  [`mergeJoinEager`](https://vincit.github.io/objection.js/#mergejoineager) and [`mergeNaiveEager`](https://vincit.github.io/objection.js/#mergenaiveeager).
- New shorthand method [`findOne`](https://vincit.github.io/objection.js/#findone)
- New reflection method [`isFindQuery`](https://vincit.github.io/objection.js/#isfind)
- ManyToMany extra properties can now be updated [#413](https://github.com/Vincit/objection.js/issues/413)

## 0.8.3

### What's new

- [`NaiveEagerAlogrithm`](https://vincit.github.io/objection.js/#eager)
- [Aliases in relation expressions](https://vincit.github.io/objection.js/#relationexpression) [#402](https://github.com/Vincit/objection.js/issues/402)
- New lazily evaluated `raw` function. [#275](https://github.com/Vincit/objection.js/issues/275)

## 0.8.2

### What's new

- [`Model.namedFilters`](https://vincit.github.io/objection.js/#namedfilters) object for defining shared filters that can be used by name in eager expressions.
- Full support for views and table aliases in eager, join, joinRelation etc. [#181](https://github.com/Vincit/objection.js/issues/181)
- Fix `bindTransaction` bug with `ManyToManyRelation` junction tables [#395](https://github.com/Vincit/objection.js/issues/395)

## 0.8.1

### What's new

- [`throwIfNotFound`](https://vincit.github.io/objection.js/#throwifnotfound) method for making empty query results throw an exception.
- fix error when passing model instance to a `where` method. [#387](https://github.com/Vincit/objection.js/issues/387)

## 0.8.0

### What's new

- All query methods now call `Model.query` to create a `QueryBuilder` instance [#346](https://github.com/Vincit/objection.js/issues/346)
- Objection is no longer transpiled. One of the implications is that you can use a github
  link in package.json to test experimental versions.
- `count` can now be called without arguments [#364](https://github.com/Vincit/objection.js/issues/364)
- A new [`getRelations`](#getrelations) method for plugin development and other reflection greatness.

### Breaking changes

> Old model definition

```js
function Person() {
  Model.apply(this, arguments);
}

Model.extend(Person);

Person.tableName = 'Person';

Person.prototype.fullName = function () {
  return this.firstName + ' ' + this.lastName;
};

// More static and prototype methods.
```

> Easiest way to migrate to `class` and `extends` keywords

```js
class Person extends Model {}

Person.tableName = 'Person';

Person.prototype.fullName = function () {
  return this.firstName + ' ' + this.lastName;
};

// More static and prototype methods.
```

- Support for node versions below 4.0.0 has been removed. With it the support for legacy class inheritance using `Model.extend` method
  has also been removed. This means that you need to change your model definitions to use the `class` and `extends` keywords.
  To achieve this with the minimum amount of changes you can simply swap the constructor function and `Model.extend` to
  a class definition. You can still define all static and prototype methods and properties the old way. See the example on the right -->

  Note that this also affects Babel transpilation. You cannot (or need to) use `babel-plugin-transform-es2015-classes` anymore.
  See the [ESNext example project](https://github.com/Vincit/objection.js/tree/0.8.0/examples/express-es7) as an example of
  how to setup babel.

- The default value of [`pickJsonSchemaProperties`](#pickjsonschemaproperties) was changed to `false`. Before, all properties that
  were not listed in `jsonSchema` were removed before `insert`, `patch` or `update` (if `jsonSchma` was defined). Starting from
  this version you need to explicitly set the value to `true`. You may have been used this feature by accident.
  If you have weird problems after the update, try setting `objection.Model.pickJsonSchemaProperties = true;` to see
  if it helps.

- [`relate`](#pickjsonschemaproperties) and [`unrelate`](#pickjsonschemaproperties) methods now return the result of the
  underlying query (`patch` in case of `HasManyRelation`, `HasOneRelation`, and `BelongsToOneRelation`. `insert` otherwise).
  Before the method input was always returned.

- `Model.RelatedQueryBuilder` is removed. `Model.QueryBuilder` is now used to create all query builders for the model.
  This only affects you if you have defined custom query builders.

## 0.7.12

### What's new

- fix [#345](https://github.com/Vincit/objection.js/issues/345)

## 0.7.11

### What's new

- fix [#339](https://github.com/Vincit/objection.js/issues/339)
- fix [#341](https://github.com/Vincit/objection.js/issues/341)

## 0.7.10

### What's new

- fix bugs that prevented using `$relatedQuery` and `eager` together with `JoinEagerAlgorithm`
- typing updates

## 0.7.9

### What's new

- [`joinRelation`](https://vincit.github.io/objection.js/#joinrelation) now accepts [`RelationExpressions`](https://vincit.github.io/objection.js/#relationexpression) and can join multiple and nested relations.

## 0.7.6

### What's new

- `range` and `page` methods now use a window function and only generate one query on postgresql [#62](https://github.com/Vincit/objection.js/issues/62)
- fix MSSQL 2100 parameter limit in eager queries [#311](https://github.com/Vincit/objection.js/issues/311)

## 0.7.5

### What's new

- fix [#327](https://github.com/Vincit/objection.js/issues/327)
- fix [#256](https://github.com/Vincit/objection.js/issues/256)

## 0.7.4

### What's new

- automatically select columns needed for relations [#309](https://github.com/Vincit/objection.js/issues/309)
- fix an issue where `$formatJson` was called inside `insertGraph` [#326](https://github.com/Vincit/objection.js/issues/326)

## 0.7.3

### What's new

- fix [#325](https://github.com/Vincit/objection.js/issues/325)
- fix an issue where `select` had to be used in addition to `distinct` in some cases

## 0.7.2

### What's new

- `HasOneThroughRelation` relation type.

## 0.7.1

### What's new

- fix `JoinEagerAlgorithm` NPE bug

## 0.7.0

### What's new

- `jsonSchema` without `properties` now works. [#205](https://github.com/Vincit/objection.js/issues/205)
- `relationMappings` can now be a function. [#227](https://github.com/Vincit/objection.js/issues/227)
- many to many extras can now be aliased. [#223](https://github.com/Vincit/objection.js/issues/223)
- zero values are now allowed in relation columns. [#228](https://github.com/Vincit/objection.js/issues/228)
- active transaction can now be accessed in `$before/$after` hooks through `queryContext.transaction` property.
- Validation can now be easily modified through a new [`Validator`](#validator) interface. [#241](https://github.com/Vincit/objection.js/issues/241) [#199](https://github.com/Vincit/objection.js/issues/199)
- fix a `JoinEager` problem where an empty result for a relation caused the following relations to be empty. [#292](https://github.com/Vincit/objection.js/issues/292)
- `ref(fieldExpression)` syntax to reduce need for knex.raw and updating single attribute inside JSON column. [#270](https://github.com/Vincit/objection.js/issues/270)
- [mergeEager](https://vincit.github.io/objection.js/#mergeeager) method.

### Breaking changes

- `$relatedQuery` now returns a single model instead of an array for belongsToOne and hasOne relations. [#155](https://github.com/Vincit/objection.js/issues/155)
- identifier of a model can now be updated. Be careful with this one! Before if you forgot a wrong id in an `update`/`patch` operation, it would simply get ignored. Now the id is also updated just like any other column [#100](https://github.com/Vincit/objection.js/issues/100)
- `Table.*` is now selected by default in all queries instead of `*`. This will break some join queries that don't have an explicit select clause. [#161](https://github.com/Vincit/objection.js/issues/161)
- `ValidationError.data` is now an object including, for each key, a list of errors with context info. [#283](https://github.com/Vincit/objection.js/issues/283)

## 0.6.2

### What's new

- `relationMappings` can now be a function [#227](https://github.com/Vincit/objection.js/issues/227)

## 0.6.1

### What's new

- fix bug [#205](https://github.com/Vincit/objection.js/issues/205)

## 0.6.0

### What's new

- Eager loading can now be done using joins and zero extra queries. See [`eagerAlgorithm`](#eageralgorithm), [`defaultEagerAlgorithm`](#defaulteageralgorithm) and [`eager`](#eager) for more info.
- `#ref` in graph inserts can now contain extra properties for many-to-many relations [#156](https://github.com/Vincit/objection.js/issues/156)
- `#dbRef` can now be used to refer to existing rows from a `insertWithRelated` graph.
- [`modelPaths`](#modelpaths) attribute for cleaner way to point to models in relationMappings.
- [`pickJsonSchemaProperties`](#pickjsonschemaproperties) config parameter [#110](https://github.com/Vincit/objection.js/issues/110)
- [`insertGraphAndFetch`](#insertgraphandfetch) with `insertWithRelatedAndFetch` alias. [#172](https://github.com/Vincit/objection.js/issues/172)
- Added [`$beforeDelete`](#_s_beforedelete) and [`$afterDelete`](#_s_afterdelete) hooks [#112](https://github.com/Vincit/objection.js/issues/112)
- Old values can now be accessed from `$beforeUpdate`, `$afterUpdate`, `$beforeValidate` and `$afterValidate` hooks [#185](https://github.com/Vincit/objection.js/issues/185)
- Support length property [#168](https://github.com/Vincit/objection.js/issues/168)
- Make sure operations are executed in the order they are called [#180](https://github.com/Vincit/objection.js/issues/180)
- Fetch nothing if the `where` clauses hit no rows in `update/patchAndFetchById` methods [#189](https://github.com/Vincit/objection.js/issues/189)
- Lots of performance tweaks.
- `$loadRelated` and `loadRelated` now return a `QueryBuilder`.

### Breaking changes

- Undefined values as query method arguments now throw an exception. Before they were just silently ignored
  and for example `delete().where('id', undefined)` caused the entire table to be deleted. [skipUndefined](https://vincit.github.io/objection.js/#skipundefined)
  method can be called for a query builder to handle the undefined values the old way.

- Deprecated method `dumpSql` is now removed.

- `$loadRelated` and `loadRelated` now return a `QueryBuilder`. This may break your code is some rare cases
  where you have called a non-standard promise method like `reflect` for the return value of these functions.

## 0.5.5

### What's new

- [Virtual attributes](#virtualattributes)

## 0.5.4

### What's new

- bugfix: insertWithRelated now works with `additionalProperties = false` in `jsonSchema`
- Add updateAndFetch and patchAndFetch methods for `$query`
- bugfix: afterGet was not called for nested models in eager query
- Use ajv instad of tv4 for json schema validation

## 0.5.3

### What's new

- ES6 promise compatibility fixes.

## 0.5.1

### What's new

- [\$afterGet](#afterget) hook.

## 0.5.0

### What's new

- [joinRelation](#joinrelation) family of query builder methods.
- `HasOneRelation` for creating inverse one-to-one relations.
- Relations have been renamed `OneToOneRelation` --> `BelongsToOneRelation`, `OneToManyRelation` --> `HasManyRelation`.
  The old names work, but have been deprecated.
- [withSchema](#withschema) now works as expected and sets the schema of all queries executed by the query builder the
  method is called for.
- [filterEager](#filtereager) method for better eager query filtering.
- [extra properties](#relationmappings) feature for selecting/inserting columns from/to the join table in many-to-many relations.
- Eager query recursion depth can be controlled like so: `parent.^5`.

## 0.4.0

### What's new

- Query context feature. See [#51](https://github.com/Vincit/objection.js/issues/51) and [these docs](#context) for more info.
- Composite key support.
- [findById](#findbyid), [deleteById](#deletebyid), [whereComposite](#wherecomposite) and
  [whereInComposite](#whereincomposite) query builder methods.

### Breaking changes

There shouldn't be any major breaking changes. We moved from ES5 to ES7 + babel in this version so there are big changes
in the codebase. If something comes up, please open an issue.

There are a few known corner cases that may break:

- You can now define a model for the join table of `ManyToMany` relations in `relationMappings`. This is optional,
  but may be needed if you already have a model for a `ManyToMany` relation _and_ you use `snake_case`
  to `camelCase` conversion for the column names. See the documentation on the [through](#relationthrough)
  property of [relationMappings](#relationmappings).

- The repo no longer contains the actual built javascript. Only the ES7 code that is transpiled when the code is
  published to npm. Therefore you can no longer specify a git hash to package.json to use for example the
  HEAD version. We will start to publish alpha and RC versions to npm when something new and experimental
  is added to the library.

## 0.3.3

### What's new

- fix regression: QueryBuilder.from is broken.

## 0.3.2

### What's new

- Improved relation expression whitespace handling.

## 0.3.1

### What's new

- `whereJson*` methods can now be used inside functions given to `where` methods.
- Added multiple missing knex methods to `QueryBuilder`.

## 0.3.0

### What's new

- [insertWithRelated](https://vincit.github.io/objection.js/QueryBuilder.html#insertWithRelated) method for
  inserting model trees
- [insertAndFetch](https://vincit.github.io/objection.js/QueryBuilder.html#insertAndFetch),
  [updateAndFetchById](https://vincit.github.io/objection.js/QueryBuilder.html#updateAndFetchById) and
  [patchAndFetchById](https://vincit.github.io/objection.js/QueryBuilder.html#patchAndFetchById) helper methods
- Filters for [eager expressions](#eager-queries)
- [New alternative way to use transactions](#transaction-object)
- Many performance updates related to cloning, serializing and deserializing model trees.

### Breaking changes

- QueryBuilder methods `update`, `patch` and `delete` now return the number of affected rows.
  The new methods `updateAndFetchById` and `patchAndFetchById` may help with the migration
- `modelInstance.$query()` instance method now returns a single model instead of an array
- Removed `Model.generateId()` method. `$beforeInsert` can be used instead

## 0.2.8

### What's new

- ES6 inheritance support
- generator function support for transactions
- traverse,pick and omit methods for Model and QueryBuilder
- bugfix: issue #38

## 0.2.7

### What's new

- bugfix: fix #37 also for `$query()`.
- Significant `toJson`/`fromJson` performance boost.

## 0.2.6

### What's new

- bugfix: fix regression bug that broke dumpSql.

## 0.2.5

### What's new

- bugfix: fix regression bug that prevented values assigned to `this` in `$before` callbacks from getting into
  the actual database query

## 0.2.4

### What's new

- bugfix: many-to-many relations didn't work correctly with a snake_case to camelCase conversion
  in the related model class.

## 0.2.3

### What's new

- Promise constructor is now exposed through `require('objection').Promise`.

## 0.2.2

### What's new

- $beforeUpdate, $afterUpdate, \$beforeInsert etc. are now asynchronous and you can return promises from them.
- Added `Model.fn()` shortcut to `knex.fn`.
- Added missing `asCallback` and `nodeify` methods for `QueryBuilder`.

## 0.2.1

### What's new

- bugfix: Chaining `insert` with `returning` now returns all listed columns.

## 0.2.0

### What's new

- New name `objection.js`.
- `$beforeInsert`, `$afterInsert`, `$beforeUpdate` and `$afterUpdate` hooks for `Model`.
- Postgres jsonb query methods: `whereJsonEquals`, `whereJsonSupersetOf`, `whereJsonSubsetOf` and friends.
- `whereRef` query method.
- Expose `knex.raw()` through `Model.raw()`.
- Expose `knex.client.formatter()` through `Model.formatter()`.
- `QueryBuilder` can be used to make sub queries just like knex's `QueryBuilder`.
- Possibility to use a custom `QueryBuilder` subclass by overriding `Model.QueryBuilder`.
- Filter queries/objects for relations.
- A pile of bug fixes.

### Breaking changes

- Project was renamed to objection.js. Migrate simply by replacing `moron` with `objection`.

## 0.1.0

First release.
