const Knex = require('knex');
const expect = require('expect.js');
const { Model, QueryBuilderOperation } = require('../../../');
const knexMocker = require('../../../testUtils/mockKnex');

// A query keeps a summary of its operations (their hooks, and whether one is a
// write, insert, find or eager operation) instead of walking them for every
// question. These tests change the operations in the ways that must update it.
describe('operations summary', () => {
  let mockKnex;
  let executed;
  let Person;

  before(() => {
    mockKnex = knexMocker(Knex({ client: 'pg' }), function (mock, oldImpl, args) {
      executed.push(this.toString());
      const promise = Promise.resolve([]);
      return promise.then.apply(promise, args);
    });
  });

  beforeEach(() => {
    executed = [];

    Person = class Person extends Model {
      static tableName = 'person';
    };
  });

  class RecordingOperation extends QueryBuilderOperation {
    constructor(name, opt) {
      super(name, opt);
      this.calls = opt.calls;
    }

    onBefore1(builder) {
      this.calls.push('onBefore1');

      // An operation that a hook adds takes part in the next phases.
      builder.addOperation(new AddedOperation('added', { calls: this.calls }), []);
    }
  }

  class AddedOperation extends QueryBuilderOperation {
    constructor(name, opt) {
      super(name, opt);
      this.calls = opt.calls;
    }

    onBefore2() {
      this.calls.push('added onBefore2');
    }

    onAfter3(builder, result) {
      this.calls.push('added onAfter3');
      return result;
    }
  }

  it('should run the hooks of an operation that an earlier phase added', async () => {
    const calls = [];
    const query = Person.query(mockKnex);

    query.addOperation(new RecordingOperation('recording', { calls }), []);
    await query;

    expect(calls).to.eql(['onBefore1', 'added onBefore2', 'added onAfter3']);
  });

  it('should notice a write operation added after the query was checked', async () => {
    const query = Person.query(mockKnex).where('id', 1);

    expect(query.isFind()).to.be(true);
    query.delete();
    expect(query.isFind()).to.be(false);
    expect(query.isDelete()).to.be(true);

    await query;
    expect(executed).to.eql(['delete from "person" where "id" = 1']);
  });

  it('should notice cleared operations', async () => {
    const query = Person.query(mockKnex).insert({ name: 'a' });

    expect(query.isInsert()).to.be(true);
    query.clear('insert');
    expect(query.isInsert()).to.be(false);
    expect(query.isFind()).to.be(true);
  });

  it('should notice a removed eager operation', () => {
    Person.relationMappings = {
      parent: {
        relation: Model.BelongsToOneRelation,
        modelClass: Person,
        join: { from: 'person.parentId', to: 'person.id' },
      },
    };

    const query = Person.query(mockKnex).withGraphFetched('parent');

    expect(query.hasWithGraph()).to.be(true);
    query.clearWithGraph();
    expect(query.hasWithGraph()).to.be(false);
  });

  it('should give the same SQL for a query and its clone, executed twice', async () => {
    const query = Person.query(mockKnex).where('age', '>', 20).orderBy('name');
    const clone = query.clone();

    await query;
    await query;
    await clone;

    expect(executed).to.have.length(3);
    expect(new Set(executed).size).to.equal(1);
    expect(query.toKnexQuery().toString()).to.equal(executed[0]);
  });

  it('should use the hooks that an operation answers itself', async () => {
    const calls = [];

    class AskingOperation extends QueryBuilderOperation {
      onAfter2(builder, result) {
        calls.push('onAfter2');
        return result;
      }

      // Says it has no `onAfter2` hook, although it defines one.
      hasOnAfter2() {
        return false;
      }
    }

    await Person.query(mockKnex).addOperation(new AskingOperation('asking'), []);
    expect(calls).to.eql([]);
  });
});
