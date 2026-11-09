'use strict';

// Benchmarks this fork against other Node.js ORMs and query builders on a real
// MySQL. Every contender runs every scenario in a new process, on freshly seeded
// tables, through the mysql2 driver.
//
//   npm --prefix bench/orms install
//   node bench/orms/run.js [--filter <regex>] [--contenders fork,knex,...] [--json out.json]
//
// The database is `bench_orms` on 127.0.0.1:3306 as root (the MySQL 8.4 of
// docker-compose.yml). BENCH_HOST, BENCH_PORT, BENCH_USER, BENCH_PASSWORD and
// BENCH_DB override it.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseArgs, median, mad, formatTime } = require('../harness');
const { SCENARIOS, seed } = require('./common');
const { CONTENDERS } = require('./contenders');

const opt = parseArgs(process.argv.slice(2), {
  lib: path.join(__dirname, '..', '..'),
  filter: '',
  contenders: Object.keys(CONTENDERS)
    .filter((name) => !CONTENDERS[name].optIn)
    .join(','),
  rounds: 3,
  samples: 7,
  sampleMs: 250,
  warmupMs: 1000,
  json: '',
});

async function main() {
  const filter = opt.filter ? new RegExp(opt.filter) : null;
  const scenarios = SCENARIOS.filter((name) => !filter || filter.test(name));
  const contenders = opt.contenders.split(',').filter((name) => {
    if (!CONTENDERS[name]) {
      throw new Error(`unknown contender ${name}, known: ${Object.keys(CONTENDERS).join(', ')}`);
    }
    return true;
  });

  const results = [];

  for (const scenario of scenarios) {
    // The database's own speed drifts over a run (buffer pool, redo log,
    // other processes). Each round runs every contender once, in alternating
    // order, and a contender's time is the median of its round medians.
    const rounds = new Map(contenders.map((name) => [name, []]));

    for (let round = 0; round < opt.rounds; ++round) {
      const order = round % 2 ? [...contenders].reverse() : contenders;

      for (const contender of order) {
        await seed();
        rounds.get(contender).push(runWorker(contender, scenario));
      }
    }

    const rows = contenders.map((contender) =>
      combineRounds(contender, scenario, rounds.get(contender)),
    );
    results.push(...rows);
    printScenario(scenario, rows);
  }

  printSummary(scenarios, results);

  if (opt.json) {
    fs.writeFileSync(
      opt.json,
      JSON.stringify({ date: new Date().toISOString(), node: process.version, results }, null, 2),
    );
  }
}

function combineRounds(contender, scenario, runs) {
  const timed = runs.filter((r) => r.median);

  if (timed.length === 0) {
    return runs[0];
  }

  const medians = timed.map((r) => r.median);
  const value = median(medians);

  return {
    name: scenario,
    contender,
    median: value,
    // The spread between rounds, which is larger than the one within a round.
    mad: Math.max(mad(medians), median(timed.map((r) => r.mad))),
    rounds: medians,
  };
}

function runWorker(contender, scenario) {
  try {
    const output = execFileSync(
      process.execPath,
      [
        '--expose-gc',
        path.join(__dirname, 'worker.js'),
        contender,
        scenario,
        path.resolve(opt.lib),
        String(opt.samples),
        String(opt.sampleMs),
        String(opt.warmupMs),
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 24 },
    );
    const result = JSON.parse(output.trim().split('\n').pop());

    if (result.nsPerOp) {
      result.median = median(result.nsPerOp);
      result.mad = mad(result.nsPerOp);
    }

    return result;
  } catch (err) {
    const message = String(err.stderr || err.message)
      .trim()
      .split('\n')[0];
    return { name: scenario, contender, error: message.slice(0, 200) };
  }
}

function printScenario(scenario, rows) {
  const floor = rows.find((r) => r.contender === 'knex' && r.median);
  const timed = rows.filter((r) => r.median).sort((a, b) => a.median - b.median);

  console.log(`\n${scenario}`);

  timed.forEach((r, i) => {
    const vsKnex = floor ? `${(r.median / floor.median).toFixed(2)}x knex` : '';
    console.log(
      `  ${String(i + 1).padStart(2)}. ${CONTENDERS[r.contender].label.padEnd(40)} ${formatTime(r.median).padStart(10)} ± ${(
        (r.mad / r.median) * 100
      ).toFixed(1)}%  ${vsKnex}`,
    );
  });

  for (const r of rows.filter((r) => !r.median)) {
    const why = r.unsupported ? 'not supported' : `error: ${r.error}`;
    console.log(`   -  ${CONTENDERS[r.contender].label.padEnd(40)} ${why}`);
  }
}

// Where the fork ranks among the ORMs (knex and kysely are query builders).
function printSummary(scenarios, results) {
  console.log('\nThe fork among the contenders (1 = fastest):');

  for (const scenario of scenarios) {
    const timed = results
      .filter((r) => r.name === scenario && r.median)
      .sort((a, b) => a.median - b.median);
    const rank = timed.findIndex((r) => r.contender === 'fork');

    if (rank === -1) {
      console.log(`  ${scenario}: not timed`);
      continue;
    }

    const next = rank === 0 ? timed[1] : timed[0];
    const vs = next
      ? ` (${rank === 0 ? 'ahead of' : 'behind'} ${CONTENDERS[next.contender].label} by ${(
          Math.abs(timed[rank].median / next.median - 1) * 100
        ).toFixed(1)}%)`
      : '';
    console.log(`  ${scenario}: ${rank + 1} of ${timed.length}${vs}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
