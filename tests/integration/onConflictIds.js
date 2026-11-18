const expect = require('expect.js');
const { Model, knexSnakeCaseMappers } = require('../..');

module.exports = (session) => {
  describe('ids after insert().onConflict()', () => {
    const knex = session.knex;
    const queries = [];
    const onQuery = (query) => queries.push(query);

    beforeEach(() => {
      queries.length = 0;
      knex.on('query', onQuery);
    });

    afterEach(() => {
      knex.off('query', onQuery);
    });

    if (session.isMySql()) {
      describe('merge() on MySQL', () => {
        // `AUTO_INCREMENT` ids.
        class Item extends Model {
          static get tableName() {
            return 'upsert_items';
          }
        }

        // Ids from a `uuid()` default, which `LAST_INSERT_ID()` would turn
        // into a number.
        class UuidItem extends Model {
          static get tableName() {
            return 'upsert_uuid_items';
          }
        }

        const BoundItem = Item.bindKnex(knex);
        const BoundUuidItem = UuidItem.bindKnex(knex);

        before(async () => {
          await knex.schema.dropTableIfExists('upsert_items');
          await knex.schema.dropTableIfExists('upsert_uuid_items');
          await knex.schema.createTable('upsert_items', (table) => {
            table.increments('id').primary();
            table.string('key', 16).notNullable().unique();
            table.string('name');
            table.integer('stock');
          });
          await knex.schema.createTable('upsert_uuid_items', (table) => {
            table.string('id', 36).primary().defaultTo(knex.raw('(uuid())'));
            table.string('key', 16).notNullable().unique();
            table.string('name');
          });
        });

        after(async () => {
          await knex.schema.dropTableIfExists('upsert_items');
          await knex.schema.dropTableIfExists('upsert_uuid_items');
        });

        beforeEach(async () => {
          await knex('upsert_items').delete();
          await knex('upsert_uuid_items').delete();
          await knex('upsert_items').insert([
            { key: 'a', name: 'apple', stock: 1 },
            { key: 'b', name: 'banana', stock: 2 },
          ]);
          queries.length = 0;
        });

        async function idOf(key) {
          const row = await knex('upsert_items').where('key', key).first();
          return row.id;
        }

        const merges = [
          ['merge()', (qb) => qb.merge()],
          ['merge([columns])', (qb) => qb.merge(['name'])],
          ['merge({ values })', (qb) => qb.merge({ name: 'banana' })],
        ];

        for (const [name, merge] of merges) {
          describe(name, () => {
            it('should give the id of an existing row that the merge did not change', async () => {
              const item = await merge(
                BoundItem.query().insert({ key: 'b', name: 'banana', stock: 2 }).onConflict('key'),
              );

              expect(item.id).to.equal(await idOf('b'));
            });

            it('should give the id of an existing row that the merge changed', async () => {
              const item = await merge(
                BoundItem.query()
                  .insert({ key: 'b', name: 'blueberry', stock: 2 })
                  .onConflict('key'),
              );

              expect(item.id).to.equal(await idOf('b'));
            });

            it('should give the id of a new row', async () => {
              const item = await merge(
                BoundItem.query().insert({ key: 'c', name: 'banana', stock: 3 }).onConflict('key'),
              );

              expect(item.id).to.equal(await idOf('c'));
              expect(await knex('upsert_items').count('* as count')).to.eql([{ count: 3 }]);
            });
          });
        }

        it('should keep the merged values and the other columns', async () => {
          await BoundItem.query()
            .insert({ key: 'b', name: 'blueberry', stock: 9 })
            .onConflict('key')
            .merge(['name']);

          const row = await knex('upsert_items').where('key', 'b').first();
          expect(row.name).to.equal('blueberry');
          expect(row.stock).to.equal(2);
        });

        it('should give the id inside a transaction', async () => {
          const id = await idOf('a');

          await Model.transaction(knex, async (trx) => {
            const item = await Item.query(trx)
              .insert({ key: 'a', name: 'apple', stock: 1 })
              .onConflict('key')
              .merge();

            expect(item.id).to.equal(id);
          });
        });

        it('should let a related insert use the id of an unchanged row', async () => {
          // The case of the report: the id of the upsert was used for a related
          // insert.
          const item = await BoundItem.query()
            .insert({ key: 'a', name: 'apple', stock: 1 })
            .onConflict('key')
            .merge({ name: 'apple' });

          expect(item.id).to.equal(await idOf('a'));
        });

        it('should fetch the existing row with insertAndFetch()', async () => {
          const item = await BoundItem.query()
            .insertAndFetch({ key: 'b', name: 'banana' })
            .onConflict('key')
            .merge(['name']);

          expect(item.id).to.equal(await idOf('b'));
          expect(item.stock).to.equal(2);
        });

        it('should add LAST_INSERT_ID() to the update clause once', async () => {
          const query = BoundItem.query()
            .insert({ key: 'b', name: 'banana', stock: 2 })
            .onConflict('key')
            .merge();

          const first = await query;
          const inserts = queries.filter((it) => /^insert/i.test(it.sql));

          expect(first.id).to.equal(await idOf('b'));
          expect(inserts).to.have.length(1);
          expect(inserts[0].sql.match(/LAST_INSERT_ID/g)).to.have.length(1);
          expect(inserts[0].sql).to.contain('`id` = LAST_INSERT_ID(`id`)');

          // Run again, the model has its id now, and the insert doesn't need
          // LAST_INSERT_ID().
          const second = await query;
          expect(second.id).to.equal(first.id);
        });

        it('should read the columns of a table once per knex instance', async () => {
          // A new knex instance, with its own cache.
          const other = require('knex')({ ...session.knex.client.config });
          const otherQueries = [];
          other.on('query', (query) => otherQueries.push(query.sql));

          try {
            for (const key of ['a', 'b', 'c']) {
              const item = await Item.query(other)
                .insert({ key, name: 'apple' })
                .onConflict('key')
                .merge();

              expect(item.id).to.equal(await idOf(key));
            }
          } finally {
            await other.destroy();
          }

          expect(otherQueries.filter((sql) => /^show columns/i.test(sql))).to.have.length(1);
          expect(otherQueries.filter((sql) => /^insert/i.test(sql))).to.have.length(3);
        });

        it('should not add LAST_INSERT_ID() for an id that is not AUTO_INCREMENT', async () => {
          await knex('upsert_uuid_items').insert({ key: 'a', name: 'apple' });
          const before = await knex('upsert_uuid_items').where('key', 'a').first();

          for (const name of ['apple', 'apricot']) {
            const item = await BoundUuidItem.query()
              .insert({ key: 'a', name })
              .onConflict('key')
              .merge();

            expect(item.id).to.equal(undefined);
          }

          const after = await knex('upsert_uuid_items').where('key', 'a').first();
          expect(after.id).to.equal(before.id);
          expect(after.name).to.equal('apricot');

          for (const query of queries) {
            expect(query.sql).not.to.contain('LAST_INSERT_ID');
          }
        });

        it('should not add LAST_INSERT_ID() when the model has an id', async () => {
          const id = await idOf('b');
          const item = await BoundItem.query()
            .insert({ id, key: 'b', name: 'banana' })
            .onConflict('id')
            .merge(['name']);

          expect(item.id).to.equal(id);
          expect(queries.some((it) => /LAST_INSERT_ID/.test(it.sql))).to.equal(false);
        });

        it('should not give ids to a multi-row merge or to ignore()', async () => {
          const items = await BoundItem.query()
            .insert([
              { key: 'a', name: 'apple' },
              { key: 'b', name: 'banana' },
            ])
            .onConflict('key')
            .merge();

          expect(items.map((it) => it.id)).to.eql([undefined, undefined]);

          const ignored = await BoundItem.query()
            .insert({ key: 'a', name: 'apple' })
            .onConflict('key')
            .ignore();

          expect(ignored.id).to.equal(undefined);
          expect(queries.some((it) => /LAST_INSERT_ID/.test(it.sql))).to.equal(false);
        });

        it('should map the id column with knexSnakeCaseMappers()', async () => {
          const mapped = require('knex')({
            ...session.knex.client.config,
            ...knexSnakeCaseMappers(),
          });

          class MappedItem extends Model {
            static get tableName() {
              return 'upsertMappedItems';
            }

            static get idColumn() {
              return 'itemId';
            }
          }

          try {
            await mapped.schema.dropTableIfExists('upsertMappedItems');
            await mapped.schema.createTable('upsertMappedItems', (table) => {
              table.increments('itemId').primary();
              table.string('itemKey', 16).notNullable().unique();
              table.string('itemName');
            });

            await mapped('upsertMappedItems').insert({ itemKey: 'a', itemName: 'apple' });
            const [row] = await mapped('upsertMappedItems');

            const item = await MappedItem.query(mapped)
              .insert({ itemKey: 'a', itemName: 'apple' })
              .onConflict('itemKey')
              .merge();

            expect(item.itemId).to.equal(row.itemId);
          } finally {
            await mapped.schema.dropTableIfExists('upsertMappedItems');
            await mapped.destroy();
          }
        });
      });
    }

    describe('relation writes on an owner without an id', () => {
      const { Model1 } = session.models;

      beforeEach(async () => {
        await session.populate([
          {
            id: 1,
            model1Prop1: 'hello 1',
            model1Relation2: [{ idCol: 1, model2Prop1: 'related' }],
          },
        ]);
        queries.length = 0;
      });

      const cases = [
        [
          'insert() of a HasManyRelation',
          (owner) => owner.$relatedQuery('model1Relation2').insert({ model2Prop1: 'new' }),
          /Model1\.relationMappings\.model1Relation2: can't insert related rows: the owner model has no value for Model1\.id\./,
        ],
        [
          'relate() of a HasManyRelation',
          (owner) => owner.$relatedQuery('model1Relation2').relate(1),
          /model1Relation2: can't relate related rows: the owner model has no value for Model1\.id\./,
        ],
        [
          'insert() of a ManyToManyRelation',
          (owner) => owner.$relatedQuery('model1Relation3').insert({ model2Prop1: 'new' }),
          /model1Relation3: can't insert related rows: the owner model has no value for Model1\.id\./,
        ],
        [
          'relate() of a ManyToManyRelation',
          (owner) => owner.$relatedQuery('model1Relation3').relate(1),
          /model1Relation3: can't relate related rows: the owner model has no value for Model1\.id\./,
        ],
        [
          'insert() of a BelongsToOneRelation',
          (owner) => owner.$relatedQuery('model1Relation1').insert({ model1Prop1: 'new' }),
          /model1Relation1: can't insert related rows: the owner model has no value for Model1\.id\./,
        ],
        [
          'relate() of a BelongsToOneRelation',
          (owner) => owner.$relatedQuery('model1Relation1').relate(1),
          /model1Relation1: can't relate related rows: the owner model has no value for Model1\.id\./,
        ],
      ];

      for (const [name, write, message] of cases) {
        it(`should reject ${name} without a query`, async () => {
          const owner = Model1.fromJson({ model1Prop1: 'no id' });
          let error = null;

          try {
            await write(owner);
          } catch (err) {
            error = err;
          }

          expect(error).to.be.an(Error);
          expect(error.message).to.match(message);
          expect(queries).to.have.length(0);
        });
      }

      it('should still insert for an owner with an id', async () => {
        const owner = await Model1.query().findById(1);
        const related = await owner.$relatedQuery('model1Relation2').insert({ model2Prop1: 'new' });

        expect(related.model1Id).to.equal(1);
      });
    });
  });
};
