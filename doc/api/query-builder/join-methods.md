# Join Methods

## joinRelated()

```js
queryBuilder = queryBuilder.joinRelated(relationExpression, opt);
```

Joins a set of relations described by `relationExpression`. See the examples for more info.

##### Arguments

| Argument           | Type                                                      | Description                                       |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------- |
| relationExpression | [RelationExpression](/api/types/#type-relationexpression) | An expression describing which relations to join. |
| opt                | object                                                    | Optional options. See the examples.               |

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

##### Examples

Join one relation:

```js
await Person.query()
  .joinRelated('pets')
  .where('pets.species', 'dog');
```

Give an alias for a single relation:

```js
await Person.query()
  .joinRelated('pets', { alias: 'p' })
  .where('p.species', 'dog');
```

Join two relations:

```js
await Person.query()
  .joinRelated('[pets, parent]')
  .where('pets.species', 'dog')
  .where('parent.name', 'Arnold');
```

You can also use the [object notation](/api/types/#relationexpression-object-notation)

```js
await Person.query()
  .joinRelated({
    pets: true,
    parent: true
  })
  .where('pets.species', 'dog')
  .where('parent.name', 'Arnold');
```

Join multiple nested relations. Note that when referring to nested relations `:` must be used as a separator instead of `.`. This limitation comes from the way knex parses table references.

```js
await Person.query()
  .select('persons.id', 'parent:parent.name as grandParentName')
  .joinRelated('[pets, parent.[pets, parent]]')
  .where('parent:pets.species', 'dog');
```

Give aliases for a bunch of relations:

```js
await Person.query()
  .select('persons.id', 'pr:pr.name as grandParentName')
  .joinRelated('[pets, parent.[pets, parent]]', {
    aliases: {
      parent: 'pr',
      pets: 'pt'
    }
  })
  .where('pr:pt.species', 'dog');
```

You can also give aliases using the relation expression:

```js
await Person.query()
  .select('persons.id', 'pr:pr.name as grandParentName')
  .joinRelated('[pets as pt, parent as pr.[pets as pt, parent as pr]]')
  .where('pr:pt.species', 'dog');
```

## innerJoinRelated()

Alias for [joinRelated](/api/query-builder/join-methods.html#joinrelated).

## outerJoinRelated()

Outer join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

It builds a bare `outer join`, which postgres, MySQL and SQLite reject. Use [leftOuterJoinRelated](/api/query-builder/join-methods.html#leftouterjoinrelated), or [fullOuterJoinRelated](/api/query-builder/join-methods.html#fullouterjoinrelated) on postgres and SQLite.

## leftJoinRelated()

Left join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## leftOuterJoinRelated()

Left outer join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## rightJoinRelated()

Right join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## rightOuterJoinRelated()

Right outer join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method.

## fullOuterJoinRelated()

Full outer join version of the [joinRelated](/api/query-builder/join-methods.html#joinrelated) method. MySQL doesn't support full outer joins.

## join()

See [knex documentation](https://knexjs.org/guide/query-builder.html#join)

The table can be a table name, a model class, an object like `{ parent: Person }` that gives the table an alias, or a subquery named with `as()`. See [Joins and model classes](/fork/joins.md#model-classes-in-place-of-table-names).

```js
await Person.query()
  .innerJoin(Pet, Pet.ref('ownerId'), Person.ref('id'))
  .leftJoin({ parent: Person }, 'parent.id', Person.ref('parentId'));
```

A join callback gets a join builder with knex's `on*` methods: `on()`, `andOn()`, `orOn()`, `onIn()`, `onNull()`, `onExists()`, `onBetween()`, their `and`, `or` and `not` variants, `onVal()`, `andOnVal()`, `orOnVal()`, `onJsonPathEquals()`, `andOnJsonPathEquals()`, `orOnJsonPathEquals()`, `using()` and `type()`. `ref()`, `Model.ref()` and the [expressions](/fork/expressions.md) work in them, and `join.on(a, b).or.on(c, d)` is the same as `join.on(a, b).orOn(c, d)`.

```js
await Person.query().join(Pet, (join) =>
  join
    .on(Pet.ref('ownerId'), Person.ref('id'))
    .andOnVal(Pet.ref('species'), 'dog'),
);
// select "persons".* from "persons"
// inner join "pets" on "pets"."ownerId" = "persons"."id" and "pets"."species" = 'dog'
```

See [`Model.ref()` in join callbacks](/fork/joins.md#model-ref-in-join-callbacks) and [`onJsonPathEquals()` in join callbacks](/fork/joins.md#onjsonpathequals-in-join-callbacks).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## joinRaw()

See [knex documentation](https://knexjs.org/guide/query-builder.html#joinraw)

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## innerJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#innerjoin)

Takes the same arguments as [join](/api/query-builder/join-methods.html#join).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## leftJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#leftjoin)

Takes the same arguments as [join](/api/query-builder/join-methods.html#join).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## leftOuterJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#leftouterjoin)

Takes the same arguments as [join](/api/query-builder/join-methods.html#join).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## rightJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#rightjoin)

Takes the same arguments as [join](/api/query-builder/join-methods.html#join).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## rightOuterJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#rightouterjoin)

Takes the same arguments as [join](/api/query-builder/join-methods.html#join).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## outerJoin()

Takes the same arguments as [join](/api/query-builder/join-methods.html#join).

knex builds a bare `outer join`, which postgres, MySQL and SQLite reject. Use [leftOuterJoin](/api/query-builder/join-methods.html#leftouterjoin), or [fullOuterJoin](/api/query-builder/join-methods.html#fullouterjoin) on postgres and SQLite.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## fullOuterJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#fullouterjoin)

Takes the same arguments as [join](/api/query-builder/join-methods.html#join). MySQL doesn't support full outer joins.

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |

## crossJoin()

See [knex documentation](https://knexjs.org/guide/query-builder.html#crossjoin)

Takes the same arguments as [join](/api/query-builder/join-methods.html#join).

##### Return value

| Type                                | Description                        |
| ----------------------------------- | ---------------------------------- |
| [QueryBuilder](/api/query-builder/) | `this` query builder for chaining. |
