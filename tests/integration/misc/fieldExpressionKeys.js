const { expect } = require('chai');
const { Model } = require('../../../');

module.exports = (session) => {
  // Field expression patches write into json columns.
  if (!session.isPostgres() && !session.isMySql()) {
    return;
  }

  describe('field expressions in patch() and merge() built more than once (#53)', () => {
    const knex = session.knex;

    class Item extends Model {
      static get tableName() {
        return 'field_expression_keys';
      }

      static get jsonAttributes() {
        return ['meta'];
      }
    }

    before(() => {
      return knex.schema
        .dropTableIfExists('field_expression_keys')
        .createTable('field_expression_keys', (table) => {
          table.integer('id').primary();
          table.jsonb('meta');
        });
    });

    after(() => {
      return knex.schema.dropTableIfExists('field_expression_keys');
    });

    beforeEach(async () => {
      await knex('field_expression_keys').delete();
      await knex('field_expression_keys').insert({ id: 1, meta: JSON.stringify({ size: 1 }) });
    });

    it('patch() should write the json path when the query was built before', async () => {
      const query = Item.query(knex).patch({ 'meta:color': 'red' }).where('id', 1);
      query.toKnexQuery();
      query.clone().toKnexQuery();
      expect(await query).to.equal(1);
      const item = await Item.query(knex).findById(1);
      expect(item.meta).to.eql({ size: 1, color: 'red' });
    });

    // On PostgreSQL, the unqualified column of a merge is ambiguous.
    const itMySql = session.isMySql() ? it : it.skip;

    itMySql('merge() should write the json path when the query was built before', async () => {
      const query = Item.query(knex)
        .insert({ id: 1 })
        .onConflict('id')
        .merge({ 'meta:color': 'red' });
      query.toKnexQuery();
      await query;
      const item = await Item.query(knex).findById(1);
      expect(item.meta).to.eql({ size: 1, color: 'red' });
    });

    it('patchAndFetchById() should not return the field expression keys', async () => {
      const item = await Item.query(knex).patchAndFetchById(1, { 'meta:color': 'red' });
      expect(item).not.to.have.property('meta:color');
      expect(item.meta).to.eql({ size: 1, color: 'red' });
    });

    it('$query().patch() should not set the field expression keys on the instance', async () => {
      const item = await Item.query(knex).findById(1);
      await item.$query(knex).patch({ 'meta:color': 'red' });
      expect(item).not.to.have.property('meta:color');
    });
  });
};
