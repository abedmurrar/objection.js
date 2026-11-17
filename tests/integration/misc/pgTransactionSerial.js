const expect = require('expect.js');
const { Model } = require('../../../');

// A transaction has one connection. node-postgres runs the queries of a
// connection one at a time, pg 8 warns when more than one waits for it, and
// pg 9 will reject them. Eager loading and graph writes send their queries one
// at a time in a Postgres transaction, unless the connection uses pg's pipeline
// mode, and up to 4 at a time outside one.
module.exports = (session) => {
  if (!session.isPostgres()) {
    return;
  }

  describe('queries of graph operations in a Postgres transaction', () => {
    const knex = session.knex;
    let Owner;

    before(async () => {
      await dropTables(knex);
      await knex.schema
        .createTable('ptsOwner', (table) => {
          table.integer('id').primary();
        })
        .createTable('ptsPet', (table) => {
          table.integer('id').primary();
          table.integer('ownerId').references('ptsOwner.id');
        })
        .createTable('ptsCar', (table) => {
          table.integer('id').primary();
          table.integer('ownerId').references('ptsOwner.id');
        })
        .createTable('ptsBook', (table) => {
          table.integer('id').primary();
          table.integer('ownerId').references('ptsOwner.id');
        });

      function relatedClass(tableName) {
        return class extends Model {
          static tableName = tableName;
        };
      }

      function hasMany(modelClass) {
        return {
          relation: Model.HasManyRelation,
          modelClass,
          join: { from: 'ptsOwner.id', to: `${modelClass.tableName}.ownerId` },
        };
      }

      const Pet = relatedClass('ptsPet');
      const Car = relatedClass('ptsCar');
      const Book = relatedClass('ptsBook');

      Owner = class Owner extends Model {
        static tableName = 'ptsOwner';
        static relationMappings = {
          pets: hasMany(Pet),
          cars: hasMany(Car),
          books: hasMany(Book),
        };
      };
    });

    after(() => dropTables(knex));

    beforeEach(async () => {
      await dropRows(knex);
    });

    // Runs `fn` and returns how many of the queries it ran were running at the
    // same time at most. A transaction passes its queries' events to the knex
    // it was started from. knex sends no response event for `BEGIN;`, so the
    // transaction's own statements aren't counted.
    async function maxRunning(fn, onKnex = knex) {
      const running = new Set();
      let max = 0;

      const onQuery = (query) => {
        if (/^(begin|commit|rollback)/i.test(query.sql)) {
          return;
        }

        running.add(query.__knexQueryUid);
        max = Math.max(max, running.size);
      };
      const onDone = (_response, query) => running.delete(query.__knexQueryUid);

      onKnex.on('query', onQuery).on('query-response', onDone).on('query-error', onDone);

      try {
        await fn();
      } finally {
        onKnex.off('query', onQuery).off('query-response', onDone).off('query-error', onDone);
      }

      return max;
    }

    function graph(ids) {
      return ids.map((id) => ({
        id,
        pets: [{ id: id * 10 + 1 }, { id: id * 10 + 2 }],
        cars: [{ id: id * 10 + 1 }],
        books: [{ id: id * 10 + 1 }],
      }));
    }

    // Inserts, eager loads, and deletes the related rows of three relations.
    async function graphOperations(trx) {
      await Owner.query(trx).insertGraph(graph([1, 2]));
      const owners = await Owner.query(trx).withGraphFetched('[pets, cars, books]').orderBy('id');
      await Owner.query(trx).upsertGraph(
        owners.map(({ id }) => ({ id, pets: [], cars: [], books: [] })),
      );

      return owners;
    }

    it('should run more than one query at a time without a transaction', async () => {
      const max = await maxRunning(() => graphOperations(knex));
      expect(max).to.be.greaterThan(1);
    });

    it('should run one query at a time in a transaction', async () => {
      let owners;
      const max = await maxRunning(() =>
        knex.transaction(async (trx) => {
          owners = await graphOperations(trx);
        }),
      );

      expect(max).to.equal(1);
      expect(
        owners.map((owner) => [owner.pets.length, owner.cars.length, owner.books.length]),
      ).to.eql([
        [2, 1, 1],
        [2, 1, 1],
      ]);
      expect(await knex('ptsPet').count('* as count')).to.eql([{ count: '0' }]);
    });

    it('should run one query at a time in a transaction whatever the concurrency of the model', async () => {
      class FastOwner extends Owner {
        static concurrency = 4;
      }

      const max = await maxRunning(() =>
        knex.transaction(async (trx) => {
          await FastOwner.query(trx).insertGraph(graph([1, 2]));
          await FastOwner.query(trx).withGraphFetched('[pets, cars, books]');
        }),
      );

      expect(max).to.equal(1);
    });

    it("should run more than one query at a time in a transaction in pg's pipeline mode", async () => {
      const config = session.opt.knexConfig;
      const pipelineKnex = require('knex')({
        ...config,
        connection: { ...config.connection, pipeline: true },
      });
      let owners;

      try {
        const max = await maxRunning(
          () =>
            pipelineKnex.transaction(async (trx) => {
              owners = await graphOperations(trx);
            }),
          pipelineKnex,
        );

        expect(max).to.be.greaterThan(1);
      } finally {
        await pipelineKnex.destroy();
      }

      expect(
        owners.map((owner) => [owner.pets.length, owner.cars.length, owner.books.length]),
      ).to.eql([
        [2, 1, 1],
        [2, 1, 1],
      ]);
      expect(await knex('ptsPet').count('* as count')).to.eql([{ count: '0' }]);
    });
  });
};

async function dropRows(knex) {
  for (const table of ['ptsPet', 'ptsCar', 'ptsBook', 'ptsOwner']) {
    await knex(table).delete();
  }
}

async function dropTables(knex) {
  for (const table of ['ptsPet', 'ptsCar', 'ptsBook', 'ptsOwner']) {
    await knex.schema.dropTableIfExists(table);
  }
}
