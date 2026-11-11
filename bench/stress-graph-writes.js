'use strict';

// Runs many upsertGraph() calls at once, without a transaction, on MySQL and
// MariaDB, and fails on a deadlock or lock wait timeout between calls that
// write different rows, and on any wrong result or other error. It repeats the
// test of the 4.2.2 fix, which deleted the many-to-many rows of upsertGraph()
// by id: before it, such calls deadlocked.
//
//   npm run stress:graph
//   node bench/stress-graph-writes.js --rounds 3 --databases mysql
//   node bench/stress-graph-writes.js --lib ../objection-old
//
// Each round, 20 owners each upsertGraph() their own graph at the same time.
// Each graph patches an item with a join table extra, keeps one, inserts one,
// patches a pet, inserts a pet, and drops one of its own items and, with
// `shared`, an item every owner has. Dropped items are deleted for even owners
// and unrelated for odd ones. Every combination of database, foreign keys on
// the join table, the shared item and the concurrency of the graph writes runs.
// The databases are those of docker-compose.yml, as root without a password.
//
// With the shared item, the calls write the same rows: even owners delete it,
// which with foreign keys deletes its join rows, while odd owners unrelate it.
// Writes of the same rows can deadlock with any queries (see "Graph operations
// run 4 queries at a time" in doc/fork/mysql.md), so those deadlocks are
// counted, but don't fail the test.

const path = require('node:path');
const knexFactory = require('knex');
const { parseArgs } = require('./harness');

const opt = parseArgs(process.argv.slice(2), {
  lib: path.join(__dirname, '..'),
  rounds: 20,
  owners: 20,
  databases: 'mysql,mariadb10,mariadb11',
  host: '127.0.0.1',
});

const PORTS = { mysql: 3306, mariadb10: 3307, mariadb11: 3308 };
const DB = 'objection_stress';
const { Model } = require(path.resolve(opt.lib));

async function main() {
  const totals = { calls: 0, deadlocks: 0, lockWaits: 0, otherErrors: 0, wrongResults: 0 };
  let failingLocks = 0;

  for (const database of opt.databases.split(',')) {
    for (const fk of [false, true]) {
      for (const shared of [false, true]) {
        for (const concurrency of [1, 4]) {
          const result = await runConfig({ database, fk, shared, concurrency });

          for (const key of Object.keys(totals)) {
            totals[key] += result[key];
          }

          if (!shared) {
            failingLocks += result.deadlocks + result.lockWaits;
          }
        }
      }
    }
  }

  const failed = failingLocks + totals.otherErrors + totals.wrongResults > 0;

  console.log(
    `\n${totals.calls} calls: ${totals.deadlocks} deadlocks, ${totals.lockWaits} lock wait timeouts, ` +
      `${totals.otherErrors} other errors, ${totals.wrongResults} rounds with wrong results. ` +
      `${failingLocks} of the deadlocks and lock waits were between calls that write different rows.`,
  );

  process.exitCode = failed ? 1 : 0;
}

async function runConfig({ database, fk, shared, concurrency }) {
  const port = PORTS[database];

  if (!port) {
    throw new Error(`unknown database ${database}, use ${Object.keys(PORTS).join(', ')}`);
  }

  const connection = { host: opt.host, port, user: 'root', password: '' };
  const admin = knexFactory({ client: 'mysql2', connection });
  await admin.raw(`create database if not exists ${DB}`);
  await admin.destroy();

  const knex = knexFactory({
    client: 'mysql2',
    connection: { ...connection, database: DB },
    pool: { min: 0, max: 10 },
  });

  const failingStatements = new Map();
  knex.on('query-error', (err, query) => {
    const key = `${err.code} ${String(query.sql).slice(0, 160).replace(/\d+/g, 'N')}`;
    failingStatements.set(key, (failingStatements.get(key) || 0) + 1);
  });

  const { Owner } = defineModels(knex, concurrency);
  const result = { calls: 0, deadlocks: 0, lockWaits: 0, otherErrors: 0, wrongResults: 0 };
  const otherErrors = new Map();

  try {
    for (let round = 0; round < opt.rounds; ++round) {
      await createSchema(knex, fk);
      await seed(knex, shared);

      const results = await Promise.allSettled(
        Array.from({ length: opt.owners }, (_, i) => upsertOwner(Owner, i + 1, round)),
      );

      for (const res of results) {
        result.calls++;

        if (res.status === 'fulfilled') {
          continue;
        }

        // objection wraps database errors, with the driver's on `nativeError`.
        const errno = res.reason.nativeError?.errno ?? res.reason.errno;

        if (errno === 1213) {
          result.deadlocks++;
        } else if (errno === 1205) {
          result.lockWaits++;
        } else {
          result.otherErrors++;
          const key = String(res.reason.message).slice(0, 160);
          otherErrors.set(key, (otherErrors.get(key) || 0) + 1);
        }
      }

      // A failed call leaves its owner's graph half written, so the results
      // are only checked in rounds where every call succeeded.
      if (results.every((res) => res.status === 'fulfilled')) {
        const wrong = await check(knex, round);

        if (wrong) {
          result.wrongResults++;
          otherErrors.set(wrong, (otherErrors.get(wrong) || 0) + 1);
        }
      }
    }
  } finally {
    await knex.destroy();
  }

  const ok = result.calls - result.deadlocks - result.lockWaits - result.otherErrors;
  console.log(
    `${database.padEnd(9)} fk ${fk ? 'yes' : 'no '}  shared ${shared ? 'yes' : 'no '}  ` +
      `concurrency ${concurrency}: ${ok}/${result.calls} ok, ${result.deadlocks} deadlocks, ` +
      `${result.lockWaits} lock waits, ${result.otherErrors} other, ${result.wrongResults} wrong rounds`,
  );

  for (const [message, count] of [...otherErrors, ...failingStatements]) {
    console.log(`  ${count} x ${message}`);
  }

  return result;
}

function defineModels(knex, concurrency) {
  class Pet extends Model {
    static tableName = 'pet';
    static concurrency = concurrency;
  }

  class Item extends Model {
    static tableName = 'item';
    static concurrency = concurrency;
  }

  class Owner extends Model {
    static tableName = 'owner';
    static concurrency = concurrency;
    static relationMappings = {
      items: {
        relation: Model.ManyToManyRelation,
        modelClass: Item,
        join: {
          from: 'owner.id',
          through: { from: 'owner_item.ownerId', to: 'owner_item.itemId', extra: ['extra'] },
          to: 'item.id',
        },
      },
      pets: {
        relation: Model.HasManyRelation,
        modelClass: Pet,
        join: { from: 'owner.id', to: 'pet.ownerId' },
      },
    };
  }

  return { Owner: Owner.bindKnex(knex) };
}

function upsertOwner(Owner, ownerId, round) {
  const ownItem = (n) => ownerId * 10 + n;

  return Owner.query().upsertGraph(
    {
      id: ownerId,
      name: `owner ${ownerId} round ${round}`,
      items: [
        { id: ownItem(1), name: `patched ${round}`, extra: round },
        { id: ownItem(2) },
        { name: `new item of ${ownerId}`, extra: 7 },
      ],
      pets: [{ id: ownerId * 10 + 1, name: `pet ${round}` }, { name: 'new pet' }],
    },
    { unrelate: ownerId % 2 === 1 ? ['items'] : false },
  );
}

async function createSchema(knex, fk) {
  await knex.schema
    .dropTableIfExists('owner_item')
    .dropTableIfExists('pet')
    .dropTableIfExists('item')
    .dropTableIfExists('owner');

  await knex.schema
    .createTable('owner', (t) => {
      t.increments('id').primary();
      t.string('name');
    })
    .createTable('item', (t) => {
      t.increments('id').primary();
      t.string('name');
    })
    .createTable('pet', (t) => {
      t.increments('id').primary();
      t.integer('ownerId').unsigned();
      t.string('name');
    })
    .createTable('owner_item', (t) => {
      t.increments('id').primary();
      t.integer('ownerId').unsigned();
      t.integer('itemId').unsigned();
      t.integer('extra');

      // Foreign keys get an index each in InnoDB. Without them the join table
      // has no index besides the primary key, so every statement scans it.
      if (fk) {
        t.foreign('ownerId').references('owner.id').onDelete('CASCADE');
        t.foreign('itemId').references('item.id').onDelete('CASCADE');
      }
    });
}

async function seed(knex, shared) {
  const owners = [];
  const items = [{ id: 1, name: 'shared' }];
  const joins = [];
  const pets = [];

  for (let o = 1; o <= opt.owners; ++o) {
    owners.push({ id: o, name: `owner ${o}` });

    if (shared) {
      joins.push({ ownerId: o, itemId: 1, extra: 0 });
    }

    for (let n = 1; n <= 3; ++n) {
      items.push({ id: o * 10 + n, name: `item ${o}.${n}` });
      joins.push({ ownerId: o, itemId: o * 10 + n, extra: n });
    }

    for (let n = 1; n <= 2; ++n) {
      pets.push({ id: o * 10 + n, ownerId: o, name: `pet ${o}.${n}` });
    }
  }

  await knex('owner').insert(owners);
  await knex('item').insert(items);
  await knex('owner_item').insert(joins);
  await knex('pet').insert(pets);
}

// Whether every owner ended up with exactly the graph it asked for. Returns
// what's wrong, or null.
async function check(knex, round) {
  for (let o = 1; o <= opt.owners; ++o) {
    const rows = await knex('owner_item')
      .join('item', 'item.id', 'owner_item.itemId')
      .where('owner_item.ownerId', o)
      .orderBy('item.id')
      .select('item.id', 'item.name', 'owner_item.extra');

    const ids = rows.map((r) => r.id);
    const patched = rows.find((r) => r.id === o * 10 + 1);

    if (
      rows.length !== 3 ||
      !ids.includes(o * 10 + 1) ||
      !ids.includes(o * 10 + 2) ||
      ids.includes(1) ||
      ids.includes(o * 10 + 3) ||
      !patched ||
      patched.extra !== round ||
      patched.name !== `patched ${round}`
    ) {
      return `round ${round}: owner ${o} has the wrong items: ${JSON.stringify(rows)}`;
    }

    const pets = await knex('pet').where('ownerId', o).orderBy('id');

    if (pets.length !== 2 || pets[0].name !== `pet ${round}` || pets[1].name !== 'new pet') {
      return `round ${round}: owner ${o} has the wrong pets: ${JSON.stringify(pets)}`;
    }
  }

  // Deleted items are gone, unrelated ones stay.
  for (let o = 1; o <= opt.owners; ++o) {
    const exists = await knex('item')
      .where('id', o * 10 + 3)
      .first();

    if (o % 2 === 0 ? exists : !exists) {
      return `round ${round}: item ${o * 10 + 3} was ${exists ? 'kept' : 'deleted'}`;
    }
  }

  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
