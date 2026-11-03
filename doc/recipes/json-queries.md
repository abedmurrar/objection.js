# JSON queries

You can use the [ref](/api/objection/#ref) function from the main module to refer to json columns in queries. There is also a bunch of query building methods that have `Json` in their names. Check them out too.

See [FieldExpression](/api/types/#type-fieldexpression) for more information about how to refer to json fields.

JSON queries work on postgres, MySQL 8.0.17 or newer and MariaDB 10.6 or newer. On other databases, JSON field expressions and the `whereJson*` methods throw an error. See [MySQL](/fork/mysql.md#json-field-expressions) for the SQL they generate on MySQL.

```js
const { ref } = require('objection');

await Person.query()
  .select([
    'id',
    ref('jsonColumn:details.name')
      .castText()
      .as('name'),
    ref('jsonColumn:details.age')
      .castInt()
      .as('age')
  ])
  .join(
    'animals',
    ref('persons.jsonColumn:details.name').castText(),
    '=',
    ref('animals.name')
  )
  .where('age', '>', ref('animals.jsonData:details.ageLimit'));
```

Individual json fields can be updated like this. The other fields of the column are kept. The objects along the path must exist, since `jsonb_set()` and MySQL's `JSON_SET()` only add the last key of the path. A `NULL` column starts as an empty object, or an empty array when the path starts with an index:

```js
await Person.query().patch({
  'jsonColumn:details.name': 'Jennifer',
  'jsonColumn:details.age': 29
});
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
