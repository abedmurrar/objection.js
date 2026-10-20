const expect = require('expect.js');
const { transaction } = require('../../');

module.exports = (session) => {
  const { Model1, Model2 } = session.models;

  describe('batch insert', () => {
    beforeEach(() => {
      return session.populate([{ id: 1, model1Prop1: 'existing' }]);
    });

    it('should set the ids of all inserted rows', async () => {
      const inserted = await Model1.query().insert([
        { model1Prop1: 'a' },
        { model1Prop1: 'b' },
        { model1Prop1: 'c' },
      ]);

      await expectIdsToMatchRows(inserted);
    });

    it('should set the ids after rows inserted by another query', async () => {
      await Model1.query().insert({ model1Prop1: 'single' });
      const inserted = await Model1.query().insert([{ model1Prop1: 'a' }, { model1Prop1: 'b' }]);

      await expectIdsToMatchRows(inserted);
    });

    it('should work in a transaction', async () => {
      const inserted = await transaction(Model1.knex(), (trx) =>
        Model1.query(trx).insert([{ model1Prop1: 'a' }, { model1Prop1: 'b' }]),
      );

      await expectIdsToMatchRows(inserted);
    });

    it('should keep the ids that were given', async () => {
      const inserted = await Model1.query().insert([
        { id: 10, model1Prop1: 'a' },
        { id: 20, model1Prop1: 'b' },
      ]);

      expect(inserted.map((it) => it.id)).to.eql([10, 20]);
      await expectIdsToMatchRows(inserted);
    });

    it('insertAndFetch should fetch all inserted rows', async () => {
      const inserted = await Model1.query().insertAndFetch([
        { model1Prop1: 'a', model1Prop2: 1 },
        { model1Prop1: 'b', model1Prop2: 2 },
      ]);

      expect(inserted.map((it) => [it.model1Prop1, it.model1Prop2])).to.eql([
        ['a', 1],
        ['b', 2],
      ]);

      await expectIdsToMatchRows(inserted);
    });

    it('should insert related rows', async () => {
      const inserted = await Model1.relatedQuery('model1Relation2')
        .for(1)
        .insert([{ model2Prop1: 'a' }, { model2Prop1: 'b' }]);

      const rows = await Model2.query().orderBy('id_col');
      expect(rows.map((it) => [it.idCol, it.model1Id, it.model2Prop1])).to.eql(
        inserted.map((it) => [it.idCol, 1, it.model2Prop1]),
      );
    });

    if (session.isMySql()) {
      it('should fail before inserting if only some rows have an id', async () => {
        const err = await Model1.query()
          .insert([{ id: 10, model1Prop1: 'a' }, { model1Prop1: 'b' }])
          .catch((err) => err);

        expect(err.message).to.equal(
          `batch insert on MySQL can't return ids when only some rows have an id. Set the id on all rows or none.`,
        );

        expect(await Model1.query().resultSize()).to.equal(1);
      });

      it('should use auto_increment_increment', async () => {
        const knex = require('knex')({
          ...session.opt.knexConfig,
          pool: {
            min: 1,
            max: 1,
            afterCreate: (conn, cb) => {
              conn.query('SET SESSION auto_increment_increment = 3', (err) => cb(err, conn));
            },
          },
        });

        try {
          const inserted = await Model1.query(knex).insert([
            { model1Prop1: 'a' },
            { model1Prop1: 'b' },
            { model1Prop1: 'c' },
          ]);

          expect(inserted[1].id - inserted[0].id).to.equal(3);
          await expectIdsToMatchRows(inserted);
        } finally {
          await knex.destroy();
        }
      });

      it('should not set ids with onConflict()', async () => {
        const inserted = await Model1.query()
          .insert([{ model1Prop1: 'a' }, { model1Prop1: 'b' }])
          .onConflict('id')
          .ignore();

        expect(inserted.map((it) => it.id)).to.eql([undefined, undefined]);
      });
    }

    async function expectIdsToMatchRows(inserted) {
      const rows = await Model1.query().whereIn(
        'id',
        inserted.map((it) => it.id),
      );

      for (const model of inserted) {
        const row = rows.find((it) => it.id === model.id);
        expect(row).to.be.ok();
        expect(row.model1Prop1).to.equal(model.model1Prop1);
      }
    }
  });
};
