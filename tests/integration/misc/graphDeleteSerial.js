const expect = require('expect.js');
const { Model } = require('../../../');

// On MySQL and MariaDB, two unrelates of one join table at once, of the join
// rows of different parents, deadlocked with each other on MariaDB 10.6, in a
// third of the upsertGraph() calls that unrelated a row from two parents. The
// unrelates of a relation are now one query for all parents, and the other
// many-to-many deletes run one at a time. Found by graphFuzz.js.
module.exports = (session) => {
  if (!session.isMySql()) {
    return;
  }

  describe('upsertGraph many-to-many deletes of several parents on MySQL', () => {
    const knex = session.knex;
    let Owner;
    let OwnerWithJoinHook;
    let joinDeleteHookCalls;

    before(async () => {
      await dropTables(knex);
      await knex.schema
        .createTable('sdOwner', (table) => {
          table.integer('tenant');
          table.integer('id');
          table.string('name');
          table.primary(['tenant', 'id']);
        })
        .createTable('sdTag', (table) => {
          table.integer('id').primary();
          table.string('name');
        })
        .createTable('sdOwnerTag', (table) => {
          table.integer('ownerTenant');
          table.integer('ownerId');
          table.integer('tagId').references('sdTag.id');
          table.integer('note');
          table.primary(['ownerTenant', 'ownerId', 'tagId']);
          table.foreign(['ownerTenant', 'ownerId']).references(['tenant', 'id']).inTable('sdOwner');
        });

      class Tag extends Model {
        static tableName = 'sdTag';
      }

      class OwnerTag extends Model {
        static tableName = 'sdOwnerTag';
        static idColumn = ['ownerTenant', 'ownerId', 'tagId'];

        static beforeDelete() {
          joinDeleteHookCalls++;
        }
      }

      function tagsRelation(joinModelClass) {
        return {
          relation: Model.ManyToManyRelation,
          modelClass: Tag,
          join: {
            from: ['sdOwner.tenant', 'sdOwner.id'],
            through: {
              ...(joinModelClass ? { modelClass: joinModelClass } : {}),
              from: ['sdOwnerTag.ownerTenant', 'sdOwnerTag.ownerId'],
              to: 'sdOwnerTag.tagId',
              extra: ['note'],
            },
            to: 'sdTag.id',
          },
        };
      }

      Owner = class Owner extends Model {
        static tableName = 'sdOwner';
        static idColumn = ['tenant', 'id'];
        static relationMappings = { tags: tagsRelation(null) };
      };

      OwnerWithJoinHook = class OwnerWithJoinHook extends Model {
        static tableName = 'sdOwner';
        static idColumn = ['tenant', 'id'];
        static relationMappings = { tags: tagsRelation(OwnerTag) };
      };
    });

    after(() => dropTables(knex));

    beforeEach(async () => {
      joinDeleteHookCalls = 0;
      await knex('sdOwnerTag').delete();
      await knex('sdOwner').delete();
      await knex('sdTag').delete();
      await knex('sdTag').insert([1, 2, 3, 4, 5].map((id) => ({ id, name: `tag ${id}` })));
      await knex('sdOwner').insert([1, 2, 3, 4].map((id) => ({ tenant: 1, id, name: 'a' })));
    });

    // Runs `fn` and returns the deletes of the join table it ran, and how many
    // of them ran at the same time at most.
    async function recordJoinTableDeletes(fn) {
      const running = new Set();
      const sql = [];
      let maxRunning = 0;

      const onQuery = (query) => {
        if (/^delete from `sdOwnerTag`/.test(query.sql)) {
          sql.push(query.sql);
          running.add(query.__knexQueryUid);
          maxRunning = Math.max(maxRunning, running.size);
        }
      };
      const onDone = (_response, query) => running.delete(query.__knexQueryUid);

      knex.on('query', onQuery).on('query-response', onDone).on('query-error', onDone);

      try {
        await fn();
      } finally {
        knex.off('query', onQuery).off('query-response', onDone).off('query-error', onDone);
      }

      return { sql, maxRunning };
    }

    function joinRows() {
      return knex('sdOwnerTag')
        .orderBy(['ownerId', 'tagId'])
        .select('ownerId', 'tagId')
        .then((rows) => rows.map((row) => [row.ownerId, row.tagId]));
    }

    it('should unrelate the rows of several parents in one query', async () => {
      await knex('sdOwnerTag').insert([
        { ownerTenant: 1, ownerId: 3, tagId: 1 },
        { ownerTenant: 1, ownerId: 3, tagId: 4 },
        { ownerTenant: 1, ownerId: 4, tagId: 1 },
      ]);

      const { sql, maxRunning } = await recordJoinTableDeletes(() =>
        Owner.query(knex).upsertGraph(
          [1, 3, 4].map((id) => ({ tenant: 1, id, name: 'a', tags: [] })),
          { relate: ['tags'], unrelate: ['tags'] },
        ),
      );

      expect(sql).to.have.length(1);
      expect(sql[0]).to.contain(
        '(`sdOwnerTag`.`ownerTenant`, `sdOwnerTag`.`ownerId`, `sdOwnerTag`.`tagId`) in',
      );
      expect(maxRunning).to.equal(1);
      expect(await joinRows()).to.eql([]);
      expect(await knex('sdTag')).to.have.length(5);
    });

    it('should only unrelate the pairs of owner and related row of the graph', async () => {
      await knex('sdOwnerTag').insert([
        { ownerTenant: 1, ownerId: 3, tagId: 1 },
        { ownerTenant: 1, ownerId: 3, tagId: 4 },
        { ownerTenant: 1, ownerId: 4, tagId: 1 },
        { ownerTenant: 1, ownerId: 4, tagId: 4 },
      ]);

      // Owner 3 unrelates tag 1 and owner 4 tag 4. Owners 3 and 4 times tags 1
      // and 4 would unrelate all four.
      await Owner.query(knex).upsertGraph(
        [
          { tenant: 1, id: 3, tags: [{ id: 4 }] },
          { tenant: 1, id: 4, tags: [{ id: 1 }] },
        ],
        { relate: ['tags'], unrelate: ['tags'] },
      );

      expect(await joinRows()).to.eql([
        [3, 4],
        [4, 1],
      ]);
    });

    it('should unrelate one parent at a time when the join model has delete hooks', async () => {
      await knex('sdOwnerTag').insert([
        { ownerTenant: 1, ownerId: 3, tagId: 1 },
        { ownerTenant: 1, ownerId: 4, tagId: 1 },
      ]);

      const { sql, maxRunning } = await recordJoinTableDeletes(() =>
        OwnerWithJoinHook.query(knex).upsertGraph(
          [3, 4].map((id) => ({ tenant: 1, id, tags: [] })),
          { relate: ['tags'], unrelate: ['tags'] },
        ),
      );

      expect(sql).to.have.length(2);
      expect(maxRunning).to.equal(1);
      expect(joinDeleteHookCalls).to.equal(2);
      expect(await joinRows()).to.eql([]);
    });
  });
};

function dropTables(knex) {
  return knex.schema
    .dropTableIfExists('sdOwnerTag')
    .dropTableIfExists('sdTag')
    .dropTableIfExists('sdOwner');
}
