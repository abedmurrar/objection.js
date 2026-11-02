// The mixin example of doc/fork/typescript.md. It must keep compiling.
import { Model } from '../../../';
import { expectType } from '../_utils/expect';

// Model classes as mixin bases.
type Constructor<T> = new (...args: any[]) => T;

function TimeStamps() {
  return function <T extends Constructor<Model>>(Base: T) {
    return class extends Base {
      createdAt?: Date;

      $beforeInsert() {
        this.createdAt = new Date();
      }
    };
  };
}

class Person extends TimeStamps()(Model) {
  static tableName = 'persons';

  name!: string;
}

export async function mixins() {
  const row = await Person.query().where('name', 'Jennifer').first();
  expectType<string | undefined>()(row?.name);
  expectType<Date | undefined>()(row?.createdAt);
}
