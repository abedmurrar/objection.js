'use strict';

// Checks that two objection checkouts generate the same SQL. Runs every mock
// scenario a few times with each dialect, records the SQL and bindings of every
// query, and compares the recordings.
//
//   node bench/sql-check.js --baseline ../objection-main
//
// `--expected <file.json>` lists the differences that are known, for comparing
// with a version that differs on purpose, like objection.js 3.1.5 (see
// `npm run sql-check:upstream`). Each entry is
// `{ "scenario": "...", "client": "mysql2", "reason": "...", "link": "..." }`;
// without `client` it applies to every client. A listed difference doesn't
// fail the check, and an entry that matches no difference does, so that the
// list stays current.

const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('./harness');

const opt = parseArgs(process.argv.slice(2), {
  baseline: '',
  lib: path.join(__dirname, '..'),
  expected: '',
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
  const expected = opt.expected ? require(path.resolve(opt.expected)) : [];
  const used = new Set();
  let failed = false;

  // Whether a difference is listed in `--expected`. Prints it either way.
  function isExpected(kind, client, name, a, b) {
    const entry = expected.find(
      (it) => it.scenario === name && (it.client === undefined || it.client === client),
    );

    if (entry) {
      used.add(entry);
      console.log(`expected ${kind}  ${client}  ${name}: ${entry.reason}`);
      return true;
    }

    console.log(`DIFFERENT${kind === 'result' ? ' RESULT' : ''}  ${client}  ${name}`);
    console.log('  before: ' + a.slice(0, 2000));
    console.log('  after:  ' + b.slice(0, 2000));
    return false;
  }

  for (const client of ['pg', 'mysql2', 'sqlite3']) {
    const beforeAll = recordWith(opt.baseline, client);
    const afterAll = recordWith(opt.lib, client);
    const before = beforeAll.recordings;
    const after = afterAll.recordings;

    for (const name of Object.keys(beforeAll.results)) {
      const a = JSON.stringify(beforeAll.results[name]);
      const b = JSON.stringify(afterAll.results[name]);

      if (a !== b && !isExpected('result', client, name, a, b)) {
        failed = true;
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

      if (!isExpected('sql', client, name, a, b)) {
        failed = true;
      }
    }

    const count = Object.values(before).reduce((n, queries) => n + queries.length, 0);
    console.log(`${client}: ${Object.keys(before).length} scenarios, ${count} queries compared`);
  }

  for (const entry of expected) {
    if (!used.has(entry)) {
      failed = true;
      console.log(`NO LONGER DIFFERENT  ${entry.client ?? 'every client'}  ${entry.scenario}`);
    }
  }

  if (failed) {
    console.log('\nThe generated SQL or the results differ, or an expected difference is gone.');
    process.exit(1);
  }

  console.log(
    used.size
      ? `\nThe generated SQL and the results are identical, apart from ${used.size} expected differences.`
      : '\nThe generated SQL and the results are identical.',
  );
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

    // Several runs, to also catch differences between the first and later
    // runs (caches).
    const output = [];

    try {
      const run = await scenarios[name](objection);
      queries.length = 0;

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
    } catch (err) {
      // A scenario that throws, for example one that uses a method the other
      // version doesn't have, is a difference of its own and doesn't stop the
      // others.
      output.push({ error: String(err && err.message) });
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
