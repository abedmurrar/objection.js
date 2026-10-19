const Knex = require('knex');
const expect = require('expect.js');
const { Model } = require('../../../');
const mockKnexFactory = require('../../../testUtils/mockKnex');

describe('QueryBuilder for()', () => {
  let executedQueries = [];
  let mockKnex = null;
  let Person = null;
  let Pet = null;
  let hookCalls = [];

  before(() => {
    const knex = Knex({ client: 'pg' });

    mockKnex = mockKnexFactory(knex, function (mock, oldImpl, args) {
      executedQueries.push(this.toString());
      const promise = Promise.resolve([]);
      return promise.then.apply(promise, args);
    });
  });

  beforeEach(() => {
    executedQueries = [];
    hookCalls = [];

    Pet = class Pet extends Model {
      static get tableName() {
        return 'pets';
      }

      static beforeDelete() {
        hookCalls.push('beforeDelete');
      }

      static beforeUpdate() {
        hookCalls.push('beforeUpdate');
      }

      static beforeInsert() {
        hookCalls.push('beforeInsert');
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
            join: {
              from: 'persons.id',
              to: 'pets.ownerId',
            },
          },
        };
      }
    };

    Person.knex(mockKnex);
    Pet.knex(mockKnex);
  });

  const writes = {
    insert: (qb) => qb.insert({ name: 'Doggo' }),
    update: (qb) => qb.update({ name: 'Doggo' }),
    patch: (qb) => qb.patch({ name: 'Doggo' }),
    delete: (qb) => qb.delete(),
    increment: (qb) => qb.increment('age', 1),
    relate: (qb) => qb.relate(1),
    unrelate: (qb) => qb.unrelate(),
  };

  async function expectRejection(query, message) {
    let error = null;

    try {
      await query;
    } catch (err) {
      error = err;
    }

    expect(error).to.be.an(Error);
    expect(error.message).to.contain(message);
    expect(executedQueries).to.eql([]);
    expect(hookCalls).to.eql([]);
  }

  describe('outside relatedQuery()', () => {
    it('should reject a find query', async () => {
      await expectRejection(Pet.query().for(1), 'for() can only be used with queries created');
    });

    for (const name of ['insert', 'update', 'patch', 'delete', 'increment']) {
      it(`should reject ${name}, for() called before`, async () => {
        await expectRejection(
          writes[name](Pet.query().for(1)),
          'for() can only be used with queries created',
        );
      });

      it(`should reject ${name}, for() called after`, async () => {
        await expectRejection(
          writes[name](Pet.query()).for(1),
          'for() can only be used with queries created',
        );
      });
    }

    it('should reject $query()', async () => {
      await expectRejection(
        Pet.fromJson({ id: 1 }).$query().for(2).patch({ name: 'Doggo' }),
        'for() can only be used with queries created',
      );
    });

    it('should throw from toKnexQuery()', () => {
      expect(() => Pet.query().for(1).delete().toKnexQuery()).to.throwException(
        /for\(\) can only be used with queries created/,
      );
    });

    it('should reject when used as a subquery', async () => {
      await expectRejection(
        Person.query().whereIn('id', Pet.query().select('ownerId').for(1)),
        'for() can only be used with queries created',
      );
    });

    it('should be kept by clone()', () => {
      expect(() => Pet.query().for(1).clone().toKnexQuery()).to.throwException(
        /for\(\) can only be used with queries created/,
      );
    });
  });

  describe('relatedQuery()', () => {
    it('should work for a find query', async () => {
      await Person.relatedQuery('pets').for(1).where('name', 'Doggo');

      expect(executedQueries).to.eql([
        `select "pets".* from "pets" where "pets"."ownerId" in (1) and "name" = 'Doggo'`,
      ]);
    });

    it('should work when for() is called before a write method', async () => {
      await Person.relatedQuery('pets').for(1).delete().where('name', 'Doggo');

      expect(executedQueries).to.eql([
        `delete from "pets" where "pets"."ownerId" in (1) and "name" = 'Doggo'`,
      ]);
    });

    for (const name of Object.keys(writes)) {
      it(`should reject ${name} without for()`, async () => {
        await expectRejection(
          writes[name](Person.relatedQuery('pets')),
          `relatedQuery(): for() must be called before`,
        );
      });

      it(`should reject ${name} with for() called after it`, async () => {
        await expectRejection(
          writes[name](Person.relatedQuery('pets')).for(1),
          'for() must be called before',
        );
      });

      it(`should reject ${name} with for(undefined)`, async () => {
        await expectRejection(
          writes[name](Person.relatedQuery('pets').for(undefined)),
          `relatedQuery(): for() must be called before`,
        );
      });
    }

    it('should reject when the owner is changed after a write method', async () => {
      await expectRejection(
        Person.relatedQuery('pets').for(1).delete().for(2),
        'for() must be called before the write methods',
      );
    });

    it('should work without for() as a subquery', async () => {
      await Person.query().select(Person.relatedQuery('pets').count().as('petCount'));

      expect(executedQueries).to.eql([
        `select (select count(*) from "pets" where "pets"."ownerId" = "persons"."id") as "petCount" from "persons"`,
      ]);
    });

    it('should allow changing the owner of a $relatedQuery() find', async () => {
      await Person.fromJson({ id: 1 }).$relatedQuery('pets').for(2);

      expect(executedQueries).to.eql([`select "pets".* from "pets" where "pets"."ownerId" in (2)`]);
    });
  });
});
