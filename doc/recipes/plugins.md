# Plugins

## TypeScript Example

```ts
export function Mixin(options = {}) {
  return function <T extends typeof Model>(Base: T) {
    return class extends Base {
      mixinMethod() {}
    };
  };
}

// Usage

class Person extends Model {}

const MixinPerson = Mixin(Person);

// Or as a decorator:

@Mixin
class Person extends Model {}
```

## TypeScript Example with Custom QueryBuilder

TypeScript gives the class returned by a mixin function the type `MixinClass & typeof Base`, so a custom query builder set in a mixin is intersected with the query builder of the base class, which TypeScript can't type check efficiently. Set custom query builders in a shared base class instead, and use mixins for everything else:

```ts
class CustomQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  declare '~rebind': CustomQueryBuilder<this['~M'], this['~R'], this['~S']>;

  someCustomMethod(): this {
    return this;
  }
}

class BaseModel extends Model {
  static QueryBuilder = CustomQueryBuilder;
  declare QueryBuilderType: CustomQueryBuilder<this>;
}

type Constructor<T> = new (...args: any[]) => T;

export function MixinMethodPlugin(options = {}) {
  return function <T extends Constructor<BaseModel>>(Base: T) {
    return class extends Base {
      mixinMethod() {}
    };
  };
}

// Usage

class Person extends MixinMethodPlugin()(BaseModel) {}

async () => {
  const z = await Person.query()
    .whereIn('id', [1, 2])
    .someCustomMethod()
    .where('foo', 1)
    .someCustomMethod();

  z[0].mixinMethod();
};
```
