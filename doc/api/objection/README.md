---
sidebar: auto
---

# `module` objection

```js
const objection = require('objection');
const { Model, ref } = require('objection');
```

The objection module is what you get when you import objection. It has a bunch of properties that are listed below. `require('objection')` and `import { Model } from 'objection'` give the same classes. Files inside the package can't be imported. See [Only the package entry can be imported](/fork/breaking-changes.html#only-the-package-entry-can-be-imported).

## Model

```js
const { Model } = require('objection');
```

[The model class](/api/model/)

## QueryBuilder

```js
const { QueryBuilder } = require('objection');
```

[The query builder class](/api/query-builder/). Extend it to create a [custom query builder](/recipes/custom-query-builder.html). In TypeScript, a custom query builder also needs a `'~rebind'` declaration. See [Custom query builders need one declaration](/fork/typescript.html#custom-query-builders-need-one-declaration).

## QueryBuilderBase

```js
const { QueryBuilderBase } = require('objection');
```

The base class of [QueryBuilder](/api/query-builder/).

## QueryBuilderOperation

```js
const { QueryBuilderOperation } = require('objection');
```

The base class of the operations a query is made of. Every operation matches it, so `query.clear(QueryBuilderOperation)` removes all operations of the query.

##### Examples

[has()](/api/query-builder/other-methods.html#has) and [clear()](/api/query-builder/other-methods.html#clear) find operations by name, by a regular expression or by class:

```js
const { QueryBuilderOperation } = require('objection');

const query = Person.query().where('age', '>', 20).orderBy('lastName');

query.has('where'); // true
query.has(/order/); // true
query.has(QueryBuilderOperation); // true, the query has operations

// select `persons`.* from `persons` where `age` > 20
query.clear('orderBy');
```

## Relation

```js
const {
  Relation,
  BelongsToOneRelation,
  HasOneRelation,
  HasManyRelation,
  ManyToManyRelation,
  HasOneThroughRelation,
} = require('objection');
```

The [relation](/api/types/#class-relation) classes. They are the same classes as `Model.BelongsToOneRelation`, `Model.HasOneRelation` and so on, which are used as the `relation` of a [RelationMapping](/api/types/#type-relationmapping). `Relation` is the base class of the others.

## RelationExpression

```js
const { RelationExpression } = require('objection');
```

The class of parsed [relation expressions](/api/types/#type-relationexpression). `RelationExpression.create(expr)` parses a string or an object expression. The query builder methods take strings and objects, so you don't need it to pass expressions to them.

##### Examples

```js
const { RelationExpression } = require('objection');

const expr = RelationExpression.create('[pets, movies.actors]');

// Is an expression inside another one?
expr.isSubExpression('movies.actors'); // true
expr.isSubExpression('[pets, movies]'); // true
expr.isSubExpression('pets.owner'); // false

// Merge two expressions.
RelationExpression.create('pets').merge('movies.actors').toString(); // '[pets, movies.actors]'

// The relations a graph of models has.
const graph = Person.fromJson({ firstName: 'Jennifer', pets: [{ name: 'Fluffy' }], movies: [{ name: 'Mother!', actors: [] }] });
RelationExpression.fromModelGraph(graph).toString(); // '[pets, movies.actors]'
```

To limit the relations that a query loads or a graph inserts, use [allowGraph()](/api/query-builder/eager-methods.html#allowgraph) instead of checking expressions yourself.

## defineRelations

```js
const { defineRelations } = require('objection');
```

Returns the relation mappings it's given, unchanged. It only exists for TypeScript: it keeps the literal names of `extra` columns, so that the relation types inferred from `relationMappings` include them. It takes an object or a function that returns one. See [Relations inferred from `relationMappings`](/fork/typescript.html#relations-inferred-from-relationmappings).

##### Examples

```ts
import { Model, defineRelations } from 'objection';

class Person extends Model {
  static tableName = 'persons';

  static relationMappings = defineRelations(() => ({
    movies: {
      relation: Model.ManyToManyRelation,
      modelClass: Movie,
      join: {
        from: 'persons.id',
        through: {
          from: 'persons_movies.personId',
          to: 'persons_movies.movieId',
          extra: ['role'],
        },
        to: 'movies.id',
      },
    },
  }));
}
```

## initialize

```js
const { initialize } = require('objection');
```

For some queries objection needs to perform asynchronous operations in preparation, like fetch table metadata from the db. Objection does these preparations on-demand the first time such query is executed. However, some methods like `toKnexQuery` need these preparations to have been made so that the query can be built synchronously. In these cases you can use `initialize` to "warm up" the models and do all needed async preparations needed. You only need to call this function once if you choose to use it.

Calling this function is completely optional. If some method requires this to have been called, they will throw a clear error message asking you to do so. These cases are extremely rare, but this function is here for those cases.

You can also call this function if you want to be in control of when these async preparation operations get executed. It can be helpful for example in tests.

##### Examples

```js
const { initialize } = require('objection');

await initialize(knex, [Person, Movie, Pet, SomeOtherModelClass]);
```

If knex has been installed for the `Model` globally, you can omit the first argument.

```js
const { initialize } = require('objection');

await initialize([Person, Movie, Pet, SomeOtherModelClass]);
```

## transaction

```js
const { transaction } = require('objection');
```

[The transaction function](/guide/transactions.html). It runs a callback in a transaction, and commits when the callback's promise resolves, or rolls back when it rejects or throws.

##### Examples

Pass model classes to get copies of them bound to the transaction. Every query of the bound classes runs in the transaction:

```js
const { transaction } = require('objection');

const jennifer = await transaction(Person, Pet, async (Person, Pet) => {
  const jennifer = await Person.query().insert({ firstName: 'Jennifer', lastName: 'Lawrence' });
  await Pet.query().insert({ name: 'Fluffy', ownerId: jennifer.id });

  return jennifer;
});
```

Or pass a knex instance, and pass the transaction to each query:

```js
try {
  await transaction(Person.knex(), async (trx) => {
    await Person.query(trx).insert({ firstName: 'Sylvester' });
    throw new Error('Something went wrong');
  });
} catch (err) {
  // The insert was rolled back.
}
```

`transaction.start()` starts a transaction without a callback. It takes a model class or a knex instance. You then commit or roll back yourself:

```js
const trx = await transaction.start(Person);

try {
  await Person.query(trx).insert({ firstName: 'Arnold' });
  await trx.commit();
} catch (err) {
  await trx.rollback();
  throw err;
}
```

## ref

```js
const { ref } = require('objection');
```

Factory function that returns a [ReferenceBuilder](/api/types/#class-referencebuilder) instance, that makes it easier to refer to tables, columns, json attributes etc. [ReferenceBuilder](/api/types/#class-referencebuilder) can also be used to type cast and alias the references.

See [FieldExpression](/api/types/#type-fieldexpression) for more information about how to refer to json fields. JSON field expressions work on postgres and [MySQL](/fork/mysql.html#json-field-expressions), and throw an error on other databases. The keys of the path are escaped.

`Model.ref()` refers to a column of the model and qualifies it with the model's table, or the alias of the table in the query. In TypeScript the column must be a property of the model: `Person.ref('firstName')`, `Person.ref('p.firstName')`, `Person.ref('address:street')` or `Person.ref('*')`. Pass the expression as a type argument for columns the model doesn't declare: `Person.ref<'legacy_column'>('legacy_column')`.

##### Examples

```js
const { ref } = require('objection');

await Model.query()
  .select([
    'id',
    ref('Model.jsonColumn:details.name')
      .castText()
      .as('name'),
    ref('Model.jsonColumn:details.age')
      .castInt()
      .as('age')
  ])
  .join(
    'OtherModel',
    ref('Model.jsonColumn:details.name').castText(),
    '=',
    ref('OtherModel.name')
  )
  .where('age', '>', ref('OtherModel.ageLimit'));
```

A string on the right side of `where()` is a value. Use `ref()` to compare two columns, or to set a column to another column:

```js
// select `firstName` from `persons` where `updatedAt` > `createdAt`
await Person.query().select('firstName').where('updatedAt', '>', ref('createdAt'));

// update `persons` set `nickname` = `firstName` where `nickname` is null
await Person.query().patch({ nickname: ref('firstName') }).whereNull('nickname');
```

`Model.ref()` follows the alias of the table, so the same code works with and without `alias()`:

```js
// select `p`.`id`, `p`.`firstName`, `pets`.`name` as `petName`
// from `persons` as `p` inner join `pets` on `pets`.`ownerId` = `p`.`id`
await Person.query()
  .alias('p')
  .joinRelated('pets')
  .select(Person.ref('id'), Person.ref('firstName'), Pet.ref('name').as('petName'));
```

`withGraphJoined` and `joinRelated` methods also use `:` as a separator which can lead to ambiquous queries when combined with json references. For example:

```
jsonColumn:details.name
```

Can mean two things:

1. column `name` of the relation `jsonColumn.details`
2. field `name` of the `details` object inside `jsonColumn` column

When used with `withGraphJoined` and `joinRelated` you can use the `from` method of the `ReferenceBuilder` to specify the table:

```js
await Person.query()
  .withGraphJoined('children.children')
  .where(ref('jsonColumn:details.name').from('children:children'), 'Jennifer');
```

## raw

```js
const { raw } = require('objection');
```

Factory function that returns a [RawBuilder](/api/types/#class-rawbuilder) instance. [RawBuilder](/api/types/#class-rawbuilder) is a wrapper for knex raw method that doesn't depend on knex. Instances of [RawBuilder](/api/types/#class-rawbuilder) are converted to knex raw instances lazily when the query is executed.

Also see [the raw query recipe](/recipes/raw-queries.html).

##### Examples

When using raw SQL segments in queries, it's a good idea to use placeholders instead of adding user input directly to the SQL to avoid injection errors. Placeholders are sent to the database engine which then takes care of interpolating the SQL safely.

You can use `??` as a placeholder for identifiers (column names, aliases etc.) and `?` for values.

```js
const { raw } = require('objection');

const result = await Person.query()
  .select(raw('coalesce(sum(??), 0) as ??', ['age', 'ageSum']))
  .where('age', '<', raw('? + ?', [50, 25]));

console.log(result[0].ageSum);
```

You can use `raw` in insert and update queries too:

```js
await Person.query().patch({
  age: raw('age + ?', 10)
});
```

You can also use named placeholders. `:someName:` for identifiers (column names, aliases etc.) and `:someName` for values.

```js
await Person.query()
  .select(
    raw('coalesce(sum(:sumColumn:), 0) as :alias:', {
      sumColumn: 'age',
      alias: 'ageSum'
    })
  )
  .where(
    'age',
    '<',
    raw(':value1 + :value2', {
      value1: 50,
      value2: 25
    })
  );
```

You can nest `ref`, `raw`, `val` and query builders (both knex and objection) in `raw` calls

```js
const { val } = require('objection')

await Person
  .query()
  .select(raw('coalesce(:sumQuery, 0) as :alias:', {
    sumQuery: Person.query().sum('age'),
    alias: 'ageSum'
  }))
  .where('age', '<', raw(':value1 + :value2', {
    value1: val(50),
    value2: knex.raw('25')
  }));
```

## val

```js
const { val } = require('objection');
```

Factory function that returns a [ValueBuilder](/api/types/#class-valuebuilder) instance. [ValueBuilder](/api/types/#class-valuebuilder) helps build values of different types.

##### Examples

```js
const { val, ref } = require('objection');

// Compare json objects
await Model.query().where(
  ref('Model.jsonColumn:details'),
  '=',
  val({ name: 'Jennifer', age: 29 })
);

// Insert an array (postgres).
await Model.query().insert({
  numbers: val([1, 2, 3])
    .asArray()
    .castTo('real[]')
});
```

Select a constant, for example to tell the rows of a union apart:

```js
// select `id`, `firstName` as `name`, 'person' as `type` from `persons`
// union all select `id`, `name`, 'pet' as `type` from `pets`
const rows = await Person.query()
  .select('id', 'firstName as name', val('person').as('type'))
  .unionAll(Pet.query().select('id', 'name', val('pet').as('type')));
```

## fn

```js
const { fn } = require('objection');
```

Factory function that returns a [FunctionBuilder](/api/types/#class-functionbuilder) instance. `fn` helps calling SQL functions. The signature is:

```js
const functionBuilder = fn(functionName, ...args);
```

For example:

```js
fn('coalesce', ref('age'), 0);
```

The `fn` function also has shortcuts for most common functions:

```js
fn.now();
fn.now(precision);
fn.coalesce(...args);
fn.concat(...args);
fn.sum(...args);
fn.avg(...args);
fn.min(...args);
fn.max(...args);
fn.count(...args);
fn.upper(...args);
fn.lower(...args);
```

All arguments are interpreted as values by default. Use `ref` to refer to columns. You can also pass `raw` instances, other `fn` instances, `QueryBuilders` knex builders, knex raw and anything else just like to any other objection method.

##### MySQL functions

`fn` has a [helper for every MySQL 8.4 built-in function](/fork/mysql.html#fn-helpers-for-mysql-functions), named in camel case: `fn.dateFormat()` calls `DATE_FORMAT()`, `fn.jsonArrayAgg()` calls `JSON_ARRAYAGG()` and so on. In TypeScript the helpers check the number of arguments and type the result, which `select(fn.x().as('alias'))` will use.

```js
const { fn, ref } = require('objection');

await Event.query()
  .select(
    fn.dateFormat(Event.ref('startsAt'), '%Y-%m').as('month'),
    fn.groupConcat(Event.ref('name'), { orderBy: [Event.ref('name'), 'desc'], separator: ', ' }).as('names'),
    fn.jsonArrayAgg(Event.ref('id')).as('ids'),
  )
  .where(fn.timestampDiff('day', Event.ref('createdAt'), fn.now()), '<', 30)
  .whereNot(fn.jsonOverlaps(Event.ref('tags'), ['hidden', 'draft']), 1)
  .groupBy('month');
```

- Objects and arrays passed as JSON documents (`fn.jsonContains()`, `fn.jsonSet()`, `fn.jsonObject()`...) are cast to JSON. `fn.jsonObject({ id: ref('id'), name: ref('name') })` builds `JSON_OBJECT('id', id, 'name', name)`.
- Functions with keywords in their syntax take the keyword as an argument, which is checked against the keywords MySQL accepts: `fn.dateAdd(date, 7, 'day')`, `fn.dateSub()`, `fn.addDate()`, `fn.subDate()`, `fn.timestampAdd('week', 2, date)`, `fn.timestampDiff('day', from, to)`, `fn.extract('year_month', date)`, `fn.cast(x, 'decimal(10,2)')`, `fn.convert(x, { using: 'utf8mb4' })`, `fn.getFormat('date', 'EUR')`, `fn.trim(str, { side: 'leading', remove: '0' })`, `fn.position(substr, str)`, `fn.char(codes, { using })`, `fn.match(columns, search, { mode: 'boolean' })`, `fn.groupConcat(exprs, { distinct, orderBy, separator })`, `fn.countDistinct(...exprs)`, `fn.jsonValue(doc, path, { returning: 'unsigned' })` and `fn.memberOf(value, array)`.
- Functions that only exist on MySQL throw an error when used with another database. Standard functions like `fn.round()`, `fn.length()` and `fn.trim()` work everywhere.
- Spatial functions, `JSON_TABLE()` and deprecated functions aren't included. Use `fn('NAME', ...args)` for them.

##### Examples

```js
const { fn, ref } = require('objection');

// Compare nullable numbers
await Model.query().where(fn('coalesce', ref('age'), 0), '>', 30);

// The same example using the fn.coalesce shortcut
await Model.query().where(fn.coalesce(ref('age'), 0), '>', 30);

// The same example using an expression
await Model.query().where(fn.coalesce(ref('age'), 0).gt(30));
```

Functions work in `select()` with `as()`, and in `orderBy()`:

```js
// select `id`, UPPER(`firstName`) as `upperName` from `persons` order by LOWER(`lastName`) asc
await Person.query()
  .select('id', fn.upper(ref('firstName')).as('upperName'))
  .orderBy(fn.lower(ref('lastName')));

// Count the pets of each person, zero included
await Person.query()
  .select('persons.id', fn.count(ref('pets.id')).as('petCount'))
  .leftJoinRelated('pets')
  .groupBy('persons.id');
```

`fn.now()` is `CURRENT_TIMESTAMP(6)`, and `fn.now(precision)` sets the number of fractional digits. It works on postgres, MySQL and MariaDB. SQLite doesn't accept a precision, so use `raw('CURRENT_TIMESTAMP')` there.

```js
await Person.query().patch({ updatedAt: fn.now() }).where('id', 1);
```

## Expressions

`ref()`, `val()`, `fn()` and `raw()` have methods that build comparisons, conditions and arithmetic, so that expressions don't need to be written as raw SQL. Each method returns a new [FunctionBuilder](/api/types/#class-functionbuilder), so they can be chained and used anywhere a `fn()` can: in `select()` with `.as()`, `where()`, `having()`, `orderBy()`, join callbacks, `patch()` and `onConflict().merge()` values, and as arguments of other functions.

```js
const { fn, ref, val } = require('objection');

await Lesson.query()
  .select(
    'id',
    val('lesson').as('type'),
    Lesson.ref('body').isNotBlank().or(Lesson.ref('mediaUrl').isNotBlank()).as('hasContent'),
    Submission.ref('grade').gt(2).as('passed'),
  )
  .where(Lesson.ref('order').between(1, 10))
  .orderBy(Lesson.ref('courseId').eq(preferredCourseId), 'desc');

// Move lessons down by one
await Lesson.query()
  .patch({ order: Lesson.ref('order').plus(1) })
  .where('order', '>=', newOrder);

// Never go below zero
await Comment.query().patch({ replyCount: fn.greatest(Comment.ref('replyCount').minus(1), 0) });
```

| Method                                                | SQL                              |
| ----------------------------------------------------- | -------------------------------- |
| `eq(value)`, `ne(value)`                              | `(a = value)`, `(a <> value)`. `eq(null)` is `IS NULL` and `ne(null)` is `IS NOT NULL`, like `where(column, null)` |
| `gt(value)`, `gte(value)`, `lt(value)`, `lte(value)`  | `(a > value)` ...                |
| `in(values)`, `notIn(values)`                         | `(a IN (...))`. Takes an array or a subquery. `in([])` matches nothing |
| `like(pattern)`, `between(min, max)`                  | `(a LIKE pattern)`, `(a BETWEEN min AND max)` |
| `isNull()`, `isNotNull()`                             | `(a IS NULL)`, `(a IS NOT NULL)` |
| `isBlank()`, `isNotBlank()`                           | NULL, an empty string or only spaces: `(COALESCE(TRIM(a), '') = '')` |
| `and(...conditions)`, `or(...conditions)`, `not()`    | `(a AND b AND ...)`, `(a OR b OR ...)`, `(NOT a)` |
| `plus(value)`, `minus(value)`, `times(value)`, `div(value)` | `(a + value)` ...           |

The SQL of every method is wrapped in parentheses, so expressions can be nested without thinking about operator precedence. Like the arguments of `fn()`, strings are values: use `ref()` or `Model.ref()` for columns. In TypeScript the values are checked against the type of the column: `Lesson.ref('order').eq('2')` is an error when `order` is a number. Dates can also be compared with strings.

Conditions are booleans on postgres and `0` or `1` on MySQL and SQLite. See [Expressions](/fork/expressions.html) for more examples and the SQL they generate.

##### fn.case()

`fn.case()` builds `CASE WHEN condition THEN result ... ELSE result END`, and `fn.case(value)` builds `CASE value WHEN other THEN result ... END`. Without `else()` the result is `NULL` when nothing matches.

```js
await Job.query().select(
  fn
    .case(Job.ref('typeCode'))
    .when(JobType.FULL_TIME, 3)
    .when(JobType.PART_TIME, 1)
    .else(0)
    .as('typeScore'),
  fn.case().when(Job.ref('id').in(manualJobIds), 'manual').else('scraped').as('source'),
);
```

In TypeScript the type of the result is the union of the results: `'manual' | 'scraped'` above.

##### fn.exists()

`fn.exists(query)` is `(EXISTS (query))`.

```js
await Quiz.query().select('id', fn.exists(Quiz.relatedQuery('questions')).as('hasContent'));
```

##### Filtered aggregates

`filter(condition)` of the aggregate functions (`fn.count()`, `fn.sum()`, `fn.avg()`, `fn.min()`, `fn.max()`, `fn.countDistinct()`, `fn.groupConcat()`, `fn.jsonArrayAgg()`, `fn.std()`, `fn.variance()`...) only aggregates the rows that match the condition. It's written as `CASE WHEN condition THEN value END`, which works on every database. Calling `filter()` again adds a condition with `AND`. `fn.count()` without arguments is `COUNT(*)`.

```js
await EventUser.query()
  .select(
    'eventId',
    fn.count().as('registrants'),
    fn.count().filter(EventUser.ref('hasAttended')).as('attended'),
    fn.countDistinct(EventUser.ref('userId')).filter(EventUser.ref('statusCode').eq(ACCEPTED)).as('accepted'),
    fn.avg(Submission.ref('grade')).filter(Submission.ref('grade').isNotNull()).as('averageGrade'),
  )
  .groupBy('eventId')
  .having(fn.count().gt(0));
```

##### Window functions

`over({ partitionBy, orderBy })` turns an aggregate or a window function into a window function call. Strings in `partitionBy` and `orderBy` are column names. `orderBy` takes a column, `[column, 'desc']`, or a list of them. The window functions are `fn.rowNumber()`, `fn.rank()`, `fn.denseRank()`, `fn.percentRank()`, `fn.cumeDist()`, `fn.ntile(buckets)`, `fn.lag(x, offset, default)`, `fn.lead(x, offset, default)`, `fn.firstValue(x)`, `fn.lastValue(x)` and `fn.nthValue(x, n)`, and they can only be used with `over()`. They work on postgres, MySQL 8 and SQLite 3.25 or newer.

```js
// The first three attendees of each event
await EventUser.query()
  .from(
    EventUser.query()
      .select(
        'event_users.*',
        fn.rowNumber().over({ partitionBy: 'eventId', orderBy: ['createdAt', 'asc'] }).as('rn'),
      )
      .as('event_users'),
  )
  .where('rn', '<=', 3);

await Payment.query().select('id', fn.sum(Payment.ref('amount')).over({ partitionBy: 'ownerId' }).as('ownerTotal'));
```

##### fn.excluded()

`fn.excluded(column)` is the value an upsert tried to insert: `VALUES(column)` on MySQL and `excluded.column` on postgres and SQLite.

```js
await CourseUser.query()
  .insert({ userId, courseId, type })
  .onConflict(['userId', 'courseId'])
  .merge({
    // Keep instructors instructors.
    type: fn
      .case()
      .when(CourseUser.ref('type').eq(CourseUserType.INSTRUCTOR), CourseUser.ref('type'))
      .else(fn.excluded('type')),
  });
```

## mixin

```js
const { mixin } = require('objection');
```

The mixin helper for applying multiple [plugins](/guide/plugins.html). `mixin(Model, [a, b])` is `b(a(Model))`.

##### Examples

A plugin is a function that takes a model class and returns a subclass of it. A plugin with options is a function that returns a plugin. These two set timestamps and lowercase some properties:

```js
const { mixin, Model } = require('objection');

const Timestamps =
  ({ createdAt = 'createdAt', updatedAt = 'updatedAt' } = {}) =>
  (Model) =>
    class extends Model {
      $beforeInsert(context) {
        this[createdAt] = this[updatedAt] = new Date();
        return super.$beforeInsert(context);
      }

      $beforeUpdate(opt, context) {
        this[updatedAt] = new Date();
        return super.$beforeUpdate(opt, context);
      }
    };

const LowerCase =
  (...props) =>
  (Model) =>
    class extends Model {
      $parseJson(json, opt) {
        json = super.$parseJson(json, opt);

        for (const prop of props) {
          if (typeof json[prop] === 'string') {
            json[prop] = json[prop].toLowerCase();
          }
        }

        return json;
      }
    };

class Person extends mixin(Model, [Timestamps(), LowerCase('email')]) {
  static tableName = 'persons';
}

// insert into `persons` (`createdAt`, `email`, `firstName`, `updatedAt`)
// values ('2026-11-11 12:00:00.000', 'jennifer@example.com', 'Jennifer', '2026-11-11 12:00:00.000')
await Person.query().insert({ firstName: 'Jennifer', email: 'Jennifer@Example.com' });
```

The hooks return what `super` returns instead of being `async`. An `async` hook works too, but objection only waits for hooks that return a promise, so the query then waits where it wouldn't have to. See "Hooks run without promises" in [What is faster](/fork/performance.html#what-is-faster).

## compose

```js
const { compose } = require('objection');
```

The compose helper for applying multiple [plugins](/guide/plugins.html). It combines plugins into one, which you can apply to several models.

##### Examples

With the `Timestamps` and `LowerCase` plugins of the [mixin](#mixin) example:

```js
const { compose, Model } = require('objection');

const plugins = compose(Timestamps(), LowerCase('email'));

class Person extends plugins(Model) {
  static tableName = 'persons';
}

class Admin extends plugins(Model) {
  static tableName = 'admins';
}
```

## snakeCaseMappers

```js
const { snakeCaseMappers } = require('objection');
```

Function for adding snake_case to camelCase conversion to objection models. Better documented [here](/recipes/snake-case-to-camel-case-conversion.html). The `snakeCaseMappers` function accepts an options object. The available options are:

| Option                            | Type    | Default | Description                                                                                                                                             |
| --------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| upperCase                         | boolean | `false` | Set to `true` if your columns are UPPER_SNAKE_CASED.                                                                                                    |
| underscoreBeforeDigits            | boolean | `false` | When `true`, will place an underscore before digits (`foo1Bar2` becomes `foo_1_bar_2`). When `false`, `foo1Bar2` becomes `foo1_bar2`.                   |
| underscoreBetweenUppercaseLetters | boolean | `false` | When `true`, will place underscores between consecutive uppercase letters (`fooBAR` becomes `foo_b_a_r`). When `false`, `fooBAR` will become `foo_bar`. |

##### Examples

```js
const { Model, snakeCaseMappers } = require('objection');

class Person extends Model {
  static get columnNameMappers() {
    return snakeCaseMappers();
  }
}
```

If your columns are UPPER_SNAKE_CASE

```js
const { Model, snakeCaseMappers } = require('objection');

class Person extends Model {
  static get columnNameMappers() {
    return snakeCaseMappers({ upperCase: true });
  }
}
```

The mappers have a `format()` that turns properties into columns and a `parse()` that turns columns into properties. Use them to check what an option does:

```js
const { format, parse } = snakeCaseMappers({ underscoreBeforeDigits: true });

format({ firstName: 'Jennifer', addressLine1: 'Main Street 1' });
// { first_name: 'Jennifer', address_line_1: 'Main Street 1' }

parse({ address_line_1: 'Main Street 1' });
// { addressLine1: 'Main Street 1' }

// Without the option, `addressLine1` is `address_line1`.
snakeCaseMappers().format({ addressLine1: 'Main Street 1' });
// { address_line1: 'Main Street 1' }
```

## knexSnakeCaseMappers

```js
const { knexSnakeCaseMappers } = require('objection');
```

Function for adding a snake_case to camelCase conversion to `knex`. Better documented [here](/recipes/snake-case-to-camel-case-conversion.html). The `knexSnakeCaseMappers` function accepts an options object. The available options are:

| Option                            | Type    | Default | Description                                                                                                                                             |
| --------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| upperCase                         | boolean | `false` | Set to `true` if your columns are UPPER_SNAKE_CASED.                                                                                                    |
| underscoreBeforeDigits            | boolean | `false` | When `true`, will place an underscore before digits (`foo1Bar2` becomes `foo_1_bar_2`). When `false`, `foo1Bar2` becomes `foo1_bar2`.                   |
| underscoreBetweenUppercaseLetters | boolean | `false` | When `true`, will place underscores between consecutive uppercase letters (`fooBAR` becomes `foo_b_a_r`). When `false`, `fooBAR` will become `foo_bar`. |

##### Examples

```js
const { knexSnakeCaseMappers } = require('objection');
const Knex = require('knex');

const knex = Knex({
  client: 'postgres',

  connection: {
    host: '127.0.0.1',
    user: 'objection',
    database: 'objection_test'
  },

  ...knexSnakeCaseMappers()
});
```

If your columns are UPPER_SNAKE_CASE

```js
const { knexSnakeCaseMappers } = require('objection');
const Knex = require('knex');

const knex = Knex({
  client: 'postgres',

  connection: {
    host: '127.0.0.1',
    user: 'objection',
    database: 'objection_test'
  },

  ...knexSnakeCaseMappers({ upperCase: true })
});
```

## knexIdentifierMapping

```js
const { knexIdentifierMapping } = require('objection');
```

Like [knexSnakeCaseMappers](/api/objection/#knexsnakecasemappers), but can be used to make an arbitrary static mapping between column names and property names. In the examples, you would have identifiers `MyId`, `MyProp` and `MyAnotherProp` in the database and you would like to map them into `id`, `prop` and `anotherProp` in the code.

##### Examples

```js
const { knexIdentifierMapping } = require('objection');
const Knex = require('knex');

const knex = Knex({
  client: 'postgres',

  connection: {
    host: '127.0.0.1',
    user: 'objection',
    database: 'objection_test'
  },

  ...knexIdentifierMapping({
    MyId: 'id',
    MyProp: 'prop',
    MyAnotherProp: 'anotherProp'
  })
});
```

Note that you can pretty easily define the conversions in some static property of your model. In this example we have added a property `column` to jsonSchema and use that to create the mapping object.

```js
const { knexIdentifierMapping } = require('objection');
const Knex = require('knex');
const path = require('path')
const fs = require('fs');

// Path to your model folder.
const MODELS_PATH = path.join(__dirname, 'models');

const knex = Knex({
  client: 'postgres',

  connection: {
    host: '127.0.0.1',
    user: 'objection',
    database: 'objection_test'
  },

  // Go through all models and add conversions using the custom property
  // `column` in json schema.
  ...knexIdentifierMapping(fs.readdirSync(MODELS_PATH)
    .filter(it => it.endsWith('.js'))
    .map(it => require(path.join(MODELS_PATH, it)))
    .reduce((mapping, modelClass) => {
      const properties = modelClass.jsonSchema.properties;
      return Object.keys(properties).reduce((mapping, propName) => {
        mapping[properties[propName].column] = propName;
        return mapping;
      }, mapping);
    }, {})
  )
});
```

## Validator

```js
const { Validator } = require('objection');
```

The [Validator](/api/types/#class-validator) base class of custom validators.

## AjvValidator

```js
const { AjvValidator } = require('objection');
```

The [AjvValidator](/api/types/#class-ajvvalidator) class, the default validator.

##### Examples

Return one from `createValidator()` to set Ajv's options, or to add formats and keywords. Here with [ajv-formats](https://github.com/ajv-validator/ajv-formats) for `format: 'email'`, and `allErrors` to report every invalid property instead of the first one:

```js
const { Model, AjvValidator } = require('objection');
const addFormats = require('ajv-formats');

class Person extends Model {
  static jsonSchema = {
    type: 'object',
    required: ['firstName'],
    properties: {
      firstName: { type: 'string', minLength: 1 },
      email: { type: 'string', format: 'email' },
    },
  };

  static createValidator() {
    return new AjvValidator({
      onCreateAjv: (ajv) => addFormats(ajv),
      options: { allErrors: true },
    });
  }
}
```

See [Custom validation](/recipes/custom-validation.html) for more.

## ValidationError

```js
const { ValidationError } = require('objection');
```

The [ValidationError](/api/types/#class-validationerror) class. `type` is `'ModelValidation'` for invalid models, `statusCode` is 400, and `data` has the errors of each property.

##### Examples

With the `Person` of the [AjvValidator](#ajvvalidator) example:

```js
try {
  await Person.query().insert({ firstName: '', email: 'not an email' });
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.data);
    // {
    //   firstName: [{ message: 'must NOT have fewer than 1 characters', keyword: 'minLength', params: { limit: 1 } }],
    //   email: [{ message: 'must match format "email"', keyword: 'format', params: { format: 'email' } }]
    // }
  }
}
```

See [Error handling](/recipes/error-handling.html) for the other types.

## NotFoundError

```js
const { NotFoundError } = require('objection');
```

The [NotFoundError](/api/types/#class-notfounderror) class, thrown by [throwIfNotFound()](/api/query-builder/other-methods.html#throwifnotfound). `statusCode` is 404, and `data` has the properties passed to `throwIfNotFound()`.

##### Examples

```js
try {
  await Person.query().findById(id).throwIfNotFound({ message: 'No such person', id });
} catch (err) {
  if (err instanceof NotFoundError) {
    err.message; // 'No such person'
    err.data; // { message: 'No such person', id }
  }
}
```

## DBError

```js
const { DBError } = require('objection');
```

The [DBError](https://github.com/Vincit/db-errors#dberror) from [db-errors](https://github.com/Vincit/db-errors) library. Every error of the database is wrapped in a `DBError` or one of the classes below, which extend it. `nativeError` is the error of the database driver.

##### Examples

```js
const { UniqueViolationError, ForeignKeyViolationError } = require('objection');

try {
  await Person.query().insert({ email: 'taken@example.com' });
} catch (err) {
  if (err instanceof UniqueViolationError) {
    // On postgres: err.table is 'persons', err.columns is ['email']
    // and err.constraint is 'persons_email_unique'.
  } else if (err instanceof ForeignKeyViolationError) {
    // ...
  }
}
```

Which properties are set depends on the database:

| Error                      | postgres                          | MySQL and MariaDB    | SQLite              |
| -------------------------- | --------------------------------- | -------------------- | ------------------- |
| `UniqueViolationError`     | `table`, `columns`, `constraint`  | `constraint`         | `table`, `columns`  |
| `ForeignKeyViolationError` | `table`, `constraint`             | `table`, `constraint` | none               |

On MySQL and MariaDB the `constraint` of a unique violation is the name of the unique index, as the database reports it: `persons.persons_email_unique` on MySQL 8.4 and `persons_email_unique` on MariaDB 11.4.

## ConstraintViolationError

```js
const { ConstraintViolationError } = require('objection');
```

The [ConstraintViolationError](https://github.com/Vincit/db-errors#constraintviolationerror) from [db-errors](https://github.com/Vincit/db-errors) library.

## UniqueViolationError

```js
const { UniqueViolationError } = require('objection');
```

The [UniqueViolationError](https://github.com/Vincit/db-errors#uniqueviolationerror) from [db-errors](https://github.com/Vincit/db-errors) library.

## NotNullViolationError

```js
const { NotNullViolationError } = require('objection');
```

The [NotNullViolationError](https://github.com/Vincit/db-errors#notnullviolationerror) from [db-errors](https://github.com/Vincit/db-errors) library.

## ForeignKeyViolationError

```js
const { ForeignKeyViolationError } = require('objection');
```

The [ForeignKeyViolationError](https://github.com/Vincit/db-errors#foreignkeyviolationerror) from [db-errors](https://github.com/Vincit/db-errors) library.

## CheckViolationError

```js
const { CheckViolationError } = require('objection');
```

The [CheckViolationError](https://github.com/Vincit/db-errors#checkviolationerror) from [db-errors](https://github.com/Vincit/db-errors) library.

## DataError

```js
const { DataError } = require('objection');
```

The [DataError](https://github.com/Vincit/db-errors#dataerror) from [db-errors](https://github.com/Vincit/db-errors) library.
