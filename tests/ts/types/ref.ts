import { Model, ReferenceBuilder } from '../../../';
import { expectType } from '../_utils/expect';

interface Address {
  street: string;
  city?: { name: string };
}

class Person extends Model {
  static tableName = 'persons';

  id!: number;
  firstName!: string;
  address?: Address | null;
  tags!: string[];
  meta!: Record<string, unknown>;
  data: any;
  createdAt!: Date;

  static relationMappings = () => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'persons.id', to: 'pets.ownerId' },
    },
  });

  fullName() {
    return this.firstName;
  }
}

class Pet extends Model {
  static tableName = 'pets';

  id!: number;
  ownerId!: number;
}

class Untyped extends Model {
  static tableName = 'untyped';
}

// Columns, optionally qualified with a table or an alias.
expectType<ReferenceBuilder<number>>()(Person.ref('id'));
expectType<ReferenceBuilder<string>>()(Person.ref('firstName'));
expectType<ReferenceBuilder<number>>()(Person.ref('p.id'));
expectType<ReferenceBuilder<Date>>()(Person.ref('createdAt'));

// Fields of JSON columns. The first key is checked when the column type has known keys.
expectType<ReferenceBuilder<unknown>>()(Person.ref('address:street'));
Person.ref('address:city.name');
Person.ref('address:[city]');
Person.ref('p.address:street');
Person.ref('tags:[0]');
Person.ref('tags:0');
Person.ref('meta:anything.goes');
Person.ref('data:anything');

// Casts set the value type.
expectType<ReferenceBuilder<string | null>>()(Person.ref('address:street').castText());
expectType<ReferenceBuilder<number | null>>()(Person.ref('address:street').castInt());
expectType<ReferenceBuilder<Date>>()(Person.ref('id').castTo<Date>('date'));

// Columns the model doesn't declare need the expression as a type argument.
Person.ref<'legacy_column'>('legacy_column');

// Models that declare no columns accept any expression.
Untyped.ref('anything');

// @ts-expect-error unknown column
Person.ref('lastName');
// @ts-expect-error relations aren't columns
Person.ref('pets');
// @ts-expect-error methods aren't columns
Person.ref('fullName');
// @ts-expect-error unknown key of a JSON column
Person.ref('address:zip');
// @ts-expect-error only JSON columns have fields
Person.ref('firstName:a');
// @ts-expect-error Date isn't a JSON column
Person.ref('createdAt:a');

// The columns of a generic model class aren't known, so generic code passes `<string>`.
function idRef<MC extends typeof Model>(modelClass: MC) {
  return modelClass.ref<string>('id');
}

idRef(Person);

// Fields of JSON columns can be patched one at a time.
async () => {
  await Person.query().patch({ 'address:street': 'Main street', firstName: 'Jennifer' });
  await Person.query().update({ 'meta:a.b': 1 }).where('id', 1);
  await Person.query().findById(1).patch({ 'tags:[0]': 'first' });
  await Person.query().insert({ firstName: 'a' }).onConflict('id').merge({ 'meta:a': 1 });
  // @ts-expect-error firstName isn't a JSON column
  await Person.query().patch({ 'firstName:a': 1 });
  // @ts-expect-error field expressions aren't supported by insert
  await Person.query().insert({ 'meta:a': 1 });
};

// All columns.
Person.ref('*');

// Subqueries as values.
async () => {
  await Person.query().patch({ firstName: Person.query().select('firstName').limit(1) });
};
