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
    // A constant column: 'lesson' as "type"
    val('lesson').as('type'),
    // true when the lesson has a body or a media URL that isn't blank
    Lesson.ref('body')
      .isNotBlank()
      .or(Lesson.ref('mediaUrl').isNotBlank())
      .as('hasContent'),
  )
  .where(Lesson.ref('order').between(1, 10))
  // The lessons of the preferred course first: true sorts after false, so
  // with desc they come first.
  .orderBy(Lesson.ref('courseId').eq(preferredCourseId), 'desc');
```

```sql
-- postgres, with preferredCourseId = 7
select "id", 'lesson' as "type",
  ((COALESCE(TRIM("lessons"."body"), '') <> '') OR (COALESCE(TRIM("lessons"."mediaUrl"), '') <> '')) as "hasContent"
from "lessons"
where ("lessons"."order" BETWEEN 1 AND 10)
order by ("lessons"."courseId" = 7) desc
```

Expressions are also values in `patch()`, so the database computes the new value from the current one. Nothing is read first, so concurrent updates don't overwrite each other:

```js
// Move lessons down by one. With newOrder = 3:
// update "lessons" set "order" = ("lessons"."order" + 1) where "order" >= 3
await Lesson.query()
  .patch({ order: Lesson.ref('order').plus(1) })
  .where('order', '>=', newOrder);

// Never go below zero. With commentId = 5:
// update "comments" set "replyCount" = GREATEST(("comments"."replyCount" - 1), 0) where "comments"."id" = 5
await Comment.query()
  .patch({ replyCount: fn.greatest(Comment.ref('replyCount').minus(1), 0) })
  .findById(commentId);
```

`GREATEST()` exists on postgres and MySQL. On SQLite, use `fn.max(a, b)`, which is its scalar `max()` with two arguments.

Conditions can be combined with `and()`, `or()` and `not()`, and used in `where()`:

```js
// Orders of 50 or more, or refunded orders, of customers other than 2 and 3.
const orders = await Order.query()
  .select('id')
  .where(Order.ref('total').gte(50).or(Order.ref('status').eq('refunded')))
  .where(Order.ref('customerId').in([2, 3]).not());
```

```sql
select "id" from "orders"
where (("orders"."total" >= 50) OR ("orders"."status" = 'refunded'))
  and (NOT ("orders"."customerId" IN (2, 3)))
```

`isBlank()` is handy for text columns that can be `NULL`, empty or only spaces:

```js
// Lessons whose body is NULL, '' or '   '.
const empty = await Lesson.query().where(Lesson.ref('body').isBlank());
// select "lessons".* from "lessons" where (COALESCE(TRIM("lessons"."body"), '') = '')
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
  // CASE value WHEN ...: compares typeCode with each value.
  fn
    .case(Job.ref('typeCode'))
    .when(JobType.FULL_TIME, 3)
    .when(JobType.PART_TIME, 1)
    .else(0)
    .as('typeScore'),
  // CASE WHEN ...: each when() takes a condition.
  fn
    .case()
    .when(Job.ref('id').in(manualJobIds), 'manual')
    .else('scraped')
    .as('source'),
);
```

```sql
-- postgres, with FULL_TIME = 1, PART_TIME = 2 and manualJobIds = [4, 5]
select (CASE "jobs"."typeCode" WHEN 1 THEN 3 WHEN 2 THEN 1 ELSE 0 END) as "typeScore",
  (CASE WHEN ("jobs"."id" IN (4, 5)) THEN 'manual' ELSE 'scraped' END) as "source"
from "jobs"
```

In TypeScript, the result type is the union of the results. For `source` above, that's `'manual' | 'scraped'`.

`fn.case()` in `orderBy()` sorts in an order that isn't alphabetical:

```js
// Pending orders first, then paid ones, then everything else.
const orders = await Order.query()
  .select('id', 'status')
  .orderBy(
    fn.case(Order.ref('status')).when('pending', 0).when('paid', 1).else(2),
  )
  .orderBy('id');
```

```sql
select "id", "status" from "orders"
order by (CASE "orders"."status" WHEN 'pending' THEN 0 WHEN 'paid' THEN 1 ELSE 2 END) asc, "id" asc
```

## `fn.exists()`

`fn.exists(query)` is `(EXISTS (query))`.

```js
// The static relatedQuery() as a subquery refers to the quiz of each row.
await Quiz.query().select(
  'id',
  fn.exists(Quiz.relatedQuery('questions')).as('hasContent'),
);
// select "id", (EXISTS (select "questions".* from "questions"
//   where "questions"."quizId" = "quizzes"."id")) as "hasContent" from "quizzes"

// The subquery can have conditions of its own.
await Quiz.query().select(
  'id',
  fn
    .exists(Quiz.relatedQuery('questions').where('published', true))
    .as('hasPublished'),
);

// Quizzes without any questions.
await Quiz.query().where(fn.exists(Quiz.relatedQuery('questions')).not());
// select "quizzes".* from "quizzes" where (NOT (EXISTS (select "questions".*
//   from "questions" where "questions"."quizId" = "quizzes"."id")))
```

On SQLite and MySQL, `hasContent` and `hasPublished` are `0` or `1`. On postgres they are booleans.

## Filtered aggregates

Aggregate functions have a `filter(condition)` method that only aggregates the rows matching the condition. This works with `fn.count()`, `fn.sum()`, `fn.avg()`, `fn.min()`, `fn.max()`, `fn.countDistinct()`, `fn.groupConcat()`, `fn.jsonArrayAgg()`, `fn.std()`, `fn.variance()`, and the others. It's written as `CASE WHEN condition THEN value END`, so it works on every database. A second `filter()` adds its condition with `AND`. On non-aggregate functions, `filter()` throws.

`fn.count()` without arguments is `COUNT(*)`.

```js
await EventUser.query()
  .select(
    'eventId',
    // All rows of the event.
    fn.count().as('registrants'),
    // Only the rows where hasAttended is true.
    fn.count().filter(EventUser.ref('hasAttended')).as('attended'),
    // The distinct users whose status is ACCEPTED.
    fn
      .countDistinct(EventUser.ref('userId'))
      .filter(EventUser.ref('statusCode').eq(ACCEPTED))
      .as('accepted'),
  )
  .groupBy('eventId')
  .having(fn.count().gt(0));
```

```sql
-- MySQL, with ACCEPTED = 2
select `eventId`,
  COUNT(*) as `registrants`,
  COUNT(CASE WHEN `event_users`.`hasAttended` THEN 1 END) as `attended`,
  COUNT(DISTINCT CASE WHEN (`event_users`.`statusCode` = 2) THEN `event_users`.`userId` END) as `accepted`
from `event_users`
group by `eventId`
having (COUNT(*) > 0)
```

A report of orders per customer, which only lists the customers with at least one paid order:

```js
const isPaid = Order.ref('status').eq('paid');

const customers = await Order.query()
  .select(
    'customerId',
    fn.count().as('orders'),
    fn.count().filter(isPaid).as('paidOrders'),
    // SUM() of no rows is NULL, so customers without paid orders get null.
    fn.sum(Order.ref('total')).filter(isPaid).as('paidTotal'),
  )
  .groupBy('customerId')
  // A filtered aggregate works in having() too.
  .having(fn.count().filter(isPaid).gt(0))
  .orderBy('paidTotal', 'desc');
```

```sql
-- postgres
select "customerId",
  COUNT(*) as "orders",
  COUNT(CASE WHEN ("orders"."status" = 'paid') THEN 1 END) as "paidOrders",
  SUM(CASE WHEN ("orders"."status" = 'paid') THEN "orders"."total" END) as "paidTotal"
from "orders"
group by "customerId"
having (COUNT(CASE WHEN ("orders"."status" = 'paid') THEN 1 END) > 0)
order by "paidTotal" desc
```

With these orders:

| id  | customerId | status   | total |
| --- | ---------- | -------- | ----- |
| 1   | 1          | paid     | 40    |
| 2   | 1          | paid     | 60    |
| 3   | 1          | refunded | 25    |
| 4   | 2          | paid     | 90    |
| 5   | 2          | pending  | 30    |
| 6   | 3          | pending  | 15    |

the result on SQLite is:

```js
[
  { customerId: 1, orders: 3, paidOrders: 2, paidTotal: 100 },
  { customerId: 2, orders: 2, paidOrders: 1, paidTotal: 90 },
];
```

Customer 3 has no paid orders, so `having()` leaves it out. The rows are `Order` instances with only the selected columns. On postgres, the `pg` driver returns the counts, and the sum of an `integer` column, as strings, because they are `bigint` values there.

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
  // Window functions can't be used in where(), so number the rows in a
  // subquery and filter on the number outside of it. The subquery gets the
  // table's name as its alias, so the rows still read as event_users.
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
```

```sql
select * from (
  select "event_users".*, ROW_NUMBER() OVER (PARTITION BY "eventId" ORDER BY "createdAt" ASC) as "rn"
  from "event_users"
) as "event_users"
where "rn" <= 3
```

```js
// The total of all payments of the owner, next to each payment.
await Payment.query().select(
  'id',
  fn
    .sum(Payment.ref('amount'))
    .over({ partitionBy: 'ownerId' })
    .as('ownerTotal'),
);
// select "id", SUM("payments"."amount") OVER (PARTITION BY "ownerId") as "ownerTotal" from "payments"
```

With an `orderBy`, an aggregate only covers the rows up to the current one (and the rows with the same `orderBy` value), which makes a running total. `fn.lag()` reads a column of the previous row:

```js
const orders = await Order.query()
  .select(
    'id',
    'customerId',
    'total',
    // The total of the customer's previous order, or 0 for their first one.
    fn
      .lag(Order.ref('total'), 1, 0)
      .over({ partitionBy: 'customerId', orderBy: 'createdAt' })
      .as('previousTotal'),
    // The sum of the customer's orders so far.
    fn
      .sum(Order.ref('total'))
      .over({ partitionBy: 'customerId', orderBy: 'createdAt' })
      .as('runningTotal'),
    // 1 for the customer's largest order. Ties get the same rank.
    fn
      .rank()
      .over({ partitionBy: 'customerId', orderBy: ['total', 'desc'] })
      .as('rankByTotal'),
  )
  .orderBy(['customerId', 'createdAt']);
```

```sql
-- postgres
select "id", "customerId", "total",
  LAG("orders"."total", 1, 0) OVER (PARTITION BY "customerId" ORDER BY "createdAt") as "previousTotal",
  SUM("orders"."total") OVER (PARTITION BY "customerId" ORDER BY "createdAt") as "runningTotal",
  RANK() OVER (PARTITION BY "customerId" ORDER BY "total" DESC) as "rankByTotal"
from "orders"
order by "customerId" asc, "createdAt" asc
```

With the orders of the [report above](#filtered-aggregates), where each customer's orders were created in the order of their ids, the result on SQLite is:

| id  | customerId | total | previousTotal | runningTotal | rankByTotal |
| --- | ---------- | ----- | ------------- | ------------ | ----------- |
| 1   | 1          | 40    | 0             | 40           | 2           |
| 2   | 1          | 60    | 40            | 100          | 1           |
| 3   | 1          | 25    | 60            | 125          | 3           |
| 4   | 2          | 90    | 0             | 90           | 1           |
| 5   | 2          | 30    | 90            | 120          | 2           |
| 6   | 3          | 15    | 0             | 15           | 1           |

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

```sql
-- postgres, with userId = 1, courseId = 2 and type = 'student'
insert into "course_users" ("courseId", "type", "userId") values (2, 'student', 1)
on conflict ("userId", "courseId") do update set
  "type" = (CASE WHEN ("course_users"."type" = 'instructor') THEN "course_users"."type" ELSE "excluded"."type" END)
returning "id"

-- MySQL
insert into `course_users` (`courseId`, `type`, `userId`) values (2, 'student', 1)
on duplicate key update
  `type` = (CASE WHEN (`course_users`.`type` = 'instructor') THEN `course_users`.`type` ELSE VALUES(`type`) END)
```

Combined with the expression methods, `fn.excluded()` adds to the existing value instead of replacing it:

```js
// Receive stock: insert the product, or add to its stock if the sku exists.
await Product.query()
  .insert({ sku: 'A-1', name: 'Tent', stock: 5 })
  .onConflict('sku')
  .merge({ stock: Product.ref('stock').plus(fn.excluded('stock')) });
```

```sql
-- postgres
insert into "products" ("name", "sku", "stock") values ('Tent', 'A-1', 5)
on conflict ("sku") do update set "stock" = ("products"."stock" + "excluded"."stock")
returning "id"
```

On SQLite, a product with `stock: 5` has `stock: 8` after an upsert with `stock: 3`. The model the query returns has the values that were passed to `insert()`, not the merged ones. See [Upserts](./knex.md#upserts) for how to get the stored row.

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

```js
// select "lessons".* from "lessons" where (1 = 0)
await Lesson.query().modify(forUsers, []); // []
await Lesson.query().modify(forUsers, []).resultSize(); // 0
```

On relation queries the owner condition is kept: `where "pets"."ownerId" in (1) and (1 = 0)`.
