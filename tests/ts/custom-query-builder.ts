import {
  Model,
  QueryBuilder,
  TransactionOrKnex,
  QueryBuilderState,
  DefaultQueryBuilderState,
} from '../../';

class CustomQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  declare '~rebind': CustomQueryBuilder<this['~M'], this['~R'], this['~S']>;

  someCustomMethod(): this {
    return this;
  }

  delete() {
    return super.delete();
  }
}

class BaseModel extends Model {
  static QueryBuilder = CustomQueryBuilder;
  declare QueryBuilderType: CustomQueryBuilder<this>;

  $query(trxOrKnex?: TransactionOrKnex) {
    return super.$query(trxOrKnex);
  }
}

class Animal extends BaseModel {
  id!: number;
  name!: string;
  owner!: Person;
}

class Person extends BaseModel {
  firstName!: string;
  pets!: Animal[];
}

const people: CustomQueryBuilder<Person, Person[]> = Person.query()
  .someCustomMethod()
  .where('firstName', 'lol')
  .someCustomMethod()
  .with('someAlias', (qb) => qb.someCustomMethod().from('lol').select('id'))
  .modifyGraph<Animal>('pets', (qb) => qb.someCustomMethod().where('id', 1).someCustomMethod());

const pets: CustomQueryBuilder<Animal, Animal | undefined> = new Person()
  .$relatedQuery('pets')
  .someCustomMethod()
  .where('id', 1)
  .first()
  .someCustomMethod();

const numUpdated: CustomQueryBuilder<Person, number> = Person.query()
  .someCustomMethod()
  .patch({ firstName: 'test' })
  .someCustomMethod();

const allPets: PromiseLike<Animal[]> = Person.relatedQuery('pets')
  .for(Person.query().select('id'))
  .someCustomMethod();
