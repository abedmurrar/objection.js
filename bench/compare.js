'use strict';

// Compares two objection checkouts. The runs alternate between the two
// (A B, B A, A B, ...) so that changes in machine load affect both alike.
//
//   npm run bench:compare -- --baseline ../objection-main
//   npm run bench:compare -- --baseline ../objection-main --filter graph --rounds 7

const fs = require('node:fs');
const path = require('node:path');
const { listCases, runCase, median, mad, parseArgs, formatTime, table } = require('./harness');

const opt = parseArgs(process.argv.slice(2), {
  baseline: '',
  lib: path.join(__dirname, '..'),
  filter: '',
  rounds: 5,
  samples: 10,
  sampleMs: 150,
  warmupMs: 800,
  out: '',
});

if (!opt.baseline) {
  console.error('Usage: npm run bench:compare -- --baseline <path to an objection checkout>');
  process.exit(1);
}

const cases = listCases(opt.filter ? new RegExp(opt.filter) : null);
const rows = [['scenario', 'before', 'after', 'change', '']];
const results = [];

for (const testCase of cases) {
  const before = [];
  const after = [];

  for (let round = 0; round < opt.rounds; ++round) {
    const order = round % 2 === 0 ? ['before', 'after'] : ['after', 'before'];

    for (const which of order) {
      const lib = which === 'before' ? opt.baseline : opt.lib;
      const { nsPerOp } = runCase(testCase, lib, opt);
      (which === 'before' ? before : after).push(median(nsPerOp));
    }
  }

  const b = median(before);
  const a = median(after);
  const change = (a - b) / b;
  // A change counts when it's larger than 3 times the spread of the rounds.
  const noise = 3 * Math.max(mad(before), mad(after));
  const significant = Math.abs(a - b) > noise;

  results.push({
    name: testCase.name,
    beforeNs: b,
    afterNs: a,
    change,
    significant,
    before,
    after,
  });
  rows.push([
    testCase.name,
    formatTime(b),
    formatTime(a),
    `${change > 0 ? '+' : ''}${(change * 100).toFixed(1)}%`,
    significant ? (change < 0 ? 'faster' : 'SLOWER') : 'noise',
  ]);
  process.stderr.write(`${testCase.name}: ${formatTime(b)} -> ${formatTime(a)}\n`);
}

console.log('\n' + table(rows));

if (opt.out) {
  fs.writeFileSync(
    opt.out,
    JSON.stringify(
      {
        baseline: path.resolve(opt.baseline),
        lib: path.resolve(opt.lib),
        node: process.version,
        results,
      },
      null,
      2,
    ),
  );
}
