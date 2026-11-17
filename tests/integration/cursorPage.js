const expect = require('expect.js');
const { Model, ValidationError, snakeCaseMappers } = require('../..');

module.exports = (session) => {
  describe('cursorPage()', () => {
    const knex = session.knex;
    const ROWS = 37;

    class Item extends Model {
      static get tableName() {
        return 'cursor_page_items';
      }

      static get idColumn() {
        return ['k1', 'k2'];
      }

      static get columnNameMappers() {
        return snakeCaseMappers();
      }
    }

    class Tag extends Model {
      static get tableName() {
        return 'cursor_page_tags';
      }

      static get relationMappings() {
        return {
          item: {
            relation: Model.BelongsToOneRelation,
            modelClass: Item,
            join: {
              from: ['cursor_page_tags.item_k1', 'cursor_page_tags.item_k2'],
              to: ['cursor_page_items.k1', 'cursor_page_items.k2'],
            },
          },
        };
      }
    }

    Item.relationMappings = {
      tags: {
        relation: Model.HasManyRelation,
        modelClass: Tag,
        join: {
          from: ['cursor_page_items.k1', 'cursor_page_items.k2'],
          to: ['cursor_page_tags.item_k1', 'cursor_page_tags.item_k2'],
        },
      },
    };

    const BoundItem = Item.bindKnex(knex);
    const queries = [];
    const onQuery = (query) => queries.push(query);

    before(async () => {
      await knex.schema.dropTableIfExists('cursor_page_tags');
      await knex.schema.dropTableIfExists('cursor_page_items');
      await knex.schema.createTable('cursor_page_items', (table) => {
        table.integer('k1').notNullable();
        table.string('k2', 16).notNullable();
        table.string('group_name').notNullable();
        table.integer('score').notNullable();
        table.dateTime('created_at').notNullable();
        table.primary(['k1', 'k2']);
      });
      await knex.schema.createTable('cursor_page_tags', (table) => {
        table.increments('id');
        table.integer('item_k1');
        table.string('item_k2', 16);
        table.string('label');
      });

      const items = [];
      const tags = [];

      for (let i = 0; i < ROWS; ++i) {
        const k1 = i % 4;
        const k2 = `k${String(i).padStart(2, '0')}`;
        // Many equal values, so that the id breaks the ties.
        items.push({
          k1,
          k2,
          group_name: `g${i % 3}`,
          score: i % 5,
          created_at: new Date(Date.UTC(2026, 0, 1 + (i % 7))),
        });
        tags.push({ item_k1: k1, item_k2: k2, label: `tag ${i}` });
      }

      await knex.batchInsert('cursor_page_items', items, 20);
      await knex.batchInsert('cursor_page_tags', tags, 20);
    });

    after(async () => {
      await knex.schema.dropTableIfExists('cursor_page_tags');
      await knex.schema.dropTableIfExists('cursor_page_items');
    });

    beforeEach(() => {
      queries.length = 0;
      knex.on('query', onQuery);
    });

    afterEach(() => {
      knex.off('query', onQuery);
    });

    const key = (item) => `${item.k1}/${item.k2}`;

    async function walk(build, limit) {
      const keys = [];
      let after = null;
      let pages = 0;

      do {
        const page = await build().cursorPage(limit, after);
        expect(page.results.length).to.be.lessThan(limit + 1);
        keys.push(...page.results.map(key));
        after = page.next;
        pages++;
        expect(pages).to.be.lessThan(ROWS + 2);
      } while (after !== null);

      return { keys, pages };
    }

    const orders = [
      ['the ids only', (qb) => qb],
      ['one column, ascending', (qb) => qb.orderBy('score')],
      ['one column, descending', (qb) => qb.orderBy('score', 'desc')],
      ['two columns, mixed directions', (qb) => qb.orderBy('group_name').orderBy('score', 'desc')],
      [
        'an array of columns',
        (qb) => qb.orderBy([{ column: 'cursor_page_items.group_name', order: 'desc' }, 'score']),
      ],
      ['a date column', (qb) => qb.orderBy('created_at', 'desc')],
      ['part of the id, descending', (qb) => qb.orderBy('k2', 'desc')],
    ];

    for (const [name, order] of orders) {
      it(`should page through every row once, ordered by ${name}`, async () => {
        const full = (await order(BoundItem.query()).orderBy('k1').orderBy('k2')).map(key);
        const { keys, pages } = await walk(() => order(BoundItem.query()), 5);

        expect(full).to.have.length(ROWS);
        expect(keys).to.eql(
          name === 'part of the id, descending'
            ? (await BoundItem.query().orderBy('k2', 'desc').orderBy('k1')).map(key)
            : full,
        );
        expect(pages).to.equal(Math.ceil(ROWS / 5));
      });
    }

    it('should return next: null on the last page, also when it is full', async () => {
      const page = await BoundItem.query().cursorPage(ROWS);
      expect(page.results).to.have.length(ROWS);
      expect(page.next).to.equal(null);

      const empty = await BoundItem.query().where('score', '>', 100).cursorPage(10);
      expect(empty).to.eql({ results: [], next: null });
    });

    it('should keep the conditions of the query, also with orWhere()', async () => {
      const build = () =>
        BoundItem.query().where('score', 0).orWhere('score', 4).orderBy('group_name');
      const full = (await build().orderBy('k1').orderBy('k2')).map(key);
      const { keys } = await walk(build, 3);

      expect(keys).to.eql(full);
    });

    it('should not count the rows', async () => {
      const first = await BoundItem.query().orderBy('score').cursorPage(5);
      queries.length = 0;
      await BoundItem.query().orderBy('score').cursorPage(5, first.next);

      expect(queries).to.have.length(1);
      expect(queries[0].sql).not.to.match(/count\(/i);
      expect(queries[0].sql).to.match(/limit/i);
    });

    it('should bind the values of the cursor', async () => {
      const cursor = Buffer.from(JSON.stringify(["x' or 1=1 --", 0, 'k00'])).toString('base64url');
      const page = await BoundItem.query().orderBy('group_name').cursorPage(5, cursor);

      expect(page.results).to.eql([]);
      const sql = queries[queries.length - 1];
      expect(sql.sql).not.to.contain('1=1');
      expect(sql.bindings).to.contain("x' or 1=1 --");
    });

    it('should load relations with withGraphFetched() for the page only', async () => {
      const page = await BoundItem.query().withGraphFetched('tags').orderBy('score').cursorPage(4);

      expect(page.results).to.have.length(4);
      expect(page.results.every((it) => it.tags.length === 1)).to.equal(true);

      const tagQuery = queries.find((it) => /cursor_page_tags/.test(it.sql));
      // The fifth row, which only tells that there's a next page, isn't loaded.
      expect(tagQuery.bindings.length).to.equal(8);
    });

    describe('invalid cursors', () => {
      const cursors = [
        ['with characters outside base64url', 'abc$'],
        ['that is not JSON', Buffer.from('not json').toString('base64url')],
        ['that is not an array', Buffer.from('{"a":1}').toString('base64url')],
        ['with too few values', Buffer.from('[1]').toString('base64url')],
        ['with an object value', Buffer.from('["g0",{"a":1},"k00"]').toString('base64url')],
        ['with an array value', Buffer.from('["g0",[1],"k00"]').toString('base64url')],
        ['with a null value', Buffer.from('["g0",null,"k00"]').toString('base64url')],
        [
          'with an invalid date',
          Buffer.from('["g0",{"$date":"nope"},"k00"]').toString('base64url'),
        ],
        ['that is too long', 'a'.repeat(5000)],
      ];

      for (const [name, cursor] of cursors) {
        it(`should reject a cursor ${name} without a query`, async () => {
          let error = null;

          try {
            await BoundItem.query().orderBy('group_name').cursorPage(5, cursor);
          } catch (err) {
            error = err;
          }

          expect(error).to.be.a(ValidationError);
          expect(error.type).to.equal('InvalidCursor');
          expect(error.statusCode).to.equal(400);
          expect(queries).to.have.length(0);
        });
      }

      it('should reject a cursor of a query with other sort columns', async () => {
        const page = await BoundItem.query().orderBy('score').cursorPage(5);
        let error = null;

        try {
          await BoundItem.query().orderBy('score').orderBy('group_name').cursorPage(5, page.next);
        } catch (err) {
          error = err;
        }

        expect(error).to.be.a(ValidationError);
      });
    });

    describe('queries that cursorPage() rejects', () => {
      const cases = [
        ['limit()', () => BoundItem.query().limit(3), /limit\(\)/],
        ['offset()', () => BoundItem.query().offset(3), /offset\(\)/],
        ['page()', () => BoundItem.query().page(0, 3), /page\(\)/],
        ['first()', () => BoundItem.query().first(), /first\(\)/],
        ['orderByRaw()', () => BoundItem.query().orderByRaw('score'), /orderByRaw\(\)/],
        [
          'a raw orderBy() column',
          () => BoundItem.query().orderBy(Item.raw('score')),
          /column names/,
        ],
        [
          'withGraphJoined()',
          () => BoundItem.query().withGraphJoined('tags'),
          /withGraphJoined\(\)/,
        ],
        ['a write', () => BoundItem.query().patch({ score: 1 }), /find rows/],
      ];

      for (const [name, build, message] of cases) {
        it(`should reject ${name}`, async () => {
          let error = null;

          try {
            await build().cursorPage(5);
          } catch (err) {
            error = err;
          }

          expect(error.message).to.match(/^cursorPage\(\): /);
          expect(error.message).to.match(message);
          expect(queries).to.have.length(0);
        });
      }

      it('should reject a limit that is not a positive integer', () => {
        for (const limit of [0, -1, 1.5, '5', null, Number.NaN]) {
          expect(() => BoundItem.query().cursorPage(limit)).to.throwError(/positive integer/);
        }
      });

      it('should reject a sort column that is not selected', async () => {
        let error = null;

        try {
          await BoundItem.query().select('k1', 'k2').orderBy('score').cursorPage(2);
        } catch (err) {
          error = err;
        }

        expect(error.message).to.match(/score/);
      });
    });
  });
};
