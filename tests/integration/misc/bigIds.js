const expect = require('expect.js');
const { Model } = require('../../../');

// Ids above 2^53, which a JavaScript number can't hold, as the drivers return
// them when configured for it: BigInts from the mariadb driver by default, and
// strings from mysql2 with `bigNumberStrings`. The test sessions turn these off,
// so the other tests never see them.
module.exports = (session) => {
  if (!session.isMySql()) {
    return;
  }

  describe('ids above 2^53', () => {
    const START = 2n ** 53n + 1n;
    let knex = null;
    let kind = null;

    class Item extends Model {
      static get tableName() {
        return 'bigItems';
      }

      static get relationMappings() {
        return {
          children: {
            relation: Model.HasManyRelation,
            modelClass: Child,
            join: { from: 'bigItems.id', to: 'bigChildren.itemId' },
          },
        };
      }
    }

    class Child extends Model {
      static get tableName() {
        return 'bigChildren';
      }
    }

    // The driver's representation of an id.
    const id = (value) => (kind === 'bigint' ? BigInt(value) : String(value));

    before(async () => {
      const config = session.knex.client.config;
      const connection = { ...config.connection };

      if (config.client === 'mariadb') {
        delete connection.insertIdAsNumber;
        delete connection.bigIntAsNumber;
        kind = 'bigint';
      } else {
        connection.supportBigNumbers = true;
        connection.bigNumberStrings = true;
        kind = 'string';
      }

      knex = require('knex')({ ...config, connection, pool: { min: 0, max: 4 } });

      await knex.schema.dropTableIfExists('bigChildren');
      await knex.schema.dropTableIfExists('bigItems');
      await knex.schema.createTable('bigItems', (table) => {
        table.bigIncrements('id').primary();
        table.string('name').unique();
      });
      await knex.schema.createTable('bigChildren', (table) => {
        table.bigIncrements('id').primary();
        table.bigInteger('itemId').unsigned();
        table.string('name');
      });
    });

    after(async () => {
      await knex.schema.dropTableIfExists('bigChildren');
      await knex.schema.dropTableIfExists('bigItems');
      await knex.destroy();
    });

    beforeEach(async () => {
      await knex('bigChildren').delete();
      await knex('bigItems').delete();
      await knex.raw(`alter table bigItems auto_increment = ${START}`);
      await knex.raw(`alter table bigChildren auto_increment = ${START}`);
    });

    const ids = async (table) => (await knex(table).orderBy('id')).map((it) => it.id);

    it('should return the driver type of the ids', async () => {
      await knex('bigItems').insert({ name: 'x' });
      const [row] = await knex('bigItems');

      expect(typeof row.id).to.equal(kind);
      expect(String(row.id)).to.equal(String(START));
    });

    it('should give a single insert its exact id', async () => {
      const item = await Item.query(knex).insert({ name: 'a' });

      expect(String(item.id)).to.equal(String(START));
      expect((await ids('bigItems')).map(String)).to.eql([String(START)]);
    });

    it('should give the rows of a multi-row insert their exact ids', async () => {
      const items = await Item.query(knex).insert([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);

      expect(items.map((it) => String(it.id))).to.eql((await ids('bigItems')).map(String));
      expect(items.map((it) => String(it.id))).to.eql([
        String(START),
        String(START + 1n),
        String(START + 2n),
      ]);
    });

    it('should give an upsert the exact id of the existing row', async () => {
      await knex('bigItems').insert([{ name: 'a' }, { name: 'b' }]);
      const item = await Item.query(knex).insert({ name: 'b' }).onConflict().merge();

      expect(String(item.id)).to.equal(String(START + 1n));
    });

    it('should insert a graph with the exact foreign keys', async () => {
      const items = await Item.query(knex).insertGraph([
        { name: 'a', children: [{ name: 'a1' }, { name: 'a2' }] },
        { name: 'b', children: [{ name: 'b1' }] },
      ]);

      const children = await knex('bigChildren').orderBy('id');

      expect(children.map((it) => `${it.name}:${it.itemId}`)).to.eql([
        `a1:${START}`,
        `a2:${START}`,
        `b1:${START + 1n}`,
      ]);
      expect(items.map((it) => String(it.id))).to.eql([String(START), String(START + 1n)]);
    });

    it('should find, load and patch by the exact ids', async () => {
      await Item.query(knex).insertGraph([
        { name: 'a', children: [{ name: 'a1' }] },
        { name: 'b', children: [{ name: 'b1' }] },
      ]);

      const b = await Item.query(knex).findById(id(START + 1n));
      const loaded = await Item.query(knex)
        .findById(id(START + 1n))
        .withGraphFetched('children');
      await b.$relatedQuery('children', knex).patch({ name: 'patched' });

      expect(b.name).to.equal('b');
      expect(loaded.children.map((it) => it.name)).to.eql(['b1']);
      expect((await knex('bigChildren').orderBy('id')).map((it) => it.name)).to.eql([
        'a1',
        'patched',
      ]);
    });

    it('should cursor-page through the exact ids', async () => {
      await knex('bigItems').insert(Array.from({ length: 7 }, (_, i) => ({ name: `n${i}` })));

      const seen = [];
      let after = null;

      do {
        const page = await Item.query(knex).cursorPage(2, after);
        seen.push(...page.results.map((it) => String(it.id)));
        after = page.next;
      } while (after !== null && seen.length < 20);

      expect(seen).to.eql((await ids('bigItems')).map(String));
    });
  });
};
