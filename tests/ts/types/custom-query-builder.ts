import {
  Model,
  QueryBuilder,
  AnyQueryBuilder,
  Page,
  QueryBuilderState,
  DefaultQueryBuilderState,
} from '../../../';
import { Equal, Expect, expectType } from '../_utils/expect';

// A custom query builder needs one line to keep its type through every method
// that changes the result kind.
class MyQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  declare '~rebind': MyQueryBuilder<this['~M'], this['~R'], this['~S']>;

  active(): this {
    return this.whereNull('deletedAt');
  }

  // Custom methods that change the result kind don't need casts either.
  softDelete() {
    return this.patch<{ deletedAt: Date }>({ deletedAt: new Date() });
  }

  firstActive() {
    return this.active().first();
  }
}

class BaseModel extends Model {
  static QueryBuilder = MyQueryBuilder;
  declare QueryBuilderType: MyQueryBuilder<this>;
}

class Pet extends BaseModel {
  id!: number;
  name!: string;
  owner?: Person;
}

class Person extends BaseModel {
  id!: number;
  firstName!: string;
  deletedAt?: Date | null;
  pets?: Pet[];
  mom?: Person;
}

async () => {
  // The custom query builder is kept for every result kind.
  expectType<Person[]>()(await Person.query().active());
  expectType<Person | undefined>()(await Person.query().active().first().active());
  expectType<Person | undefined>()(await Person.query().findById(1).active());
  expectType<Person | undefined>()(await Person.query().findOne({ firstName: 'a' }).active());
  expectType<Person>()(await Person.query().findById(1).throwIfNotFound().active());
  expectType<Person>()(await Person.query().active().first().throwIfNotFound().active());
  expectType<Person[]>()(await Person.query().active().throwIfNotFound().active());
  expectType<Page<Person>>()(await Person.query().active().page(0, 10).active());
  expectType<Page<Person>>()(await Person.query().active().range(0, 10).active());
  expectType<number>()(await Person.query().active().patch({ firstName: 'a' }).active());
  expectType<number>()(await Person.query().active().delete().active());
  expectType<Person[]>()(await Person.query().patch({ firstName: 'a' }).returning('*').active());
  expectType<Person | undefined>()(
    await Person.query().patch({ firstName: 'a' }).returning('*').first().active(),
  );
  expectType<Person>()(await Person.query().insert({ firstName: 'a' }).active());
  expectType<Person[]>()(
    await Person.query()
      .insert([{ firstName: 'a' }])
      .active(),
  );
  expectType<Person>()(await Person.query().patchAndFetchById(1, { firstName: 'a' }).active());
  expectType<number>()(await Person.query().softDelete());
  expectType<Person | undefined>()(await Person.query().firstActive());

  // Relation queries.
  const person = new Person();
  expectType<Pet[]>()(await person.$relatedQuery('pets').active());
  expectType<Pet | undefined>()(await person.$relatedQuery('pets').active().first().active());
  expectType<Pet[]>()(await Person.relatedQuery('pets').for(1).active());
  expectType<Person>()(await person.$query().active());

  // `castTo<T>()` sets the result type, and later result kind changes use it.
  expectType<{ count: number }[]>()(await Person.query().castTo<{ count: number }[]>().active());
  expectType<{ count: number } | undefined>()(
    await Person.query().castTo<{ count: number }[]>().first().active(),
  );
  expectType<{ count: number }>()(
    await Person.query().castTo<{ count: number }[]>().first().throwIfNotFound(),
  );

  // `castTo(ModelClass)` keeps the result kind and the query builder class.
  expectType<Pet | undefined>()(await Person.query().first().castTo(Pet).active());
  expectType<Pet[]>()(await Person.query().castTo(Pet).active());

  // `runAfter()` replaces the result with the callback's return value.
  expectType<string[]>()(
    await Person.query()
      .runAfter((people) => people.map((it) => it.firstName))
      .active(),
  );
  expectType<string | undefined>()(
    await Person.query()
      .runAfter((people) => people.map((it) => it.firstName))
      .first(),
  );
};

// Modifiers can be written for any result kind and used with all of them.
function forList(query: QueryBuilder<Person>) {
  query.select('id', 'firstName');
}

function byName(query: AnyQueryBuilder<Person>, name: string, exact: boolean) {
  query.where('firstName', exact ? '=' : 'like', name);
}

async () => {
  expectType<Person | undefined>()(await Person.query().findById(1).modify(forList));
  expectType<Person>()(
    await Person.query().findById(1).throwIfNotFound().modify(byName, 'Jennifer', true),
  );
  expectType<number>()(await Person.query().patch({ firstName: 'a' }).modify(forList));
  // The rest of the arguments are typed by the modifier.
  // @ts-expect-error
  Person.query().modify(byName, 'Jennifer');
  // @ts-expect-error
  Person.query().modify(byName, 1, true);
  // Inline modifiers get the query builder type.
  Person.query()
    .findById(1)
    .modify((qb) => {
      type _ = Expect<Equal<Awaited<typeof qb>, Person | undefined>>;
      qb.active();
    });
  // A modifier for another model can't be used.
  // @ts-expect-error
  Pet.query().modify(forList);
};

// Generic helpers that take and return query builders don't need casts.
function onlyActive<QB extends MyQueryBuilder<Model, any, any>>(query: QB): QB {
  return query.active();
}

function paginate<QB extends AnyQueryBuilder>(query: QB, page: number) {
  return query.limit(10).offset(page * 10);
}

async () => {
  expectType<Person | undefined>()(await onlyActive(Person.query().first()));
  expectType<Pet[]>()(await paginate(Pet.query().active(), 1).active());
};

// The type of `query()` comes from the static `QueryBuilder` property, which
// decides the query builder class at runtime. Declaring only `QueryBuilderType`
// doesn't give the static query methods the custom methods.
class ForgotStaticQueryBuilder extends Model {
  declare QueryBuilderType: MyQueryBuilder<this>;
}

// @ts-expect-error
ForgotStaticQueryBuilder.query().active();

// Modifiers typed for a subtype of the model (like a row type with computed
// columns) can be used too.
interface PersonWithPetCount extends Person {
  petCount: number;
}

function withPetCount(query: QueryBuilder<PersonWithPetCount>) {
  query.select(Person.relatedQuery('pets').count().as('petCount'));
}

Person.query().modify(withPetCount);
