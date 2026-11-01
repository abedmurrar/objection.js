# Expressions

The fork can build conditions, comparisons and arithmetic without raw SQL. Every method below returns a new `FunctionBuilder`. You can chain them, and use them anywhere a `fn()` works: in `select()` with `.as()`, `where()`, `having()`, `orderBy()`, join callbacks, `patch()` and `onConflict().merge()` values, and as arguments of other functions.

## Expression methods

`ref()`, `val()`, `fn()` and `raw()`, including `Model.ref()`, have these methods:

| Method                                                      | SQL                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `eq(value)`, `ne(value)`                                    | `(a = value)`, `(a <> value)`. `eq(null)` is `IS NULL` and `ne(null)` is `IS NOT NULL`, as in `where(column, null)` |
| `gt(value)`, `gte(value)`, `lt(value)`, `lte(value)`        | `(a > value)`, `(a >= value)`, ...                                                                                  |
| `in(values)`, `notIn(values)`                               | `(a IN (...))`. Takes an array or a subquery. `in([])` matches nothing                                              |
| `like(pattern)`, `between(min, max)`                        | `(a LIKE pattern)`, `(a BETWEEN min AND max)`                                                                       |
| `isNull()`, `isNotNull()`                                   | `(a IS NULL)`, `(a IS NOT NULL)`                                                                                    |
| `isBlank()`, `isNotBlank()`                                 | NULL, an empty string or only spaces: `(COALESCE(TRIM(a), '') = '')`                                                |
| `and(...conditions)`, `or(...conditions)`, `not()`          | `(a AND b AND ...)`, `(a OR b OR ...)`, `(NOT a)`                                                                   |
| `plus(value)`, `minus(value)`, `times(value)`, `div(value)` | `(a + value)`, `(a - value)`, ...                                                                                   |

```js
const { fn, ref, val } = require('objection');

await Lesson.query()
  .select(
    'id',
    val('lesson').as('type'),
    Lesson.ref('body')
      .isNotBlank()
      .or(Lesson.ref('mediaUrl').isNotBlank())
      .as('hasContent'),
  )
  .where(Lesson.ref('order').between(1, 10))
  .orderBy(Lesson.ref('courseId').eq(preferredCourseId), 'desc');

// Move lessons down by one.
await Lesson.query()
  .patch({ order: Lesson.ref('order').plus(1) })
  .where('order', '>=', newOrder);

// Never go below zero.
await Comment.query().patch({
  replyCount: fn.greatest(Comment.ref('replyCount').minus(1), 0),
});
```

- Each method's SQL is wrapped in parentheses, so nesting expressions doesn't need any thought about operator precedence.
- Strings are values, the same as `fn()` arguments. For columns, use `ref()` or `Model.ref()`.
- Conditions are booleans on postgres, and `0` or `1` on MySQL and SQLite.
- Expressions don't trigger the [where-scope grouping](./breaking-changes.md#orwhere-no-longer-escapes-the-conditions-objection-adds) unless their arguments contain raw SQL.
- In TypeScript, values are checked against the type of the column: `Lesson.ref('order').eq('2')` is an error when `order` is a number. Dates can also be compared with strings.

## `fn.case()`

`fn.case()` builds `CASE WHEN condition THEN result ... ELSE result END`. `fn.case(value)` builds `CASE value WHEN other THEN result ... END`. Without `else()`, the result is `NULL` when nothing matches. At least one `when()` is required.

```js
await Job.query().select(
  fn
    .case(Job.ref('typeCode'))
    .when(JobType.FULL_TIME, 3)
    .when(JobType.PART_TIME, 1)
    .else(0)
    .as('typeScore'),
  fn
    .case()
    .when(Job.ref('id').in(manualJobIds), 'manual')
    .else('scraped')
    .as('source'),
);
```

In TypeScript, the result type is the union of the results. For `source` above, that's `'manual' | 'scraped'`.

## `fn.exists()`

`fn.exists(query)` is `(EXISTS (query))`.

```js
await Quiz.query().select(
  'id',
  fn.exists(Quiz.relatedQuery('questions')).as('hasContent'),
);
```

## Filtered aggregates

Aggregate functions have a `filter(condition)` method that only aggregates the rows matching the condition. This works with `fn.count()`, `fn.sum()`, `fn.avg()`, `fn.min()`, `fn.max()`, `fn.countDistinct()`, `fn.groupConcat()`, `fn.jsonArrayAgg()`, `fn.std()`, `fn.variance()`, and the others. It's written as `CASE WHEN condition THEN value END`, so it works on every database. A second `filter()` adds its condition with `AND`. On non-aggregate functions, `filter()` throws.

`fn.count()` without arguments is `COUNT(*)`.

```js
await EventUser.query()
  .select(
    'eventId',
    fn.count().as('registrants'),
    fn.count().filter(EventUser.ref('hasAttended')).as('attended'),
    fn
      .countDistinct(EventUser.ref('userId'))
      .filter(EventUser.ref('statusCode').eq(ACCEPTED))
      .as('accepted'),
  )
  .groupBy('eventId')
  .having(fn.count().gt(0));
```

```sql
COUNT(CASE WHEN `hasAttended` THEN 1 END)
COUNT(DISTINCT CASE WHEN (`statusCode` = ?) THEN `userId` END)
```

## Window functions

`over({ partitionBy, orderBy })` turns an aggregate or a window function into a window function call. Strings in `partitionBy` and `orderBy` are column names. `orderBy` takes a column, `[column, 'desc']`, or a list of them.

The window functions are:

- `fn.rowNumber()`, `fn.rank()`, `fn.denseRank()`, `fn.percentRank()`, `fn.cumeDist()`
- `fn.ntile(buckets)`
- `fn.lag(x, offset, default)`, `fn.lead(x, offset, default)`
- `fn.firstValue(x)`, `fn.lastValue(x)`, `fn.nthValue(x, n)`

They only work with `over()`, and throw without it. They work on postgres, MySQL 8 and SQLite 3.25 or newer.

```js
// The first three attendees of each event.
await EventUser.query()
  .from(
    EventUser.query()
      .select(
        'event_users.*',
        fn
          .rowNumber()
          .over({ partitionBy: 'eventId', orderBy: ['createdAt', 'asc'] })
          .as('rn'),
      )
      .as('event_users'),
  )
  .where('rn', '<=', 3);

// A running total per owner.
await Payment.query().select(
  'id',
  fn
    .sum(Payment.ref('amount'))
    .over({ partitionBy: 'ownerId' })
    .as('ownerTotal'),
);
```

## `fn.excluded()`

`fn.excluded(column)` is the value an upsert tried to insert. That's `VALUES(column)` on MySQL, and `excluded.column` on postgres and SQLite.

```js
await CourseUser.query()
  .insert({ userId, courseId, type })
  .onConflict(['userId', 'courseId'])
  .merge({
    // Instructors stay instructors.
    type: fn
      .case()
      .when(
        CourseUser.ref('type').eq(CourseUserType.INSTRUCTOR),
        CourseUser.ref('type'),
      )
      .else(fn.excluded('type')),
  });
```

## `none()`

`none()` makes a query match no rows by adding `where (1 = 0)`. It's useful in modifiers when there's nothing to match:

```js
function forUsers(query, userIds) {
  if (userIds.length === 0) {
    return query.none();
  }

  query.whereIn('userId', userIds);
}
```

On relation queries the owner condition is kept: `where "pets"."ownerId" in (1) and (1 = 0)`.
