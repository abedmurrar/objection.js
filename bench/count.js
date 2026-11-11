'use strict';

// Compares two checkouts by the CPU instructions each scenario executes, which,
// unlike times, barely depend on what else runs on the machine. Needs `perf` and
// `kernel.perf_event_paranoid` <= 2 (`sudo sysctl kernel.perf_event_paranoid=1`).
//
//   node bench/count.js --baseline ../objection-main [--filter execute] [--runs 3]
//   node bench/count.js --baseline ../objection-main --max-change 1
//
// With `--max-change`, it exits with 1 when a scenario executes more than that
// many percent more instructions than in the baseline. CI runs it that way.
//
// Each scenario runs `warmup` times, and `warmup + iterations` times, in new
// processes. The difference divided by `iterations` is the count per operation,
// without the startup and the warmup. Node runs with `--single-threaded`: the
// counts include every thread, and V8's background compiler and GC threads would
// otherwise add a varying amount (about ±10% for small operations). The number
// of iterations is chosen per scenario, for about `target` instructions.

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { listCases, median, parseArgs, table } = require('./harness');

const opt = parseArgs(process.argv.slice(2), {
  baseline: '',
  lib: path.join(__dirname, '..'),
  filter: '',
  runs: 2,
  target: 2e9,
  maxChange: '',
});

// The scenarios whose counts vary more than the others, with their own limit.
// The mock withGraphJoined count moves 3–6% with unrelated changes to the code,
// while its wall time and CPU profile stay the same, probably because of V8's
// decisions about the join result parser. Lower this once that's understood.
const MAX_CHANGE_OVERRIDES = {
  'graph: withGraphJoined [pets.toys] x100': 6,
};

if (!opt.baseline) {
  console.error('Usage: node bench/count.js --baseline <path to an objection checkout>');
  process.exit(1);
}

function count(testCase, lib, iterations) {
  const proc = spawnSync(
    'perf',
    [
      'stat',
      '-x,',
      '-e',
      'instructions:u',
      process.execPath,
      '--single-threaded',
      path.join(__dirname, 'count-worker.js'),
      testCase.scenarioFile,
      testCase.name,
      path.resolve(lib),
      String(iterations),
    ],
    { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] },
  );

  // perf prints its counts, and the worker its errors, to stderr.
  const line = proc.stderr.split('\n').find((l) => l.includes('instructions:u'));

  if (proc.status !== 0 || !line) {
    throw new Error(`${testCase.name} failed:\n${proc.stderr}`);
  }

  return Number(line.split(',')[0]);
}

// The iterations for about `opt.target` instructions, from a short run.
function iterationsFor(testCase, lib) {
  const estimate = (count(testCase, lib, 300) - count(testCase, lib, 100)) / 200;
  return Math.min(20000, Math.max(300, Math.round(opt.target / Math.max(estimate, 1))));
}

function perOp(testCase, lib, iterations) {
  const warmup = Math.round(iterations / 2);
  const values = [];

  for (let run = 0; run < opt.runs; ++run) {
    const base = count(testCase, lib, warmup);
    const full = count(testCase, lib, warmup + iterations);
    values.push((full - base) / iterations);
  }

  return median(values);
}

function format(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(0);
}

const cases = listCases(opt.filter ? new RegExp(opt.filter) : null);
const rows = [];
const tooSlow = [];

for (const testCase of cases) {
  // The same number of iterations for both, so that they do the same work.
  const iterations = iterationsFor(testCase, opt.baseline);
  const before = perOp(testCase, opt.baseline, iterations);
  const after = perOp(testCase, opt.lib, iterations);
  const change = ((after - before) / before) * 100;
  const limit = MAX_CHANGE_OVERRIDES[testCase.name] ?? Number(opt.maxChange);

  if (opt.maxChange !== '' && change > limit) {
    tooSlow.push(`${testCase.name}: +${change.toFixed(1)}% (limit ${limit}%)`);
  }

  rows.push([
    testCase.name,
    format(before),
    format(after),
    `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
  ]);
  console.error(`${testCase.name}: ${format(before)} -> ${format(after)} instructions/op`);
}

console.log(`\n${table([['scenario', 'before', 'after', 'change'], ...rows])}`);
console.log(
  '\nInstructions per operation (user space). Changes under about 1% are run to run variation.',
);

if (tooSlow.length) {
  console.log(`\nMore instructions than allowed:\n${tooSlow.map((l) => `  ${l}`).join('\n')}`);
  process.exitCode = 1;
}
