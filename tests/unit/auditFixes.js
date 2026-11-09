const Knex = require('knex');
const expect = require('expect.js');
const { Model } = require('../../');
const { DelegateOperation } = require('../../lib/queryBuilder/operations/DelegateOperation');
const {
  QueryBuilderOperation,
} = require('../../lib/queryBuilder/operations/QueryBuilderOperation');
const knexMocker = require('../../testUtils/mockKnex');

describe('fixes found by the code audit of 2026-11-10', () => {
  describe('#ref{} after a graph with a missing reference', () => {
    let mockKnex;
    let executed;

    before(() => {
      mockKnex = knexMocker(Knex({ client: 'pg' }), function (mock, oldImpl, args) {
        executed.push({ sql: this.toSQL().sql, bindings: this.toSQL().bindings });
        const promise = Promise.resolve([{ id: executed.length }]);
        return promise.then.apply(promise, args);
      });
    });

    beforeEach(() => {
      executed = [];
    });

    class Person extends Model {
      static tableName = 'person';

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Person,
            join: { from: 'person.id', to: 'person.ownerId' },
          },
        };
      }
    }

    it('should resolve the references of the next graph', async () => {
      let error = null;

      try {
        await Person.query(mockKnex).insertGraph(
          { name: 'xxxxx #ref{missing.name}', pets: [] },
          { allowRefs: true },
        );
      } catch (err) {
        error = err;
      }

      expect(error.message).to.match(/^could not resolve reference missing/);

      // The first string searched after the failure is longer than the index
      // where that search stopped, and its reference comes before that index.
      const result = await Person.query(mockKnex).insertGraph(
        {
          pets: [
            { name: '#ref{rex.name} is a friend of the long string' },
            { '#id': 'rex', name: 'Rex' },
          ],
        },
        { allowRefs: true },
      );

      expect(result.pets[0].name).to.equal('Rex is a friend of the long string');
    });
  });

  describe('DelegateOperation.hasToFindOperation()', () => {
    class Delegate extends QueryBuilderOperation {}

    class OwnFind extends DelegateOperation {
      toFindOperation() {
        return null;
      }
    }

    it("should be true for a subclass that defines toFindOperation(), whatever the delegate's", () => {
      const op = new OwnFind('own', { delegate: new Delegate('delegate') });
      expect(op.delegate.hasToFindOperation()).to.be(false);
      expect(op.hasToFindOperation()).to.be(true);
    });

    it('should follow the delegate otherwise', () => {
      const op = new DelegateOperation('plain', { delegate: new Delegate('delegate') });
      expect(op.hasToFindOperation()).to.be(false);
    });
  });
});
