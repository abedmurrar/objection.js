const expect = require('expect.js');
const { Model } = require('../../../');

// upsertGraph() deletes the many-to-many rows that it fetched through their
// relation by their ids only. A subquery that joins the join table deadlocked
// with concurrent writes of the join table on MySQL and MariaDB.
module.exports = (session) => {
  describe('upsertGraph deletes many-to-many rows by id', () => {
    const knex = session.knex;
    let Person;
    let sql;

    function recordQuery(query) {
      sql.push(query.sql);
    }

    before(() => {
      return knex.schema
        .dropTableIfExists('gdPersonTag')
        .dropTableIfExists('gdPersonItem')
        .dropTableIfExists('gdItem')
        .dropTableIfExists('gdPerson')
        .createTable('gdPerson', (table) => {
          table.integer('id').primary();
          table.string('name');
        })
        .createTable('gdItem', (table) => {
          table.integer('id').primary();
          table.string('name');
        })
        .createTable('gdPersonItem', (table) => {
          table.increments('id').primary();
          table.integer('personId');
          table.integer('itemId');
          table.integer('extra');
        })
        .createTable('gdPersonTag', (table) => {
          table.increments('id').primary();
          table.integer('personId');
          table.integer('itemId');
        });
    });

    after(() => {
      return knex.schema
        .dropTableIfExists('gdPersonTag')
        .dropTableIfExists('gdPersonItem')
        .dropTableIfExists('gdItem')
        .dropTableIfExists('gdPerson');
    });

    before(() => {
      class Item extends Model {
        static tableName = 'gdItem';
      }

      Person = class Person extends Model {
        static tableName = 'gdPerson';

        static relationMappings = {
          items: {
            relation: Model.ManyToManyRelation,
            modelClass: Item,
            join: {
              from: 'gdPerson.id',
              through: {
                from: 'gdPersonItem.personId',
                to: 'gdPersonItem.itemId',
                extra: ['extra'],
              },
              to: 'gdItem.id',
            },
          },
          tags: {
            relation: Model.ManyToManyRelation,
            modelClass: Item,
            join: {
              from: 'gdPerson.id',
              through: { from: 'gdPersonTag.personId', to: 'gdPersonTag.itemId' },
              to: 'gdItem.id',
            },
          },
        };
      };
    });

    beforeEach(async () => {
      await knex('gdPersonTag').delete();
      await knex('gdPersonItem').delete();
      await knex('gdItem').delete();
      await knex('gdPerson').delete();

      await knex('gdPerson').insert([
        { id: 1, name: 'one' },
        { id: 2, name: 'two' },
      ]);
      await knex('gdItem').insert([
        { id: 11, name: 'item 11' },
        { id: 12, name: 'item 12' },
        { id: 13, name: 'item 13' },
        { id: 21, name: 'tag 21' },
        { id: 22, name: 'tag 22' },
      ]);
      await knex('gdPersonItem').insert([
        { personId: 1, itemId: 11, extra: 1 },
        { personId: 1, itemId: 12, extra: 2 },
        { personId: 2, itemId: 13, extra: 3 },
      ]);
      await knex('gdPersonTag').insert([
        { personId: 1, itemId: 21 },
        { personId: 1, itemId: 22 },
      ]);

      sql = [];
      knex.on('query', recordQuery);
    });

    afterEach(() => {
      knex.removeListener('query', recordQuery);
    });

    it('should delete by id and keep the filters of the other queries', async () => {
      await Person.query(knex).upsertGraph(
        { id: 1, items: [{ id: 11, extra: 5 }], tags: [{ id: 21 }] },
        { unrelate: ['tags'] },
      );

      const itemDeletes = sql.filter((it) => /^delete from .gdItem. /.test(it));
      expect(itemDeletes).to.have.length(1);
      expect(itemDeletes[0]).not.to.contain('gdPersonItem');

      // The unrelate of the other relation still filters the join rows by
      // their related rows: in the delete, or on MySQL in the query that
      // fetches the ids of the join rows first.
      const unrelates = sql.filter((it) => /^delete from .gdPersonTag. /.test(it));
      expect(unrelates).to.have.length(1);

      const joinRowFilter = session.isMySql()
        ? sql.find((it) => /^select .* from .gdPersonTag. where /.test(it))
        : unrelates[0];
      expect(joinRowFilter).to.match(/exists \(select 1 from .gdItem. where .gdItem.\..id. = /);

      const items = await knex('gdItem').orderBy('id').pluck('id');
      expect(items).to.eql([11, 13, 21, 22]);

      const person = await Person.query(knex)
        .findById(1)
        .withGraphFetched('[items(orderById), tags(orderById)]')
        .modifiers({ orderById: (builder) => builder.orderBy('gdItem.id') });

      expect(person.items.map((it) => [it.id, it.extra])).to.eql([[11, 5]]);
      expect(person.tags.map((it) => it.id)).to.eql([21]);

      // The other person's join rows are untouched.
      const rows = await knex('gdPersonItem').where('personId', 2).select('itemId', 'extra');
      expect(rows).to.eql([{ itemId: 13, extra: 3 }]);
    });

    it('should keep the relation filter of deletes outside upsertGraph', async () => {
      const person = await Person.query(knex).findById(1);

      // Item 13 is related to person 2, not to person 1.
      const count = await person.$relatedQuery('items', knex).delete().where('gdItem.id', 13);

      expect(count).to.equal(0);
      expect(await knex('gdItem').where('id', 13).first()).to.be.ok();
      expect(sql.filter((it) => /^delete from .gdItem. /.test(it))[0]).to.contain('gdPersonItem');
    });
  });
};
