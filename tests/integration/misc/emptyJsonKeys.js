const expect = require('expect.js');
const { Model } = require('../../../');

// A field expression can refer to an empty JSON key with `[""]` or `['']`
// (Vincit #2680). It referred to a key named `""` before.
module.exports = (session) => {
  if (!session.isPostgres() && !session.isMySql()) {
    return;
  }

  describe('empty keys in JSON field expressions', () => {
    const knex = session.knex;

    class Doc extends Model {
      static get tableName() {
        return 'ejk_docs';
      }

      static get jsonAttributes() {
        return ['data'];
      }
    }

    before(async () => {
      await knex.schema.dropTableIfExists('ejk_docs');
      await knex.schema.createTable('ejk_docs', (table) => {
        table.increments('id').primary();
        table[session.isPostgres() ? 'jsonb' : 'json']('data');
      });
    });

    after(() => knex.schema.dropTableIfExists('ejk_docs'));

    beforeEach(async () => {
      await knex('ejk_docs').delete();
      await knex('ejk_docs').insert({ id: 1, data: JSON.stringify({ '': 5, a: { '': 1 } }) });
    });

    const stored = async () => {
      const row = await knex('ejk_docs').first();
      return typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    };

    it('should read an empty key', async () => {
      const [doc] = await Doc.query(knex).select(
        Doc.ref('data:[""]').castInt().as('top'),
        Doc.ref("data:a['']").castInt().as('nested'),
      );

      expect([doc.top, doc.nested]).to.eql([5, 1]);
    });

    it('should write an empty key', async () => {
      await Doc.query(knex).patch({ 'data:[""]': 6, "data:a['']": 2 }).where('id', 1);

      expect(await stored()).to.eql({ '': 6, a: { '': 2 } });
    });

    it('should filter by an empty key', async () => {
      const docs = await Doc.query(knex).where(Doc.ref('data:[""]').castInt(), 5);

      expect(docs.map((it) => it.id)).to.eql([1]);
    });
  });
};
