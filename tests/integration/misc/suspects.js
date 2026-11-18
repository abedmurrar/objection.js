const expect = require('expect.js');
const diagnosticsChannel = require('node:diagnostics_channel');
const { Model } = require('../../../');

// Tests written against specific suspected bugs: combinations of features that
// no other test covers. Each describe names the suspicion.
module.exports = (session) => {
  describe('suspected bugs', () => {
    const knex = session.knex;

    describe('cursorPage() on timestamps with microseconds', () => {
      class Event extends Model {
        static get tableName() {
          return 'sus_events';
        }
      }

      const BoundEvent = Event.bindKnex(knex);

      before(async () => {
        await knex.schema.dropTableIfExists('sus_events');
        await knex.schema.createTable('sus_events', (table) => {
          table.increments('id').primary();
          table.datetime('created_at', { precision: 6 }).notNullable();
        });

        const rows = [];

        // Ten rows a microsecond apart within the same millisecond, inserted
        // in the reverse order of their times, so that the id order differs.
        for (let i = 0; i < 10; ++i) {
          rows.push({ created_at: `2026-01-01 00:00:00.1234${9 - i}` });
        }

        if (session.isPostgres() || session.isMySql()) {
          await knex('sus_events').insert(rows);
        }
      });

      after(() => knex.schema.dropTableIfExists('sus_events'));

      if (session.isPostgres() || session.isMySql()) {
        it('should return every row once', async () => {
          const full = (await BoundEvent.query().orderBy('created_at').orderBy('id')).map(
            (it) => it.id,
          );
          const seen = [];
          let after = null;
          let pages = 0;

          do {
            const page = await BoundEvent.query().orderBy('created_at').cursorPage(3, after);
            seen.push(...page.results.map((it) => it.id));
            // The text of the sort columns isn't part of the models.
            expect(Object.keys(page.results[0]).sort()).to.eql(['created_at', 'id']);
            after = page.next;
            expect(++pages).to.be.lessThan(10);
          } while (after !== null);

          expect(seen).to.eql(full);
        });

        it('should return every row once with selected columns, descending', async () => {
          const full = (await BoundEvent.query().orderBy('created_at', 'desc').orderBy('id')).map(
            (it) => it.id,
          );
          const seen = [];
          let after = null;

          do {
            const page = await BoundEvent.query()
              .select('id', 'created_at')
              .orderBy('created_at', 'desc')
              .cursorPage(4, after);
            seen.push(...page.results.map((it) => it.id));
            after = page.next;
          } while (after !== null && seen.length < 20);

          expect(seen).to.eql(full);
        });
      }
    });

    describe('cursorPage() sorted by a joined column', () => {
      class Owner extends Model {
        static get tableName() {
          return 'sus_owners';
        }
      }

      class Pet extends Model {
        static get tableName() {
          return 'sus_pets';
        }

        static get relationMappings() {
          return {
            owner: {
              relation: Model.BelongsToOneRelation,
              modelClass: Owner,
              join: { from: 'sus_pets.ownerId', to: 'sus_owners.id' },
            },
          };
        }
      }

      const BoundPet = Pet.bindKnex(knex);

      before(async () => {
        await knex.schema.dropTableIfExists('sus_pets');
        await knex.schema.dropTableIfExists('sus_owners');
        await knex.schema.createTable('sus_owners', (table) => {
          table.increments('id').primary();
          table.string('name');
        });
        await knex.schema.createTable('sus_pets', (table) => {
          table.increments('id').primary();
          table.string('name');
          table.integer('ownerId');
        });

        // Owner names sort the opposite way of the pet names.
        await knex('sus_owners').insert([
          { id: 1, name: 'zed' },
          { id: 2, name: 'amy' },
        ]);
        await knex('sus_pets').insert([
          { id: 1, name: 'a', ownerId: 1 },
          { id: 2, name: 'b', ownerId: 1 },
          { id: 3, name: 'c', ownerId: 2 },
          { id: 4, name: 'd', ownerId: 2 },
        ]);
      });

      after(async () => {
        await knex.schema.dropTableIfExists('sus_pets');
        await knex.schema.dropTableIfExists('sus_owners');
      });

      it('should reject sorting by the joined column', async () => {
        const build = () =>
          BoundPet.query()
            .joinRelated('owner')
            .select('sus_pets.*', 'owner.name as ownerName')
            .orderBy('owner.name');

        const full = (await build().orderBy('sus_pets.id')).map((it) => it.id);
        const seen = [];
        let after = null;
        let error = null;

        try {
          do {
            const page = await build().cursorPage(1, after);
            seen.push(...page.results.map((it) => it.id));
            after = page.next;
          } while (after !== null && seen.length < 10);
        } catch (err) {
          error = err;
        }

        // A clear error before the first page, instead of pages that repeat.
        expect(full).to.have.length(4);
        expect(error.message).to.equal(
          'cursorPage(): it can only sort by the columns of sus_pets, not owner.name.',
        );
        expect(seen).to.eql([]);
      });
    });

    describe('cursorPage() with find hooks', () => {
      const calls = [];

      class Item extends Model {
        static get tableName() {
          return 'sus_items';
        }

        static afterFind({ result }) {
          calls.push(Array.isArray(result) ? 'array' : typeof result);
        }

        $afterFind() {
          this.seen = true;
        }
      }

      const BoundItem = Item.bindKnex(knex);

      before(async () => {
        await knex.schema.dropTableIfExists('sus_items');
        await knex.schema.createTable('sus_items', (table) => {
          table.increments('id').primary();
          table.string('name');
        });
        await knex('sus_items').insert([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
      });

      after(() => knex.schema.dropTableIfExists('sus_items'));

      it('should run the hooks on the models of the page', async () => {
        calls.length = 0;
        const page = await BoundItem.query().cursorPage(2);

        expect(page.results).to.have.length(2);
        expect(page.next).to.be.a('string');
        expect(page.results.every((it) => it.seen === true)).to.equal(true);
        expect(calls).to.eql(['array']);
      });

      it('should run the hooks on the models of page() too', async () => {
        calls.length = 0;
        const page = await BoundItem.query().page(0, 2);

        expect(page.results.every((it) => it.seen === true)).to.equal(true);
        expect(calls).to.eql(['array']);
      });
    });

    describe('stream() with a beforeFind() that cancels the query', () => {
      class Item extends Model {
        static get tableName() {
          return 'sus_stream_items';
        }

        static beforeFind({ cancelQuery, context }) {
          if (context.cancelWith) {
            cancelQuery(context.cancelWith);
          }
        }
      }

      const BoundItem = Item.bindKnex(knex);

      before(async () => {
        await knex.schema.dropTableIfExists('sus_stream_items');
        await knex.schema.createTable('sus_stream_items', (table) => {
          table.increments('id').primary();
          table.string('name');
        });
        await knex('sus_stream_items').insert([{ name: 'a' }, { name: 'b' }]);
      });

      after(() => knex.schema.dropTableIfExists('sus_stream_items'));

      it('should give the same models as awaiting the query', async () => {
        const cancelWith = [Item.fromJson({ id: 100, name: 'cached' })];
        const awaited = await BoundItem.query().context({ cancelWith });
        const streamed = [];

        for await (const item of BoundItem.query().context({ cancelWith }).stream()) {
          streamed.push(item);
        }

        expect(awaited.map((it) => it.id)).to.eql([100]);
        expect(streamed.map((it) => it.id)).to.eql([100]);
      });

      it('should run the $afterFind() hooks of the models, like awaiting the query', async () => {
        class HookedItem extends Item {
          $afterFind() {
            this.found = true;
          }
        }

        const cancelWith = [HookedItem.fromJson({ id: 100 })];
        const streamed = [];

        for await (const item of HookedItem.query(knex).context({ cancelWith }).stream()) {
          streamed.push(item);
        }

        const awaited = await HookedItem.query(knex).context({
          cancelWith: [HookedItem.fromJson({ id: 100 })],
        });

        expect(streamed.map((it) => it.found)).to.eql([true]);
        expect(awaited.map((it) => it.found)).to.eql([true]);
      });

      it('should yield nothing when the query is cancelled without a value', async () => {
        const streamed = [];

        for await (const item of BoundItem.query().context({ cancelWith: [] }).stream()) {
          streamed.push(item);
        }

        expect(streamed).to.eql([]);
      });
    });

    describe('tracing of the queries of insertAndFetch()', () => {
      const { Model1 } = session.models;
      const channel = diagnosticsChannel.tracingChannel('objection:query');
      const contexts = [];
      const handlers = {
        start: (ctx) => contexts.push(ctx),
        end() {},
        asyncStart() {},
        asyncEnd() {},
        error() {},
      };

      beforeEach(async () => {
        await session.populate([]);
        contexts.length = 0;
        channel.subscribe(handlers);
      });

      afterEach(() => channel.unsubscribe(handlers));

      it('should only call the queries of the relations eager', async () => {
        await Model1.query()
          .insertAndFetch({ model1Prop1: 'x' })
          .withGraphFetched('model1Relation2');

        const summary = contexts.map((it) => `${it.operation} ${it.tableName} ${it.eager}`);
        expect(summary).to.eql(['insert Model1 false', 'find Model1 false', 'find model2 true']);
      });
    });

    if (session.isMySql() && !session.isMariaDb()) {
      describe('MySQL updates with a subquery that joins the same table', () => {
        const { Model1, Model2 } = session.models;

        beforeEach(() =>
          session.populate([
            { id: 1, model1Prop1: 'a', model1Relation2: [{ idCol: 1, model2Prop1: 'x' }] },
            { id: 2, model1Prop1: 'b' },
          ]),
        );

        const joins = [
          ["join('Model1 as m')", (qb) => qb.join('Model1 as m', 'm.id', 'model2.model1_id')],
          ["join({ m: 'Model1' })", (qb) => qb.join({ m: 'Model1' }, 'm.id', 'model2.model1_id')],
          ['joinRelated()', (qb) => qb.joinRelated('model2Relation1')],
        ];

        for (const [name, join] of joins) {
          it(`should patch through a subquery with ${name}`, async () => {
            const subquery = join(Model2.query().select('model2.model1_id'));
            const count = await Model1.query()
              .patch({ model1Prop1: 'patched' })
              .whereIn('id', subquery);

            expect(count).to.be.a('number');
          });
        }
      });
    }

    if (session.isMySql()) {
      describe('MySQL graph inserts where $beforeInsert() sets some of the ids', () => {
        class Item extends Model {
          static get tableName() {
            return 'sus_graph_items';
          }

          $beforeInsert() {
            hookCalls.push(this.name);

            if (this.name === 'b') {
              this.id = 1000;
            }
          }
        }

        const hookCalls = [];
        const BoundItem = Item.bindKnex(knex);

        before(async () => {
          await knex.schema.dropTableIfExists('sus_graph_items');
          await knex.schema.createTable('sus_graph_items', (table) => {
            table.increments('id').primary();
            table.string('name');
          });
        });

        after(() => knex.schema.dropTableIfExists('sus_graph_items'));

        it('should insert every row with its id', async () => {
          const items = await BoundItem.query().insertGraph([
            { name: 'a' },
            { name: 'b' },
            { name: 'c' },
          ]);

          const rows = await knex('sus_graph_items').orderBy('name');
          expect(rows.map((it) => it.name)).to.eql(['a', 'b', 'c']);
          expect(items.map((it) => it.id)).to.eql(rows.map((it) => it.id));
          expect(rows[1].id).to.equal(1000);
          // Each hook once, though the hooks run before the inserts.
          expect(hookCalls.sort()).to.eql(['a', 'b', 'c']);
        });
      });
    }

    describe('relatedQuery().for() with a composite key that is not the id', () => {
      class A extends Model {
        static get tableName() {
          return 'sus_a';
        }

        static get idColumn() {
          return ['id1', 'id2'];
        }

        static get relationMappings() {
          return {
            b: {
              relation: Model.BelongsToOneRelation,
              modelClass: B,
              join: { from: ['sus_a.bid3', 'sus_a.bid4'], to: ['sus_b.id3', 'sus_b.id4'] },
            },
          };
        }
      }

      class B extends Model {
        static get tableName() {
          return 'sus_b';
        }

        static get idColumn() {
          return ['id3', 'id4'];
        }
      }

      const BoundA = A.bindKnex(knex);

      before(async () => {
        await knex.schema.dropTableIfExists('sus_a');
        await knex.schema.dropTableIfExists('sus_b');
        await knex.schema.createTable('sus_a', (table) => {
          table.integer('id1');
          table.string('id2');
          table.integer('bid3');
          table.string('bid4');
          table.primary(['id1', 'id2']);
        });
        await knex.schema.createTable('sus_b', (table) => {
          table.integer('id3');
          table.string('id4');
          table.string('bval');
          table.primary(['id3', 'id4']);
        });
        await knex('sus_b').insert([
          { id3: 1, id4: 'x', bval: 'b1' },
          { id3: 2, id4: 'y', bval: 'b2' },
        ]);
        await knex('sus_a').insert([
          { id1: 1, id2: '1', bid3: 2, bid4: 'y' },
          { id1: 2, id2: '2', bid3: 1, bid4: 'x' },
        ]);
      });

      after(async () => {
        await knex.schema.dropTableIfExists('sus_a');
        await knex.schema.dropTableIfExists('sus_b');
      });

      it('should find the related rows of the ids', async () => {
        const bs = await BoundA.relatedQuery('b').for([[1, '1']]);
        expect(bs.map((it) => it.bval)).to.eql(['b2']);
      });

      it('should find the related rows of a subquery', async () => {
        const bs = await BoundA.relatedQuery('b').for(BoundA.query().where('id1', 2));
        expect(bs.map((it) => it.bval)).to.eql(['b1']);
      });
    });

    describe('many-to-many keys that share a column on both sides', () => {
      class Tag extends Model {
        static get tableName() {
          return 'sus_tags';
        }

        static get idColumn() {
          return ['tenantId', 'code'];
        }
      }

      class Owner extends Model {
        static get tableName() {
          return 'sus_tag_owners';
        }

        static get idColumn() {
          return ['tenantId', 'code'];
        }

        static get relationMappings() {
          return {
            tags: {
              relation: Model.ManyToManyRelation,
              modelClass: Tag,
              join: {
                from: ['sus_tag_owners.tenantId', 'sus_tag_owners.code'],
                through: {
                  from: ['sus_owner_tags.tenantId', 'sus_owner_tags.ownerCode'],
                  to: ['sus_owner_tags.tenantId', 'sus_owner_tags.tagCode'],
                  extra: ['note'],
                },
                to: ['sus_tags.tenantId', 'sus_tags.code'],
              },
            },
          };
        }
      }

      const BoundOwner = Owner.bindKnex(knex);

      before(async () => {
        for (const table of ['sus_owner_tags', 'sus_tags', 'sus_tag_owners']) {
          await knex.schema.dropTableIfExists(table);
        }

        await knex.schema.createTable('sus_tag_owners', (table) => {
          table.integer('tenantId');
          table.string('code');
          table.primary(['tenantId', 'code']);
        });
        await knex.schema.createTable('sus_tags', (table) => {
          table.integer('tenantId');
          table.string('code');
          table.string('label');
          table.primary(['tenantId', 'code']);
        });
        await knex.schema.createTable('sus_owner_tags', (table) => {
          table.integer('tenantId');
          table.string('ownerCode');
          table.string('tagCode');
          table.string('note');
          table.primary(['tenantId', 'ownerCode', 'tagCode']);
        });
      });

      beforeEach(async () => {
        for (const table of ['sus_owner_tags', 'sus_tags', 'sus_tag_owners']) {
          await knex(table).delete();
        }

        await knex('sus_tag_owners').insert([
          { tenantId: 1, code: 'o' },
          { tenantId: 2, code: 'o' },
        ]);
        await knex('sus_tags').insert([
          { tenantId: 1, code: 'red', label: 'Red' },
          { tenantId: 1, code: 'blue', label: 'Blue' },
          { tenantId: 2, code: 'red', label: 'Red 2' },
        ]);
        await knex('sus_owner_tags').insert([
          { tenantId: 1, ownerCode: 'o', tagCode: 'red', note: 'n1' },
          { tenantId: 1, ownerCode: 'o', tagCode: 'blue', note: 'n2' },
          { tenantId: 2, ownerCode: 'o', tagCode: 'red', note: 'n3' },
        ]);
      });

      after(async () => {
        for (const table of ['sus_owner_tags', 'sus_tags', 'sus_tag_owners']) {
          await knex.schema.dropTableIfExists(table);
        }
      });

      const joinRows = () =>
        knex('sus_owner_tags')
          .orderBy(['tenantId', 'tagCode'])
          .then((rows) =>
            rows.map((it) => `${it.tenantId}/${it.ownerCode}/${it.tagCode}/${it.note}`),
          );

      it('should find the tags of one tenant', async () => {
        const owner = await BoundOwner.query().findById([1, 'o']);
        const tags = await owner.$relatedQuery('tags').orderBy('code');

        expect(tags.map((it) => `${it.label}/${it.note}`)).to.eql(['Blue/n2', 'Red/n1']);
      });

      it('should unrelate with a filter that reads another table', async () => {
        const owner = await BoundOwner.query().findById([1, 'o']);
        await owner
          .$relatedQuery('tags')
          .unrelate()
          .whereIn('sus_tags.code', knex('sus_tags').select('code').where('label', 'Red'));

        expect(await joinRows()).to.eql(['1/o/blue/n2', '2/o/red/n3']);
      });

      it('should patch the extra column with a filter that reads another table', async () => {
        const owner = await BoundOwner.query().findById([1, 'o']);
        await owner
          .$relatedQuery('tags')
          .patch({ note: 'patched' })
          .whereIn('sus_tags.code', knex('sus_tags').select('code').where('label', 'Red'));

        expect(await joinRows()).to.eql(['1/o/blue/n2', '1/o/red/patched', '2/o/red/n3']);
      });

      it('should delete the related rows of one tenant only', async () => {
        const owner = await BoundOwner.query().findById([2, 'o']);
        await owner.$relatedQuery('tags').delete().where('code', 'red');

        const tags = await knex('sus_tags').orderBy(['tenantId', 'code']);
        expect(tags.map((it) => `${it.tenantId}/${it.code}`)).to.eql(['1/blue', '1/red']);
      });

      it('should relate and load with withGraphJoined() and withGraphFetched()', async () => {
        const owner = await BoundOwner.query().findById([2, 'o']);
        await owner
          .$relatedQuery('tags')
          .relate({ tenantId: 2, code: 'red', note: 'again' })
          .catch(() => null);
        await knex('sus_tags').insert({ tenantId: 2, code: 'green', label: 'Green 2' });
        await owner.$relatedQuery('tags').relate({ tenantId: 2, code: 'green', note: 'n4' });

        for (const method of ['withGraphFetched', 'withGraphJoined']) {
          const owners = await BoundOwner.query()
            [method]('tags')
            .orderBy('sus_tag_owners.tenantId');
          const summary = owners.map(
            (it) =>
              `${it.tenantId}:${it.tags
                .map((tag) => `${tag.code}/${tag.note}`)
                .sort()
                .join(',')}`,
          );

          expect(summary).to.eql(['1:blue/n2,red/n1', '2:green/n4,red/n3']);
        }
      });
    });

    describe('relation writes filtered through joinRelated()', () => {
      const { Model1, Model2 } = session.models;

      beforeEach(() =>
        session.populate([
          {
            id: 1,
            model1Prop1: 'owner',
            model1Relation2: [
              { idCol: 1, model2Prop1: 'child x', model2Relation3: [{ id: 1, model3Prop1: 'x' }] },
              { idCol: 2, model2Prop1: 'child y', model2Relation3: [{ id: 2, model3Prop1: 'y' }] },
            ],
            model1Relation3: [
              { idCol: 3, model2Prop1: 'linked x', model2Relation3: [{ id: 3, model3Prop1: 'x' }] },
              { idCol: 4, model2Prop1: 'linked y', model2Relation3: [{ id: 4, model3Prop1: 'y' }] },
            ],
          },
        ]),
      );

      const owner = () => Model1.query().findById(1);
      const linked = async () =>
        (await (await owner()).$relatedQuery('model1Relation3').orderBy('id_col')).map(
          (it) => `${it.idCol}:${it.model2Prop1}`,
        );

      it('should patch the many-to-many rows that the join filters', async () => {
        await (await owner())
          .$relatedQuery('model1Relation3')
          .patch({ model2Prop1: 'patched' })
          .joinRelated('model2Relation3')
          .where('model2Relation3.model3Prop1', 'x');

        expect(await linked()).to.eql(['3:patched', '4:linked y']);
      });

      it('should delete the many-to-many rows that the join filters', async () => {
        await (await owner())
          .$relatedQuery('model1Relation3')
          .delete()
          .joinRelated('model2Relation3')
          .where('model2Relation3.model3Prop1', 'x');

        expect(await linked()).to.eql(['4:linked y']);
        expect(await Model2.query().findById(3)).to.equal(undefined);
      });

      it('should unrelate the many-to-many rows that the join filters', async () => {
        await (await owner())
          .$relatedQuery('model1Relation3')
          .unrelate()
          .joinRelated('model2Relation3')
          .where('model2Relation3.model3Prop1', 'x');

        expect(await linked()).to.eql(['4:linked y']);
        expect(await Model2.query().findById(3)).to.be.an(Model2);
      });

      it('should unrelate the has-many rows that the join filters', async () => {
        await (await owner())
          .$relatedQuery('model1Relation2')
          .unrelate()
          .joinRelated('model2Relation3')
          .where('model2Relation3.model3Prop1', 'x');

        const children = await Model2.query().whereIn('id_col', [1, 2]).orderBy('id_col');
        expect(children.map((it) => `${it.idCol}:${it.model1Id}`)).to.eql(['1:null', '2:1']);
      });

      it('should relate the has-many rows that the join filters', async () => {
        await (await owner())
          .$relatedQuery('model1Relation2')
          .relate([3, 4])
          .joinRelated('model2Relation3')
          .where('model2Relation3.model3Prop1', 'x');

        const rows = await Model2.query().whereIn('id_col', [3, 4]).orderBy('id_col');
        expect(rows.map((it) => `${it.idCol}:${it.model1Id}`)).to.eql(['3:1', '4:null']);
      });
    });

    describe('hooks that fail both asynchronously and synchronously', () => {
      class Item extends Model {
        static get tableName() {
          return 'sus_hook_items';
        }

        $beforeInsert() {
          if (this.name === 'async') {
            return Promise.reject(new Error('async failure'));
          }

          throw new Error('sync failure');
        }
      }

      const BoundItem = Item.bindKnex(knex);

      before(async () => {
        await knex.schema.dropTableIfExists('sus_hook_items');
        await knex.schema.createTable('sus_hook_items', (table) => {
          table.increments('id').primary();
          table.string('name');
        });
      });

      after(() => knex.schema.dropTableIfExists('sus_hook_items'));

      it('should reject the query without an unhandled rejection', async () => {
        const unhandled = [];
        const onUnhandled = (err) => unhandled.push(err);
        const listeners = process.listeners('unhandledRejection');

        process.removeAllListeners('unhandledRejection');
        process.on('unhandledRejection', onUnhandled);

        let error = null;

        try {
          await BoundItem.query().insert([{ name: 'async' }, { name: 'sync' }]);
        } catch (err) {
          error = err;
        } finally {
          await new Promise((resolve) => setTimeout(resolve, 20));
          process.removeListener('unhandledRejection', onUnhandled);

          for (const listener of listeners) {
            process.on('unhandledRejection', listener);
          }
        }

        expect(error).to.be.an(Error);
        expect(unhandled.map((it) => it.message)).to.eql([]);
      });

      it('should reject a find whose $afterFind() hooks fail that way', async () => {
        class FoundItem extends Model {
          static get tableName() {
            return 'sus_hook_items';
          }

          $afterFind() {
            if (this.name === 'async') {
              return Promise.reject(new Error('async failure'));
            }

            throw new Error('sync failure');
          }
        }

        await knex('sus_hook_items').insert([{ name: 'async' }, { name: 'sync' }]);

        const unhandled = [];
        const onUnhandled = (err) => unhandled.push(err);
        const listeners = process.listeners('unhandledRejection');

        process.removeAllListeners('unhandledRejection');
        process.on('unhandledRejection', onUnhandled);

        let error = null;

        try {
          await FoundItem.query(knex).orderBy('id');
        } catch (err) {
          error = err;
        } finally {
          await new Promise((resolve) => setTimeout(resolve, 20));
          process.removeListener('unhandledRejection', onUnhandled);

          for (const listener of listeners) {
            process.on('unhandledRejection', listener);
          }

          await knex('sus_hook_items').delete();
        }

        expect(error).to.be.an(Error);
        expect(unhandled.map((it) => it.message)).to.eql([]);
      });
    });
  });
};
