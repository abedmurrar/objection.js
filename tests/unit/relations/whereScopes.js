const Knex = require('knex');
const expect = require('expect.js');
const { Model, raw } = require('../../../');
const mockKnexFactory = require('../../../testUtils/mockKnex');

// Where clauses added by objection (relation owner conditions, relation filters,
// id conditions) must not be affected by the user's `orWhere` calls and the other
// way around.
describe('where scopes', () => {
  let executedQueries = [];
  let mockKnex = null;
  let Person = null;
  let Pet = null;
  let Movie = null;
  let person = null;

  before(() => {
    mockKnex = mockKnexFactory(Knex({ client: 'pg' }), function (mock, oldImpl, args) {
      executedQueries.push(this.toString());
      const promise = Promise.resolve([]);
      return promise.then.apply(promise, args);
    });
  });

  beforeEach(() => {
    executedQueries = [];

    Pet = class Pet extends Model {
      static get tableName() {
        return 'pets';
      }
    };

    Movie = class Movie extends Model {
      static get tableName() {
        return 'movies';
      }
    };

    Person = class Person extends Model {
      static get tableName() {
        return 'persons';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'persons.id', to: 'pets.ownerId' },
          },
          dogs: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            filter: (qb) => qb.where('species', 'dog').orWhere('species', 'wolf'),
            join: { from: 'persons.id', to: 'pets.ownerId' },
          },
          mom: {
            relation: Model.BelongsToOneRelation,
            modelClass: Person,
            join: { from: 'persons.momId', to: 'persons.id' },
          },
          movies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: 'persons.id',
              through: { from: 'pm.personId', to: 'pm.movieId', extra: ['role'] },
              to: 'movies.id',
            },
          },
          leadMovies: {
            relation: Model.ManyToManyRelation,
            modelClass: Movie,
            join: {
              from: 'persons.id',
              through: {
                from: 'pm.personId',
                to: 'pm.movieId',
                extra: ['role'],
                modify: (qb) => qb.where('role', 'lead').orWhere('role', 'star'),
              },
              to: 'movies.id',
            },
          },
          firstMovie: {
            relation: Model.HasOneThroughRelation,
            modelClass: Movie,
            join: {
              from: 'persons.id',
              through: { from: 'pm.personId', to: 'pm.movieId' },
              to: 'movies.id',
            },
          },
        };
      }
    };

    Person.knex(mockKnex);
    Pet.knex(mockKnex);
    Movie.knex(mockKnex);

    person = Person.fromJson({ id: 1, momId: 2 });
  });

  const aOrB = (qb) => qb.where('a', 1).orWhere('b', 2);

  async function expectQueries(query, expected) {
    await query;
    expect(executedQueries).to.eql(expected);
  }

  describe('HasManyRelation', () => {
    it('find', () =>
      expectQueries(aOrB(person.$relatedQuery('pets')), [
        'select "pets".* from "pets" where "pets"."ownerId" in (1) and ("a" = 1 or "b" = 2)',
      ]));

    it('delete', () =>
      expectQueries(aOrB(person.$relatedQuery('pets').delete()), [
        'delete from "pets" where "pets"."ownerId" in (1) and ("a" = 1 or "b" = 2)',
      ]));

    it('patch', () =>
      expectQueries(aOrB(person.$relatedQuery('pets').patch({ name: 'x' })), [
        `update "pets" set "name" = 'x' where "pets"."ownerId" in (1) and ("a" = 1 or "b" = 2)`,
      ]));

    it('update', () =>
      expectQueries(aOrB(person.$relatedQuery('pets').update({ name: 'x' })), [
        `update "pets" set "name" = 'x' where "pets"."ownerId" in (1) and ("a" = 1 or "b" = 2)`,
      ]));

    it('relate', () =>
      expectQueries(aOrB(person.$relatedQuery('pets').relate(5)), [
        'update "pets" set "ownerId" = 1 where ("a" = 1 or "b" = 2) and "pets"."id" in (5)',
      ]));

    it('unrelate', () =>
      expectQueries(aOrB(person.$relatedQuery('pets').unrelate()), [
        'update "pets" set "ownerId" = NULL where ("a" = 1 or "b" = 2) and "pets"."ownerId" in (1)',
      ]));

    it('filter with orWhere', () =>
      expectQueries(person.$relatedQuery('dogs').delete(), [
        `delete from "pets" where "pets"."ownerId" in (1) and ("species" = 'dog' or "species" = 'wolf')`,
      ]));

    it('filter and user wheres with orWhere', () =>
      expectQueries(aOrB(person.$relatedQuery('dogs')), [
        `select "pets".* from "pets" where "pets"."ownerId" in (1) and ("species" = 'dog' or "species" = 'wolf') and ("a" = 1 or "b" = 2)`,
      ]));
  });

  describe('BelongsToOneRelation', () => {
    it('find', () =>
      expectQueries(aOrB(person.$relatedQuery('mom')), [
        'select "persons".* from "persons" where "persons"."id" in (2) and ("a" = 1 or "b" = 2)',
      ]));

    it('patch', () =>
      expectQueries(aOrB(person.$relatedQuery('mom').patch({ name: 'x' })), [
        `update "persons" set "name" = 'x' where "persons"."id" in (2) and ("a" = 1 or "b" = 2)`,
      ]));

    it('delete', () =>
      expectQueries(aOrB(person.$relatedQuery('mom').delete()), [
        'delete from "persons" where "persons"."id" in (2) and ("a" = 1 or "b" = 2)',
      ]));

    it('unrelate', () =>
      expectQueries(aOrB(person.$relatedQuery('mom').unrelate()), [
        'update "persons" set "momId" = NULL where "persons"."id" in (1) and exists (select "mom".* from "persons" as "mom" where "mom"."id" = "persons"."momId" and ("a" = 1 or "b" = 2))',
      ]));
  });

  describe('ManyToManyRelation', () => {
    const filter =
      'select "movies"."id" from "movies" inner join "pm" on "movies"."id" = "pm"."movieId" where "pm"."personId" in (1) and ("a" = 1 or "b" = 2)';

    it('find', () =>
      expectQueries(aOrB(person.$relatedQuery('movies')), [
        'select "movies".*, "pm"."role" as "role" from "movies" inner join "pm" on "movies"."id" = "pm"."movieId" where "pm"."personId" in (1) and ("a" = 1 or "b" = 2)',
      ]));

    it('delete', () =>
      expectQueries(aOrB(person.$relatedQuery('movies').delete()), [
        `delete from "movies" where "movies"."id" in (${filter})`,
      ]));

    it('patch with join table extras', () =>
      expectQueries(aOrB(person.$relatedQuery('movies').patch({ name: 'x', role: 'r' })), [
        `update "movies" set "name" = 'x' where "movies"."id" in (${filter})`,
        `update "pm" set "role" = 'r' where "pm"."movieId" in (${filter}) and "pm"."personId" in (1)`,
      ]));

    it('unrelate', () =>
      expectQueries(aOrB(person.$relatedQuery('movies').unrelate()), [
        `delete from "pm" where "pm"."movieId" in (${filter}) and "pm"."personId" in (1)`,
      ]));

    it('join table modify with orWhere', () =>
      expectQueries(person.$relatedQuery('leadMovies').unrelate(), [
        `delete from "pm" where "pm"."movieId" in (select "movies"."id" from "movies" inner join (select "pm".* from "pm" where "role" = 'lead' or "role" = 'star') as "pm" on "movies"."id" = "pm"."movieId" where "pm"."personId" in (1)) and "pm"."personId" in (1) and ("role" = 'lead' or "role" = 'star')`,
      ]));
  });

  describe('HasOneThroughRelation', () => {
    it('find', () =>
      expectQueries(aOrB(person.$relatedQuery('firstMovie')), [
        'select "movies".* from "movies" inner join "pm" on "movies"."id" = "pm"."movieId" where "pm"."personId" in (1) and ("a" = 1 or "b" = 2)',
      ]));

    it('delete', () =>
      expectQueries(aOrB(person.$relatedQuery('firstMovie').delete()), [
        'delete from "movies" where "movies"."id" in (select "movies"."id" from "movies" inner join "pm" on "movies"."id" = "pm"."movieId" where "pm"."personId" in (1) and ("a" = 1 or "b" = 2))',
      ]));
  });

  describe('raw sql', () => {
    it('whereRaw', () =>
      expectQueries(person.$relatedQuery('pets').whereRaw('a = 1 or b = 2'), [
        'select "pets".* from "pets" where "pets"."ownerId" in (1) and (a = 1 or b = 2)',
      ]));

    it('raw value', () =>
      expectQueries(person.$relatedQuery('pets').where('a', raw('1 or 1 = 1')), [
        'select "pets".* from "pets" where "pets"."ownerId" in (1) and ("a" = 1 or 1 = 1)',
      ]));
  });

  it('static relatedQuery() as a subquery (#1909)', () =>
    expectQueries(Person.query().select(aOrB(Person.relatedQuery('pets')).count().as('c')), [
      'select (select count(*) from "pets" where "pets"."ownerId" = "persons"."id" and ("a" = 1 or "b" = 2)) as "c" from "persons"',
    ]));

  describe('id conditions', () => {
    it('$query()', () =>
      expectQueries(aOrB(person.$query()), [
        'select "persons".* from "persons" where "persons"."id" = 1 and ("a" = 1 or "b" = 2)',
      ]));

    it('$query().patch()', () =>
      expectQueries(aOrB(person.$query().patch({ name: 'x' })), [
        `update "persons" set "name" = 'x' where "persons"."id" = 1 and ("a" = 1 or "b" = 2)`,
      ]));

    it('$query().delete()', () =>
      expectQueries(aOrB(person.$query().delete()), [
        'delete from "persons" where "persons"."id" = 1 and ("a" = 1 or "b" = 2)',
      ]));

    it('deleteById()', () =>
      expectQueries(aOrB(Person.query().deleteById(1)), [
        'delete from "persons" where "persons"."id" = 1 and ("a" = 1 or "b" = 2)',
      ]));

    it('patchAndFetchById()', () =>
      expectQueries(aOrB(Person.query().patchAndFetchById(1, { name: 'x' })), [
        `update "persons" set "name" = 'x' where "persons"."id" = 1 and ("a" = 1 or "b" = 2)`,
      ]));

    it("the user's own findById() is not grouped", () =>
      expectQueries(Person.query().findById(1).orWhere('slug', 'x'), [
        `select "persons".* from "persons" where "persons"."id" = 1 or "slug" = 'x'`,
      ]));
  });

  describe('unchanged sql', () => {
    it('queries without objection generated wheres', () =>
      expectQueries(aOrB(Person.query()), [
        'select "persons".* from "persons" where "a" = 1 or "b" = 2',
      ]));

    it('queries with only and-joined wheres', () =>
      expectQueries(
        person.$relatedQuery('pets').where('a', 1).whereIn('b', [1, 2]).whereNotNull('c'),
        [
          'select "pets".* from "pets" where "pets"."ownerId" in (1) and "a" = 1 and "b" in (1, 2) and "c" is not null',
        ],
      ));

    it('where callbacks', () =>
      expectQueries(
        person.$relatedQuery('pets').where((qb) => qb.where('a', 1).orWhere('b', 2)),
        ['select "pets".* from "pets" where "pets"."ownerId" in (1) and ("a" = 1 or "b" = 2)'],
      ));
  });

  it('should produce the same sql when built multiple times and cloned', async () => {
    const query = aOrB(person.$relatedQuery('pets').delete());
    const sql = query.toKnexQuery().toString();

    expect(query.toKnexQuery().toString()).to.equal(sql);
    expect(query.clone().toKnexQuery().toString()).to.equal(sql);

    const knexQuery = query.toKnexQuery();
    expect(knexQuery.toString()).to.equal(knexQuery.toString());

    await query;
    expect(executedQueries).to.eql([sql]);
  });

  it('asFindQuery() in static hooks should use the same grouping', async () => {
    let findSql = null;

    Pet.afterDelete = ({ asFindQuery }) => {
      findSql = asFindQuery().toKnexQuery().toString();
    };

    await aOrB(person.$relatedQuery('pets').delete());

    expect(findSql).to.equal(
      'select "pets".* from "pets" where "pets"."ownerId" in (1) and ("a" = 1 or "b" = 2)',
    );
  });
});
