'use strict';

// Checks that two objection checkouts generate the same SQL. Runs every mock
// scenario a few times with each dialect, records the SQL and bindings of every
// query, and compares the recordings.
//
//   node bench/sql-check.js --baseline ../objection-main

const path = require('path');
const { execFileSync } = require('child_process');
const { parseArgs } = require('./harness');

const opt = parseArgs(process.argv.slice(2), {
  baseline: '',
  lib: path.join(__dirname, '..'),
});

if (!opt.baseline) {
  console.error('Usage: node bench/sql-check.js --baseline <path to an objection checkout>');
  process.exit(1);
}

if (process.argv.includes('--record')) {
  record().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  compare();
}

function compare() {
  let failed = false;

  for (const client of ['pg', 'mysql2', 'sqlite3']) {
    const before = recordWith(opt.baseline, client);
    const after = recordWith(opt.lib, client);

    for (const name of Object.keys(before)) {
      const a = JSON.stringify(before[name]);
      const b = JSON.stringify(after[name]);

      if (a === b) {
        continue;
      }

      // Queries that run concurrently can finish in a different order.
      if (JSON.stringify(sorted(before[name])) === JSON.stringify(sorted(after[name]))) {
        console.log(`same queries, different order  ${client}  ${name}`);
        continue;
      }

      failed = true;
      console.log(`DIFFERENT  ${client}  ${name}`);
      console.log('  before: ' + a.slice(0, 2000));
      console.log('  after:  ' + b.slice(0, 2000));
    }

    const count = Object.values(before).reduce((n, queries) => n + queries.length, 0);
    console.log(`${client}: ${Object.keys(before).length} scenarios, ${count} queries compared`);
  }

  if (failed) {
    console.log('\nThe generated SQL differs.');
    process.exit(1);
  }

  console.log('\nThe generated SQL is identical.');
}

function recordWith(lib, client) {
  const output = execFileSync(
    process.execPath,
    [__filename, '--record', '--lib', lib, '--baseline', '-'],
    {
      encoding: 'utf8',
      env: { ...process.env, BENCH_CLIENT: client },
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 1 << 28,
    },
  );

  return JSON.parse(output);
}

async function record() {
  const objection = require(path.resolve(opt.lib));
  const scenarios = require('./scenarios/mock');
  const recordings = {};

  for (const name of Object.keys(scenarios)) {
    const queries = [];
    global.benchRecordQuery = (query) => queries.push(query);

    const run = await scenarios[name](objection);
    queries.length = 0;

    // Several runs, to also catch differences between the first and later
    // runs (caches).
    for (let i = 0; i < 3; ++i) {
      const result = run();

      if (result && typeof result.then === 'function') {
        await result;
      } else if (result && typeof result.sql === 'string') {
        // A `toSQL()` result of a query that is only built.
        queries.push({ sql: result.sql, bindings: result.bindings });
      }
    }

    recordings[name] = queries;
  }

  global.benchRecordQuery = null;
  process.stdout.write(JSON.stringify(recordings));
}

function sorted(queries) {
  return queries.map((query) => JSON.stringify(query)).sort();
}
