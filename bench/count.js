'use strict';

// Compares two checkouts by the CPU instructions each scenario executes, which,
// unlike times, barely depend on what else runs on the machine. Needs `perf` and
// `kernel.perf_event_paranoid` <= 2 (`sudo sysctl kernel.perf_event_paranoid=1`).
//
//   node bench/count.js --baseline ../objection-main [--filter execute] [--runs 3]
//   node bench/count.js --baseline ../objection-main --max-change 1
//
// With `--max-change`, it exits with 1 when a scenario executes more than that
// many percent more instructions than in the baseline. A scenario over the
// limit is measured twice more, and only fails if the median of the three is
// still over it: when the garbage collector runs moves single counts of
// scenarios that allocate a lot by up to about 1%.
//
// `--counter valgrind` counts with valgrind's cachegrind instead of perf, for
// machines without hardware counters, like GitHub's runners. Counts of the
// same code repeat within 0.2%, so one run is enough, but each process takes
// about 20 seconds more. Scenarios with threads or timers vary more.
// `--jobs` runs that many scenarios at once, which doesn't change the counts:
//
//   node bench/count.js --baseline ../main --counter valgrind --runs 1 --target 3e8 --jobs 4
//
// Each scenario runs `warmup` times, and `warmup + iterations` times, in new
// processes. The difference divided by `iterations` is the count per operation,
// without the startup and the warmup. Node runs with `--single-threaded`: the
// counts include every thread, and V8's background compiler and GC threads would
// otherwise add a varying amount (about ±10% for small operations). The number
// of iterations is chosen per scenario, for about `target` instructions.

const path = require('node:path');
const { spawn } = require('node:child_process');
const { listCases, median, parseArgs, table } = require('./harness');

const opt = parseArgs(process.argv.slice(2), {
  baseline: '',
  lib: path.join(__dirname, '..'),
  filter: '',
  runs: 2,
  target: 2e9,
  maxChange: '',
  counter: 'perf',
  jobs: 1,
});

if (!opt.baseline) {
  console.error('Usage: node bench/count.js --baseline <path to an objection checkout>');
  process.exit(1);
}

const COUNTERS = {
  perf: {
    command: 'perf',
    args: ['stat', '-x,', '-e', 'instructions:u'],
    // A line `<count>,,instructions:u,...`.
    parse(stderr) {
      const line = stderr.split('\n').find((l) => l.includes('instructions:u'));
      return line ? Number(line.split(',')[0]) : Number.NaN;
    },
  },
  valgrind: {
    command: 'valgrind',
    args: ['--tool=cachegrind', '--cache-sim=no', '--cachegrind-out-file=/dev/null'],
    // A line `==<pid>== I refs:   874,179,742`.
    parse(stderr) {
      const match = /I\s+refs:\s+([\d,]+)/.exec(stderr);
      return match ? Number(match[1].replaceAll(',', '')) : Number.NaN;
    },
  },
};

const counter = COUNTERS[opt.counter];

if (!counter) {
  console.error(`Unknown --counter ${opt.counter}, use one of ${Object.keys(COUNTERS).join(', ')}`);
  process.exit(1);
}

function count(testCase, lib, iterations) {
  const args = [
    ...counter.args,
    process.execPath,
    '--single-threaded',
    // The same hash and random seeds in every process, so that both checkouts
    // build the same hash tables.
    '--hash-seed=1',
    '--random-seed=1',
    // The same full collections in both checkouts. Without these flags,
    // a little more heap or code, from the machine or an unrelated
    // change, moved the eager loading scenarios by 7-15%: V8 runs a full
    // collection when the old generation reaches a limit, and one fell inside
    // the measured iterations of one checkout and not the other; and V8
    // starts allocating the objects of an allocation site in the old
    // generation (pretenuring) when enough of them survive the scavenges it
    // happens to run. An old generation larger than any scenario needs leaves
    // no full collection, and no pretenuring the same allocations. Neither
    // changes the counts of small queries. A fixed young generation of 16 MB
    // made them count 28-43% more instructions, so it is left to V8.
    '--initial-old-space-size=512',
    '--no-allocation-site-pretenuring',
    path.join(__dirname, 'count-worker.js'),
    testCase.scenarioFile,
    testCase.name,
    path.resolve(lib),
    String(iterations),
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(counter.command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    // The counter prints its counts, and the worker its errors, to stderr.
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (data) => {
      stderr += data;
    });
    proc.on('error', reject);
    proc.on('close', (status) => {
      const value = counter.parse(stderr);

      if (status !== 0 || Number.isNaN(value)) {
        reject(new Error(`${testCase.name} failed:\n${stderr}`));
      } else {
        resolve(value);
      }
    });
  });
}

// The iterations for about `opt.target` instructions, from a short run.
async function iterationsFor(testCase, lib) {
  const estimate = ((await count(testCase, lib, 300)) - (await count(testCase, lib, 100))) / 200;
  return Math.min(20000, Math.max(300, Math.round(opt.target / Math.max(estimate, 1))));
}

async function perOp(testCase, lib, iterations) {
  const warmup = Math.round(iterations / 2);
  const values = [];

  for (let run = 0; run < opt.runs; ++run) {
    const base = await count(testCase, lib, warmup);
    const full = await count(testCase, lib, warmup + iterations);
    values.push((full - base) / iterations);
  }

  return median(values);
}

function format(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(0);
}

async function measure(testCase) {
  // The same number of iterations for both, so that they do the same work.
  const iterations = await iterationsFor(testCase, opt.baseline);
  const before = await perOp(testCase, opt.baseline, iterations);
  const after = await perOp(testCase, opt.lib, iterations);
  console.error(`${testCase.name}: ${format(before)} -> ${format(after)} instructions/op`);
  return { testCase, name: testCase.name, before, after };
}

function changeOf({ before, after }) {
  return ((after - before) / before) * 100;
}

// Runs `fn` for every item, at most `limit` at a time, keeping the order.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function work() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work));
  return results;
}

async function main() {
  const cases = listCases(opt.filter ? new RegExp(opt.filter) : null);
  const results = await mapLimit(cases, Math.max(1, opt.jobs), measure);

  if (opt.maxChange !== '') {
    const overLimit = results.filter((result) => changeOf(result) > Number(opt.maxChange));

    await mapLimit(overLimit, Math.max(1, opt.jobs), async (result) => {
      console.error(`${result.name}: over the limit, measuring twice more`);
      const more = [await measure(result.testCase), await measure(result.testCase)];
      result.before = median([result.before, ...more.map((it) => it.before)]);
      result.after = median([result.after, ...more.map((it) => it.after)]);
    });
  }

  const rows = [];
  const tooSlow = [];

  for (const result of results) {
    const { name, before, after } = result;
    const change = changeOf(result);
    const limit = Number(opt.maxChange);

    if (opt.maxChange !== '' && change > limit) {
      tooSlow.push(`${name}: +${change.toFixed(1)}% (limit ${limit}%)`);
    }

    rows.push([
      name,
      format(before),
      format(after),
      `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
    ]);
  }

  console.log(`\n${table([['scenario', 'before', 'after', 'change'], ...rows])}`);
  console.log(
    '\nInstructions per operation (user space). Changes under about 1% are run to run variation.',
  );

  if (tooSlow.length) {
    console.log(`\nMore instructions than allowed:\n${tooSlow.map((l) => `  ${l}`).join('\n')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
