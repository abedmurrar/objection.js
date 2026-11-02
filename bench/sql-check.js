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
    const beforeAll = recordWith(opt.baseline, client);
    const afterAll = recordWith(opt.lib, client);
    const before = beforeAll.recordings;
    const after = afterAll.recordings;

    for (const name of Object.keys(beforeAll.results)) {
      const a = JSON.stringify(beforeAll.results[name]);
      const b = JSON.stringify(afterAll.results[name]);

      if (a !== b) {
        failed = true;
        console.log(`DIFFERENT RESULT  ${client}  ${name}`);
        console.log('  before: ' + a.slice(0, 2000));
        console.log('  after:  ' + b.slice(0, 2000));
      }
    }

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
    console.log('\nThe generated SQL or the results differ.');
    process.exit(1);
  }

  console.log('\nThe generated SQL and the results are identical.');
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
  const results = {};

  for (const name of Object.keys(scenarios)) {
    const queries = [];
    global.benchRecordQuery = (query) => queries.push(query);

    const run = await scenarios[name](objection);
    queries.length = 0;

    // Several runs, to also catch differences between the first and later
    // runs (caches).
    const output = [];

    for (let i = 0; i < 3; ++i) {
      let result = run();

      if (result && typeof result.then === 'function') {
        result = await result;
      } else if (result && typeof result.sql === 'string') {
        // A `toSQL()` result of a query that is only built.
        queries.push({ sql: result.sql, bindings: result.bindings });
      }

      output.push(serialize(result));
    }

    recordings[name] = queries;
    results[name] = output;
  }

  global.benchRecordQuery = null;
  process.stdout.write(JSON.stringify({ recordings, results }));
}

// The results as JSON, with the class of every model, so that a model that
// became a plain object (or the other way around) counts as a difference.
function serialize(value) {
  if (value && typeof value.sql === 'string' && Array.isArray(value.bindings)) {
    // A `toSQL()` result, which also has a random query id.
    return { sql: value.sql, bindings: value.bindings };
  }

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (value && typeof value === 'object' && value.$isObjectionModel) {
    const json = {};

    for (const key of Object.keys(value)) {
      json[key] = serialize(value[key]);
    }

    return { $class: value.constructor.name, json };
  }

  return value;
}

function sorted(queries) {
  return queries.map((query) => JSON.stringify(query)).sort();
}
