const expect = require('expect.js');
const { Model } = require('../../../');

// skipUndefined() made findById(), deleteById(), patchAndFetchById() and
// updateAndFetchById() leave out their id condition when the id was undefined,
// so deleteById(undefined) deleted every row of the table, and the patch and
// update methods changed every row. The id is the only condition of these
// methods, so an undefined id is an error with or without skipUndefined().
module.exports = (session) => {
  describe('...ById() methods with an undefined id', () => {
    const knex = session.knex;
    let Item;
    let CompositeItem;

    before(async () => {
      await knex.schema.dropTableIfExists('byIdItem');
      await knex.schema.dropTableIfExists('byIdCompositeItem');
      await knex.schema
        .createTable('byIdItem', (table) => {
          table.integer('id').primary();
          table.string('name');
        })
        .createTable('byIdCompositeItem', (table) => {
          table.integer('a');
          table.integer('b');
          table.string('name');
          table.primary(['a', 'b']);
        });

      Item = class extends Model {
        static tableName = 'byIdItem';
      };

      CompositeItem = class extends Model {
        static tableName = 'byIdCompositeItem';
        static idColumn = ['a', 'b'];
      };

      Item.knex(knex);
      CompositeItem.knex(knex);
    });

    after(async () => {
      await knex.schema.dropTableIfExists('byIdItem');
      await knex.schema.dropTableIfExists('byIdCompositeItem');
    });

    beforeEach(async () => {
      await knex('byIdItem').delete();
      await knex('byIdCompositeItem').delete();
      await knex('byIdItem').insert([
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ]);
      await knex('byIdCompositeItem').insert([
        { a: 1, b: 1, name: 'a' },
        { a: 1, b: 2, name: 'b' },
      ]);
    });

    const cases = [
      ['findById', (query) => query.findById(undefined)],
      ['deleteById', (query) => query.deleteById(undefined)],
      ['findById', (query) => query.patchAndFetchById(undefined, { name: 'x' })],
      ['findById', (query) => query.updateAndFetchById(undefined, { name: 'x' })],
    ];

    for (const skipUndefined of [false, true]) {
      for (const [method, run] of cases) {
        const title = `${run.toString().replace(/^\(query\) => query\./, '')}${
          skipUndefined ? ' with skipUndefined()' : ''
        }`;

        it(`${title} throws and changes no rows`, async () => {
          for (const [modelClass, table] of [
            [Item, 'byIdItem'],
            [CompositeItem, 'byIdCompositeItem'],
          ]) {
            let query = modelClass.query();

            if (skipUndefined) {
              query = silenceDeprecation(() => query.skipUndefined());
            }

            let error = null;

            try {
              await run(query);
            } catch (err) {
              error = err;
            }

            expect(error && error.message).to.equal(`undefined was passed to ${method}`);

            const rows = await knex(table).orderBy('name');
            expect(rows.map((row) => row.name)).to.eql(['a', 'b']);
          }
        });
      }
    }

    it('deleteById(undefined) throws before a static beforeDelete hook runs', async () => {
      const calls = [];

      class HookedItem extends Item {
        static beforeDelete() {
          calls.push('beforeDelete');
        }
      }

      for (const skipUndefined of [false, true]) {
        let query = HookedItem.query();

        if (skipUndefined) {
          query = silenceDeprecation(() => query.skipUndefined());
        }

        let error = null;

        try {
          await query.deleteById(undefined);
        } catch (err) {
          error = err;
        }

        expect(error && error.message).to.equal('undefined was passed to deleteById');
      }

      expect(calls).to.eql([]);
    });

    it("deleteById() goes through a custom query builder's findById()", async () => {
      class ScopedQueryBuilder extends Model.QueryBuilder {
        findById(id) {
          return super.findById(id).where('name', '<>', 'b');
        }
      }

      class ScopedItem extends Item {
        static QueryBuilder = ScopedQueryBuilder;
      }

      expect(await ScopedItem.query().deleteById(2)).to.equal(0);
      expect(await ScopedItem.query().deleteById(1)).to.equal(1);
      expect((await knex('byIdItem')).map((row) => row.name)).to.eql(['b']);
    });

    it('deleteById() with skipUndefined() and a composite id with an undefined part throws', async () => {
      let error = null;

      try {
        await silenceDeprecation(() => CompositeItem.query().skipUndefined()).deleteById([
          1,
          undefined,
        ]);
      } catch (err) {
        error = err;
      }

      expect(error && error.message).to.equal('undefined was passed to deleteById');
      expect(await knex('byIdCompositeItem')).to.have.length(2);
    });
  });
};

function silenceDeprecation(fn) {
  const warn = console.warn;
  console.warn = () => {};

  try {
    return fn();
  } finally {
    console.warn = warn;
  }
}
