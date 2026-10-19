import { Model } from '../../../';
import { expectType } from '../_utils/expect';
type Constructor<T> = new (...args: any[]) => T;
function TimeStamps() {
  return function <T extends Constructor<Model>>(model: T) {
    return class extends model {
      createdAt?: Date;
      $beforeInsert() {
        this.createdAt = new Date();
      }
    };
  };
}
class Plain extends Model {
  name!: string;
}
const Stamped = TimeStamps()(Plain);
// Plugins written as mixins keep the types of the model and its queries.
async () => {
  const row = await Stamped.query().first();
  expectType<string | undefined>()(row?.name);
  expectType<Date | undefined>()(row?.createdAt);
};

// The documented way to combine plugins with a custom query builder.
import { QueryBuilder, QueryBuilderState, DefaultQueryBuilderState } from '../../../';

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

function MixinMethodPlugin() {
  return function <T extends Constructor<BaseModel>>(Base: T) {
    return class extends Base {
      mixinMethod() {}
    };
  };
}

class Person extends MixinMethodPlugin()(BaseModel) {
  name!: string;
}

async () => {
  const people = await Person.query().someCustomMethod().where('foo', 1).someCustomMethod();
  people[0].mixinMethod();
  expectType<string>()(people[0].name);
  const person = await Person.query().someCustomMethod().first().someCustomMethod();
  person?.mixinMethod();
};
