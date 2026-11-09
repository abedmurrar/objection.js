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

  // The last operation that sets the table decides the default select.
  it('should build the table and select of the last of several from operations', () => {
    const sql = (query) => query.toKnexQuery().toString();

    expect(sql(Person.query(mockKnex).into('other').table('person'))).to.equal(
      'select "person".* from "person"',
    );
    expect(sql(Person.query(mockKnex).table('person').into('other'))).to.equal(
      'select * from "other"',
    );
    expect(sql(Person.query(mockKnex).where('a', 1).table('person').from('x'))).to.equal(
      'select "x".* from "x" where "a" = 1',
    );

    // A query whose summary is current when the second one is added.
    const query = Person.query(mockKnex).into('other');
    query.isFind();
    query.table('person');
    expect(sql(query)).to.equal('select "person".* from "person"');
  });

  it('should group where clauses only when they have a where scope', async () => {
    const person = Person.fromJson({ id: 1 });

    expect(Person.query(mockKnex).where('a', 1).orWhere('b', 2).needsWhereGrouping()).to.be(false);
    expect(person.$query(mockKnex).where('a', 1).orWhere('b', 2).toKnexQuery().toString()).to.equal(
      'select "person".* from "person" where "person"."id" = 1 and ("a" = 1 or "b" = 2)',
    );
  });

  it('should group where clauses only when there are two where scopes', async () => {
    const byId = Person.query(mockKnex).deleteById(1);
    const sql = byId.toKnexQuery().toString();

    // `findById` adds a `whereComposite` child when it is built. It is inside
    // `findById`, so it doesn't count as a second where operation.
    expect(byId.needsWhereGrouping()).to.be(false);
    expect(sql).to.equal('delete from "person" where "person"."id" = 1');

    const withOr = Person.query(mockKnex).deleteById(1).where('a', 1).orWhere('b', 2);
    expect(withOr.toKnexQuery().toString()).to.equal(
      'delete from "person" where "person"."id" = 1 and ("a" = 1 or "b" = 2)',
    );

    const person = Person.fromJson({ id: 1 });
    expect(
      person.$query(mockKnex).delete().where('a', 1).orWhere('b', 2).toKnexQuery().toString(),
    ).to.equal('delete from "person" where "person"."id" = 1 and ("a" = 1 or "b" = 2)');
  });

  describe('delete hooks', () => {
    it('should return synchronously without static hooks', async () => {
      const { DeleteOperation } = require('../../../lib/queryBuilder/operations/DeleteOperation');
      const op = new DeleteOperation('delete');
      const builder = Person.query(mockKnex);

      expect(op.onBefore2(builder, 'before')).to.equal('before');
      expect(op.onAfter2(builder, 'after')).to.equal('after');
    });

    it('should still run static hooks, and use the result of afterDelete', async () => {
      const calls = [];

      class Hooked extends Person {
        static async beforeDelete() {
          await null;
          calls.push('beforeDelete');
        }

        static afterDelete({ result }) {
          calls.push(`afterDelete ${result}`);
          return 'from afterDelete';
        }
      }

      const result = await Hooked.query(mockKnex).deleteById(1);

      expect(calls).to.eql(['beforeDelete', 'afterDelete ']);
      expect(executed).to.eql(['delete from "person" where "person"."id" = 1']);
      expect(result).to.equal('from afterDelete');
    });

    it('should keep the result when afterDelete returns nothing', async () => {
      class Hooked extends Person {
        static afterDelete() {}
      }

      expect(await Hooked.query(mockKnex).deleteById(1)).to.be(undefined);
    });

    it('should reject, not throw, when a static hook throws', async () => {
      class Hooked extends Person {
        static beforeDelete() {
          throw new Error('no deleting');
        }
      }

      const promise = Hooked.query(mockKnex).deleteById(1).execute();
      let error = null;

      try {
        await promise;
      } catch (err) {
        error = err;
      }

      expect(error.message).to.equal('no deleting');
      expect(executed).to.eql([]);
    });

    it('should still check deleteById(undefined) and offset()', async () => {
      let error = null;

      try {
        await Person.query(mockKnex).deleteById(undefined);
      } catch (err) {
        error = err;
      }

      expect(error.message).to.equal('undefined was passed to deleteById');
      expect(await Person.query(mockKnex).skipUndefined().deleteById(undefined)).to.be(undefined);

      error = null;

      try {
        await Person.query(mockKnex).delete().offset(5);
      } catch (err) {
        error = err;
      }

      expect(error.message).to.match(/^offset\(\) can't be used with a delete query/);
    });
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
