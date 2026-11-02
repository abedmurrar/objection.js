'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SCENARIO_DIR = path.join(__dirname, 'scenarios');

function listCases(filter) {
  const cases = [];

  for (const file of fs.readdirSync(SCENARIO_DIR).sort()) {
    if (!file.endsWith('.js')) {
      continue;
    }

    const scenarioFile = path.join(SCENARIO_DIR, file);

    for (const name of Object.keys(require(scenarioFile))) {
      if (!filter || filter.test(name)) {
        cases.push({ scenarioFile, name });
      }
    }
  }

  return cases;
}

// Runs a case in a new process, so that the JIT state of other cases doesn't
// affect it.
function runCase(testCase, lib, opt) {
  const output = execFileSync(
    process.execPath,
    [
      '--expose-gc',
      path.join(__dirname, 'worker.js'),
      testCase.scenarioFile,
      testCase.name,
      lib,
      String(opt.samples),
      String(opt.sampleMs),
      String(opt.warmupMs),
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 24 },
  );

  return JSON.parse(output.trim().split('\n').pop());
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Median absolute deviation.
function mad(values) {
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

function parseArgs(argv, defaults) {
  const opt = { ...defaults };

  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i];

    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    opt[key] = typeof defaults[key] === 'number' ? Number(value) : value;
  }

  return opt;
}

function formatTime(ns) {
  if (ns >= 1e6) {
    return (ns / 1e6).toFixed(2) + ' ms';
  }

  if (ns >= 1e3) {
    return (ns / 1e3).toFixed(1) + ' µs';
  }

  return ns.toFixed(0) + ' ns';
}

function table(rows) {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((row) => String(row[i]).length)));

  return rows
    .map((row, r) => {
      const line = row
        .map((cell, i) =>
          i === 0 ? String(cell).padEnd(widths[i]) : String(cell).padStart(widths[i]),
        )
        .join('  ');

      return r === 0 ? line + '\n' + widths.map((w) => '-'.repeat(w)).join('  ') : line;
    })
    .join('\n');
}

module.exports = { listCases, runCase, median, mad, parseArgs, formatTime, table };
