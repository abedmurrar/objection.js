const expect = require('expect.js');
const { Model, DBError, transaction } = require('../..');

module.exports = (session) => {
  const { Model1, Model2 } = session.models;

  async function collect(builder) {
    const models = [];

    for await (const model of builder.stream()) {
      models.push(model);
    }

    return models;
  }

  async function streamError(builder) {
    try {
      await collect(builder);
    } catch (err) {
      return err;
    }

    throw new Error('stream() should have thrown');
  }

  describe('stream()', () => {
    beforeEach(() => {
      return session.populate([
        {
          id: 1,
          model1Prop1: 'hello 1',
          model1Relation2: [
            { idCol: 1, model2Prop1: 'hejsan 1', model2Prop2: 30 },
            { idCol: 2, model2Prop1: 'hejsan 2', model2Prop2: 20 },
            { idCol: 3, model2Prop1: 'hejsan 3', model2Prop2: 10 },
          ],
          model1Relation3: [{ idCol: 4, model2Prop1: 'hejsan 4', model2Prop2: 5 }],
        },
        { id: 2, model1Prop1: 'hello 2' },
        { id: 3, model1Prop1: 'hello 3' },
        { id: 4, model1Prop1: 'hello 4' },
        { id: 5, model1Prop1: 'hello 5' },
      ]);
    });

    it('should yield the same models as executing the query', async () => {
      const query = Model1.query().where('id', '>', 1).orderBy('id', 'desc');
      const streamed = await collect(query);
      const executed = await query;

      expect(streamed).to.have.length(4);
      expect(streamed.every((it) => it instanceof Model1)).to.equal(true);
      expect(streamed.map((it) => it.toJSON())).to.eql(executed.map((it) => it.toJSON()));
    });

    it('should call $afterFind() for each model before yielding it', async () => {
      // Half of the `$afterFind()` calls of the test models wait for a timer.
      for await (const model of Model1.query().orderBy('id').stream()) {
        expect(model.$afterFindCalled).to.equal(1);
      }
    });

    it("should leave the query it's called on unchanged", async () => {
      const query = Model1.query().where('id', '<', 3).orderBy('id');
      await collect(query);

      const models = await query;
      expect(models.map((it) => [it.id, it.$afterFindCalled])).to.eql([
        [1, 1],
        [2, 1],
      ]);
    });

    it('should skip $afterFind() with findOptions({ dontCallFindHooks: true })', async () => {
      const models = await collect(
        Model1.query().findOptions({ dontCallFindHooks: true }).orderBy('id'),
      );

      expect(models).to.have.length(5);
      expect(models.every((it) => it.$afterFindCalled === undefined)).to.equal(true);
    });

    it('should map the column names of each row', async () => {
      const models = await collect(Model2.query().orderBy('id_col'));

      expect(models.map((it) => it.idCol)).to.eql([1, 2, 3, 4]);
      expect(models[0].model2Prop1).to.equal('hejsan 1');
      expect(models[0].model1Id).to.equal(1);
      expect(models[0]).not.to.have.property('model2_prop1');
    });

    it('should work with select(), joinRelated(), modify() and castTo()', async () => {
      class Plain extends Model {}

      const models = await collect(
        Model1.query()
          .select('Model1.id', 'model1Relation2.model2_prop1 as relProp')
          .joinRelated('model1Relation2')
          .modify('orderById')
          .orderBy('relProp')
          .castTo(Plain),
      );

      expect(models.map((it) => [it.id, it.relProp])).to.eql([
        [1, 'hejsan 1'],
        [1, 'hejsan 2'],
        [1, 'hejsan 3'],
      ]);
      expect(models[0]).to.be.a(Plain);
    });

    it('should stream the related models of the static relatedQuery()', async () => {
      const models = await collect(Model1.relatedQuery('model1Relation2').for(1).orderBy('id_col'));

      expect(models.map((it) => it.idCol)).to.eql([1, 2, 3]);

      const manyToMany = await collect(Model1.relatedQuery('model1Relation3').for(1));
      expect(manyToMany.map((it) => it.idCol)).to.eql([4]);
    });

    it('should stream $relatedQuery() without assigning the models to the owner', async () => {
      const owner = await Model1.query().findById(1);
      const models = await collect(owner.$relatedQuery('model1Relation2').orderBy('id_col'));

      expect(models.map((it) => it.idCol)).to.eql([1, 2, 3]);
      expect(owner.model1Relation2).to.equal(undefined);
    });

    it('should release the connection when the loop stops early', async () => {
      const pool = session.knex.client.pool;
      const seen = [];

      for await (const model of Model1.query().orderBy('id').stream()) {
        seen.push(model.id);

        if (seen.length === 2) {
          break;
        }
      }

      expect(seen).to.eql([1, 2]);
      // The pool releases the connection when the stream closes.
      await new Promise((resolve) => setImmediate(resolve));
      expect(pool.numUsed()).to.equal(0);

      const models = await Model1.query();
      expect(models).to.have.length(5);
    });

    it('should stream in a transaction', async () => {
      await transaction(Model1.knex(), async (trx) => {
        await Model1.query(trx).insert({ id: 6, model1Prop1: 'hello 6' });
        const models = await collect(Model1.query(trx).where('id', '>', 4).orderBy('id'));
        expect(models.map((it) => it.id)).to.eql([5, 6]);
      });
    });

    it('should reject a database error as a DBError', async () => {
      const err = await streamError(Model1.query().where('noSuchColumn', 1));
      expect(err).to.be.a(DBError);
    });

    it('should not run the query before the first iteration', async () => {
      let queries = 0;
      const onQuery = () => queries++;
      session.knex.on('query', onQuery);

      try {
        const iterator = Model1.query().stream();
        expect(queries).to.equal(0);
        await iterator.return();
        expect(await iterator.next()).to.eql({ value: undefined, done: true });
        expect(queries).to.equal(0);
      } finally {
        session.knex.off('query', onQuery);
      }
    });

    it('should reject an error of $afterFind() and release the connection', async () => {
      class Failing extends Model1 {
        $afterFind() {
          if (this.id === 3) throw new Error('afterFind failed');
        }
      }

      const seen = [];
      let error = null;

      try {
        for await (const model of Failing.query().orderBy('id').stream()) {
          seen.push(model.id);
        }
      } catch (err) {
        error = err;
      }

      expect(error.message).to.equal('afterFind failed');
      expect(seen).not.to.contain(3);
      await new Promise((resolve) => setImmediate(resolve));
      expect(session.knex.client.pool.numUsed()).to.equal(0);
    });

    it('should let an onError() hook handle an error', async () => {
      const models = await collect(
        Model1.query()
          .where('noSuchColumn', 1)
          .onError(() => []),
      );

      expect(models).to.eql([]);
    });

    it('should yield every row of a result larger than one batch', async () => {
      const rows = Array.from({ length: 300 }, (_, i) => ({ id: 100 + i, model1Prop1: `p${i}` }));
      await session.knex.batchInsert('Model1', rows, 100);

      let count = 0;
      let last = 0;

      for await (const model of Model1.query().orderBy('id').stream()) {
        expect(model.id).to.be.greaterThan(last);
        last = model.id;
        count++;
      }

      expect(count).to.equal(305);
    });

    describe('queries that need the whole result', () => {
      const cases = [
        ['first()', () => Model1.query().first(), /first\(\)/],
        ['findById()', () => Model1.query().findById(1), /first\(\)/],
        ['findOne()', () => Model1.query().findOne({ id: 1 }), /first\(\)/],
        ['page()', () => Model1.query().page(0, 2), /page\(\) or range\(\)/],
        ['range()', () => Model1.query().range(0, 2), /page\(\) or range\(\)/],
        ['runAfter()', () => Model1.query().runAfter((it) => it), /runAfter\(\)/],
        ['throwIfNotFound()', () => Model1.query().throwIfNotFound(), /runAfter\(\)/],
        [
          'a context runAfter()',
          () => Model1.query().context({ runAfter: (it) => it }),
          /runAfter\(\)/,
        ],
        [
          'withGraphFetched()',
          () => Model1.query().withGraphFetched('model1Relation2'),
          /relations/,
        ],
        ['withGraphJoined()', () => Model1.query().withGraphJoined('model1Relation2'), /relations/],
        ['insert()', () => Model1.query().insert({ model1Prop1: 'x' }), /find rows/],
        ['patch()', () => Model1.query().patch({ model1Prop1: 'x' }), /find rows/],
        ['delete()', () => Model1.query().delete(), /find rows/],
        ['resolve()', () => Model1.query().resolve([]), /resolve\(\)/],
      ];

      for (const [name, query, message] of cases) {
        it(`should throw for ${name}`, async () => {
          const err = await streamError(query());
          expect(err.message).to.match(/^stream\(\): /);
          expect(err.message).to.match(message);
        });
      }

      it('should throw for $relatedQuery() with relatedFindQueryMutates', async () => {
        class Mutating extends Model1 {
          static relatedFindQueryMutates = true;
        }

        const owner = await Mutating.query().findById(1);
        const err = await streamError(owner.$relatedQuery('model1Relation2', session.knex));
        expect(err.message).to.match(/relatedFindQueryMutates/);
        expect(owner.model1Relation2).to.equal(undefined);
      });

      it('should throw for a model class with a static afterFind() hook', async () => {
        class WithAfterFind extends Model1 {
          static afterFind() {}
        }

        const err = await streamError(WithAfterFind.query());
        expect(err.message).to.match(/static afterFind\(\)/);
      });

      it('should throw before the beforeFind() hooks run', async () => {
        let called = 0;

        class WithBeforeFind extends Model1 {
          static beforeFind() {
            called++;
          }
        }

        await streamError(WithBeforeFind.query().first());
        expect(called).to.equal(0);
      });

      it('should throw for operations that onBuild() adds', async () => {
        const err = await streamError(Model1.query().onBuild((builder) => builder.first()));
        expect(err.message).to.match(/first\(\)/);
      });

      it('should not write anything for a write query', async () => {
        await streamError(Model1.query().delete());
        expect(await Model1.query().resultSize()).to.equal(5);
      });
    });
  });
};
