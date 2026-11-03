import { Person } from './fixtures/person';
import type { Animal } from './fixtures/animal';
import type { ModelClass } from '../../';
import {
  Model,
  type NotFoundError,
  QueryBuilder,
  QueryBuilderBase,
  QueryBuilderOperation,
  Relation,
  RelationExpression,
  type ValidationError,
  knexIdentifierMapping,
  type Transaction,
} from '../../';
import type { Knex } from 'knex';
import { expectType } from './_utils/expect';

(async () => {
  const query = Person.query();
  const modelClass = query.modelClass();

  const persons: Person[] = await modelClass.query();
  const pets: Animal[] = await modelClass.relatedQuery('pets');
})();

(async () => {
  const modelClass: ModelClass<Person> = Person;

  const tableName: string = modelClass.tableName;
  const persons = await modelClass.query().where('firstName', 'Jennifer');
  const persons2: Person[] = await modelClass.fetchGraph(persons, 'pets');
})();

// Statics and instance methods that exist at runtime.

(async () => {
  class Concurrent extends Model {
    static concurrency = 4;
    static cloneObjectAttributes = false;
    static useAfterFindInGraphs = true;
  }

  class LazyConcurrency extends Model {
    static concurrency = () => 2;
  }

  const concurrency: number | (() => number) | null = Person.concurrency;
  const clone: boolean = Concurrent.cloneObjectAttributes;
  const afterFindInGraphs: boolean = Concurrent.useAfterFindInGraphs;
  const lazy: () => number = LazyConcurrency.concurrency;

  const person = Person.fromJson({ firstName: 'Jennifer' });
  const result = await person.$transaction(async (trx) => {
    expectType<Transaction>()(trx);
    return 1;
  });
  expectType<number>()(result);

  const result2 = await person.$transaction(Person.knex(), async () => 'done');
  expectType<string>()(result2);

  const mappers = knexIdentifierMapping({ first_name: 'firstName' });
  const wrapped: string = mappers.wrapIdentifier('firstName', (id) => id);

  const parsed: object = QueryBuilder.parseRelationExpression('[pets, children]');
})();

// knex() getters and setters, the error classes on Model and the runtime-only
// classes.
(async (knex: Knex) => {
  expectType<Knex>()(Person.knex());
  expectType<void>()(Person.knex(knex));

  const query = Person.query().where('firstName', 'Jennifer');
  expectType<typeof query>()(query.knex(knex));
  expectType<Knex>()(Person.query().knex());

  expectType<typeof NotFoundError>()(Person.NotFoundError);
  expectType<typeof ValidationError>()(Model.ValidationError);
  const notFound = new Person.NotFoundError({ modelClass: Person });
  const isValidation: boolean = notFound instanceof Model.ValidationError;

  Person.query().clear(QueryBuilderOperation).clear('where').clear(/order/);

  const expr = RelationExpression.create('[pets, children]');
  const exprString: string | null = expr.toString();
  const isSub: boolean = expr.isSubExpression('pets');

  const relation = Person.getRelation('pets');
  const isRelation: boolean = relation instanceof Relation;
  const isBase: boolean = (query as unknown) instanceof QueryBuilderBase;
})(Person.knex());
