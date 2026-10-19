'use strict';

// Measures how expensive the typings are to check.
//
//   node scripts/typings-bench.js           print the numbers
//   node scripts/typings-bench.js --check   fail if they grew too much
//   node scripts/typings-bench.js --update  store the numbers as the new baseline
//
// Instantiation and type counts are deterministic for a given TypeScript
// version, so they are compared instead of the (noisy) check time.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const baselinePath = path.join(rootDir, 'tests', 'ts-bench-baseline.json');
// Allowed growth compared to the baseline before `--check` fails.
const TOLERANCE = 1.1;
const METRICS = ['Types', 'Instantiations'];

function measure() {
  const tsc = path.join(rootDir, 'node_modules', '.bin', 'tsc');
  let output;

  try {
    output = execFileSync(tsc, ['-p', rootDir, '--extendedDiagnostics'], { encoding: 'utf8' });
  } catch (err) {
    console.error(err.stdout || err.message);
    process.exit(1);
  }

  const result = {};

  for (const line of output.split('\n')) {
    const match = line.match(/^([\w ]+):\s+([\d.]+)/);

    if (match) {
      result[match[1].trim()] = Number(match[2]);
    }
  }

  return result;
}

function main() {
  const args = process.argv.slice(2);
  const result = measure();
  const typescriptVersion = require('typescript').version;

  for (const metric of [...METRICS, 'Check time', 'Memory used']) {
    console.log(`${metric.padEnd(16)} ${result[metric]}`);
  }

  if (args.includes('--update')) {
    const baseline = { typescript: typescriptVersion };
    METRICS.forEach((metric) => (baseline[metric] = result[metric]));
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`baseline written to ${path.relative(rootDir, baselinePath)}`);
  } else if (args.includes('--check')) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

    if (baseline.typescript !== typescriptVersion) {
      console.log(`baseline is for typescript ${baseline.typescript}, skipping the check`);
      return;
    }

    const failures = METRICS.filter((metric) => result[metric] > baseline[metric] * TOLERANCE);

    for (const metric of failures) {
      console.error(
        `${metric} grew from ${baseline[metric]} to ${result[metric]} (more than ${Math.round(
          (TOLERANCE - 1) * 100,
        )}%). If this is expected, run \`npm run bench:typings -- --update\`.`,
      );
    }

    if (failures.length) {
      process.exit(1);
    }
  }
}

main();
