// The custom query builder example of doc/fork/typescript.md. It must keep compiling.
import {
  type DefaultQueryBuilderState,
  Model,
  type ModelRow,
  QueryBuilder,
  type QueryBuilderState,
} from '../../../';
import { expectType } from '../_utils/expect';

class MyQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  declare '~rebind': MyQueryBuilder<this['~M'], this['~R'], this['~S']>;

  active(): this {
    return this.whereNull('deletedAt');
  }

  softDelete() {
    return this.patch<{ deletedAt: Date }>({ deletedAt: new Date() });
  }
}

class BaseModel extends Model {
  static QueryBuilder = MyQueryBuilder;
  declare QueryBuilderType: MyQueryBuilder<this>;
}

class Person extends BaseModel {
  static tableName = 'persons';

  id!: number;
  firstName!: string;
  deletedAt!: Date | null;
}

export async function customQueryBuilder() {
  const person = await Person.query().active().findById(1).active();
  expectType<ModelRow<Person> | undefined>()(person);

  const numDeleted = await Person.query().where('id', 1).softDelete();
  expectType<number>()(numDeleted);
}
