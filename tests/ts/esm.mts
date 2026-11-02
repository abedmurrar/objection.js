// The types of the ES module entry: `import` resolves to index.d.mts.
import objection, {
  Model,
  ref,
  raw,
  type ModelObject,
  type RelationMappings,
} from '@abedmurrar/objection';
import { type Equal, type Expect, expectType } from './_utils/expect.js';

class Person extends Model {
  id!: number;
  firstName!: string;

  static override tableName = 'persons';
  static override relationMappings: RelationMappings = {};
}

type _SameModel = Expect<Equal<typeof objection.Model, typeof Model>>;

async function esm() {
  expectType<Person[]>()(await Person.query().where(ref('firstName'), 'Jennifer').select(raw('1')));

  const json: ModelObject<Person> = { id: 1, firstName: 'Jennifer' };
  void json;
}

void esm;
