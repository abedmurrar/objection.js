const expect = require('expect.js');
const { Model, snakeCaseMappers } = require('../../../');

// `snakeCaseMappers({ preserveJsonKeys: true })` converts the column of a field
// expression but not its JSON path (#1089), so that a patch writes the key that
// `ref()` reads.
module.exports = (session) => {
  if (!session.isPostgres() && !session.isMySql()) {
    return;
  }

  describe('snakeCaseMappers({ preserveJsonKeys })', () => {
    const knex = session.knex;
    const jsonType = session.isPostgres() ? 'jsonb' : 'json';

    // Not bound with `bindKnex()`, which shares the bound class of models with
    // the same name and table.
    function createModel(preserveJsonKeys) {
      class Doc extends Model {
        static get tableName() {
          return 'pjk_docs';
        }

        static get jsonAttributes() {
          return ['jsonData'];
        }

        static get columnNameMappers() {
          return snakeCaseMappers({ preserveJsonKeys });
        }
      }

      return Doc;
    }

    before(async () => {
      await knex.schema.dropTableIfExists('pjk_docs');
      await knex.schema.createTable('pjk_docs', (table) => {
        table.increments('id').primary();
        table[jsonType]('json_data');
      });
    });

    after(() => knex.schema.dropTableIfExists('pjk_docs'));

    beforeEach(async () => {
      await knex('pjk_docs').delete();
      await knex('pjk_docs').insert({
        id: 1,
        json_data: JSON.stringify({ someKey: 1, other: { innerKey: 2 } }),
      });
    });

    const stored = async () => {
      const row = await knex('pjk_docs').first();
      return typeof row.json_data === 'string' ? JSON.parse(row.json_data) : row.json_data;
    };

    it('should write the JSON keys of a field expression as written', async () => {
      const Doc = createModel(true);

      await Doc.query(knex)
        .patch({ 'jsonData:someKey': 99, 'jsonData:other.innerKey': 3 })
        .where('id', 1);

      expect(await stored()).to.eql({ someKey: 99, other: { innerKey: 3 } });

      const [doc] = await Doc.query(knex).select(Doc.ref('json_data:someKey').as('value'));
      expect(Number(doc.value)).to.equal(99);
    });

    it('should convert the JSON keys without the option, as before', async () => {
      const Doc = createModel(false);

      await Doc.query(knex).patch({ 'jsonData:someKey': 99 }).where('id', 1);

      expect(await stored()).to.eql({ someKey: 1, some_key: 99, other: { innerKey: 2 } });
    });
  });
};
