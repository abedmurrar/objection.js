# Custom query builder (extending the query builder)

You can extend the [QueryBuilder](/api/query-builder/) returned by [query()](/api/model/static-methods.html#static-query), [relatedQuery()](/api/model/static-methods.html#static-relatedquery), [\$relatedQuery()](/api/model/instance-methods.html#relatedquery) and [\$query()](/api/model/instance-methods.html#query) methods (and all other methods that create a [QueryBuilder](/api/query-builder/)) by setting the model class's static [QueryBuilder](/api/model/static-methods.html#static-querybuilder) property.

```js
// MyQueryBuilder.js
const { QueryBuilder } = require('objection');

class MyQueryBuilder extends QueryBuilder {
  myCustomMethod(something) {
    doSomething(something);
    return this;
  }
}

// Person.js
const { MyQueryBuilder } = require('./MyQueryBuilder');

class Person extends Model {
  static get QueryBuilder() {
    return MyQueryBuilder;
  }
}
```

Now you can do this:

```js
const person = await Person.query().active().findById(1).active(); // Person | undefined
const numDeleted = await Person.query().where('id', 1).softDelete(); // number
```

## Typing functions that take query builders

Use `AnyQueryBuilder<M>` for parameters that should accept a query builder of any result kind, for example in modifiers. Modifiers passed to `modify()` can also be typed with `QueryBuilder<M>`: only the model type of the parameter is checked, and the rest of the arguments of `modify()` are checked against the modifier's parameters.

```ts
import { AnyQueryBuilder } from 'objection';

export function byName(query: AnyQueryBuilder<Person>, name: string) {
  query.where('firstName', name);
}

await Person.query().findById(1).modify(byName, 'Jennifer');
// Error: the second argument must be a string.
await Person.query().modify(byName, 1);
```

Generic functions that return the query builder they get don't need casts:

```ts
function paginate<QB extends AnyQueryBuilder>(query: QB, page: number): QB {
  return query.limit(10).offset(page * 10);
}
```

If you want to set the custom query builder for all model classes you can just set the [QueryBuilder](/api/model/static-methods.html#static-querybuilder) property of the [Model](/api/model/) base class. A cleaner option would be to create your own Model subclass, set its [QueryBuilder](/api/query-builder/) property and inherit all your models from the custom Model class.

```js
// BaseModel.js
const { MyQueryBuilder } = require('./MyQueryBuilder');

class BaseModel extends Model {
  static get QueryBuilder() {
    return MyQueryBuilder;
  }
}

// Person.js
const { BaseModel } = require('./BaseModel');

// Person now uses MyQueryBuilder
class Person extends BaseModel {}
```

Whenever a [QueryBuilder](/api/query-builder/) instance is created it is done by calling the static [query()](/api/model/static-methods.html#static-query) method. If you don't need to add methods, but simply modify the query, you can override the [query()](/api/model/static-methods.html#static-query).

```js
class BaseModel extends Model {
  static query(...args) {
    const query = super.query(...args);

    // Somehow modify the query.
    return query.runAfter((result) => {
      console.log(this.name, 'got result', result);
      return result;
    });
  }
}
```

::: tip
TIP: Consider using [modifiers](/recipes/modifiers.html#usage-in-a-query) instead of extending the query builder. You can often achieve the same flexibility with both.
:::

# Extending the query builder in typescript

A custom query builder class needs one extra line, the `'~rebind'` declaration. It tells the typings how to create the query builder type for other model and result types, so that your custom methods are kept after methods like `first()`, `findById()`, `throwIfNotFound()`, `patch()` and `page()`. You only need to set this up once for the shared `BaseModel`. If you don't already have one, it's time to create it.

```ts
import {
  Model,
  QueryBuilder,
  QueryBuilderState,
  DefaultQueryBuilderState,
} from 'objection';

class MyQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  // Copy-paste this and change the name of the class.
  declare '~rebind': MyQueryBuilder<this['~M'], this['~R'], this['~S']>;

  active(): this {
    return this.whereNull('deletedAt');
  }

  // Methods can call any query builder methods and the result types are
  // inferred. In generic code like this the model type isn't known, so pass
  // the type of the patch explicitly.
  softDelete() {
    return this.patch<{ deletedAt: Date }>({ deletedAt: new Date() });
  }
}

class BaseModel extends Model {
  // Both of these are needed. The static property decides the query builder
  // class at runtime and the types of the static query methods like `query()`
  // are based on it. `QueryBuilderType` is used for the instance methods like
  // `$query()` and `$relatedQuery()`.
  static QueryBuilder = MyQueryBuilder;
  declare QueryBuilderType: MyQueryBuilder<this>;
}
```

Now all models you inherit from `BaseModel` use `MyQueryBuilder` as a query builder.

```js
class Person extends BaseModel {
  static tableName = 'persons';
}

const person = await Person.query().active().findById(1).active(); // Person | undefined
const numDeleted = await Person.query().where('id', 1).softDelete(); // number
```

## Typing functions that take query builders

Use `AnyQueryBuilder<M>` for parameters that should accept a query builder of any result kind, for example in modifiers. Modifiers passed to `modify()` can also be typed with `QueryBuilder<M>`: only the model type of the parameter is checked, and the rest of the arguments of `modify()` are checked against the modifier's parameters.

```ts
import { AnyQueryBuilder } from 'objection';

export function byName(query: AnyQueryBuilder<Person>, name: string) {
  query.where('firstName', name);
}

await Person.query().findById(1).modify(byName, 'Jennifer');
// Error: the second argument must be a string.
await Person.query().modify(byName, 1);
```

Generic functions that return the query builder they get don't need casts:

```ts
function paginate<QB extends AnyQueryBuilder>(query: QB, page: number): QB {
  return query.limit(10).offset(page * 10);
}
```

::: tip
TIP: Consider using [modifiers](/recipes/modifiers.html#usage-in-a-query) instead of extending the query builder. You can often achieve the same flexibility with both.
:::
