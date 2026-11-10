const Knex = require('knex');
const expect = require('expect.js');
const { Model } = require('../../../');
const knexMocker = require('../../../testUtils/mockKnex');

// The write operations call the static and instance hooks through shared
// helpers that only return a promise when a hook does.
describe('static and instance hook calls', () => {
  let mockKnex;
  let executed;

  before(() => {
    mockKnex = knexMocker(Knex({ client: 'pg' }), function (mock, oldImpl, args) {
      executed.push(this.toString());
      const promise = Promise.resolve([{ id: 1 }]);
      return promise.then.apply(promise, args);
    });
  });

  beforeEach(() => {
    executed = [];
  });

  class Person extends Model {
    static tableName = 'person';
  }

  for (const [kind, write] of [
    ['find', (q) => q],
    ['insert', (q) => q.insert({ name: 'a' })],
    ['update', (q) => q.patch({ name: 'b' }).where('id', 1)],
    ['delete', (q) => q.delete().where('id', 1)],
  ]) {
    const Kind = kind[0].toUpperCase() + kind.slice(1);

    describe(kind, () => {
      it('should call the static hooks with the model class as `this`', async () => {
        const calls = [];

        class Hooked extends Person {
          static [`before${Kind}`]() {
            calls.push(['before', this === Hooked]);
          }

          static [`after${Kind}`]({ result }) {
            calls.push(['after', this === Hooked, Array.isArray(result)]);
          }
        }

        await write(Hooked.query(mockKnex));
        expect(calls).to.eql([
          ['before', true],
          ['after', true, true],
        ]);
      });

      it('should wait for async static hooks and use what an after hook returns', async () => {
        const calls = [];

        class Hooked extends Person {
          static async [`before${Kind}`]() {
            await null;
            calls.push('before');
          }

          static async [`after${Kind}`]() {
            await null;
            calls.push('after');
            return 'replaced';
          }
        }

        const result = await write(Hooked.query(mockKnex));
        expect(calls).to.eql(['before', 'after']);
        expect(result).to.equal('replaced');
        expect(executed).to.have.length(1);
      });

      it('should reject without running the query when a before hook throws', async () => {
        class Hooked extends Person {
          static [`before${Kind}`]() {
            throw new Error(`no ${kind}`);
          }
        }

        let error = null;

        try {
          await write(Hooked.query(mockKnex));
        } catch (err) {
          error = err;
        }

        expect(error.message).to.equal(`no ${kind}`);
        expect(executed).to.eql([]);
      });
    });
  }

  describe('without hooks', () => {
    const { InsertOperation } = require('../../../lib/queryBuilder/operations/InsertOperation');
    const { UpdateOperation } = require('../../../lib/queryBuilder/operations/UpdateOperation');

    it('should run the insert and update hooks synchronously', () => {
      const builder = Person.query(mockKnex);

      const insert = new InsertOperation('insert');
      insert.onAdd(builder, [{ name: 'a' }]);
      expect(insert.onBefore2(builder, 'before')).to.equal('before');
      expect(insert.onAfter2(builder, [insert.models[0]])).to.equal(insert.models[0]);

      const update = new UpdateOperation('patch', { modelOptions: { patch: true } });
      update.onAdd(builder, [{ name: 'b' }]);
      expect(update.onBefore2(builder, 'before')).to.equal('before');
      expect(update.onAfter2(builder, 1)).to.equal(1);
    });
  });

  describe('instance hooks of an update', () => {
    it('should run $beforeUpdate and $afterUpdate, waiting for async ones', async () => {
      const calls = [];

      class Hooked extends Person {
        async $beforeUpdate(opt) {
          await null;
          calls.push(['$beforeUpdate', opt.patch]);
        }

        $afterUpdate() {
          calls.push(['$afterUpdate']);
        }

        static beforeUpdate() {
          calls.push(['beforeUpdate']);
        }
      }

      await Hooked.query(mockKnex).patch({ name: 'b' }).where('id', 1);
      expect(calls).to.eql([['$beforeUpdate', true], ['beforeUpdate'], ['$afterUpdate']]);
    });

    it('should remove field expressions from the patched model after the hooks', async () => {
      let seenInHook = null;

      class Hooked extends Person {
        static afterUpdate({ inputItems }) {
          seenInHook = Object.keys(inputItems[0]);
        }
      }

      const person = Hooked.fromJson({ id: 1 });
      await person.$query(mockKnex).patch({ 'data:a': 1, name: 'x' });

      expect(seenInHook).to.contain('data:a');
      expect(Object.keys(person)).not.to.contain('data:a');
    });
  });
});
