'use strict';

// Runs the benchmarks against one objection checkout.
//
//   npm run bench
//   npm run bench -- --filter rows --samples 20
//   npm run bench -- --lib ../other-checkout --out results.json

const fs = require('node:fs');
const path = require('node:path');
const { listCases, runCase, median, mad, parseArgs, formatTime, table } = require('./harness');

const opt = parseArgs(process.argv.slice(2), {
  lib: path.join(__dirname, '..'),
  filter: '',
  samples: 15,
  sampleMs: 200,
  warmupMs: 1000,
  out: '',
});

const cases = listCases(opt.filter ? new RegExp(opt.filter) : null);
const results = [];
const rows = [['scenario', 'median', '± MAD', 'ops/s']];

for (const testCase of cases) {
  const { nsPerOp } = runCase(testCase, opt.lib, opt);
  const m = median(nsPerOp);
  const result = { name: testCase.name, medianNs: m, madNs: mad(nsPerOp), nsPerOp };

  results.push(result);
  rows.push([testCase.name, formatTime(m), formatTime(result.madNs), Math.round(1e9 / m)]);
  process.stderr.write(`${testCase.name}: ${formatTime(m)}\n`);
}

console.log('\n' + table(rows));

if (opt.out) {
  fs.writeFileSync(
    opt.out,
    JSON.stringify({ lib: path.resolve(opt.lib), node: process.version, results }, null, 2),
  );
}
