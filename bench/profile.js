'use strict';

// Profiles one scenario and prints the functions with the most self time.
//
//   node bench/profile.js "<mock or sqlite scenario name>" [--ms 3000] [--top 30]
//   node bench/profile.js "<ORM scenario name>" --orm [--contender fork]
//
// The .cpuprofile files are written to bench/.profiles/ and open in Chrome
// DevTools (Performance tab) or speedscope.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { listCases, parseArgs } = require('./harness');

const name = process.argv[2];
const opt = parseArgs(process.argv.slice(3), {
  lib: path.join(__dirname, '..'),
  ms: 3000,
  top: 30,
  orm: 'false',
  contender: 'fork',
});

if (!name) {
  console.error('Usage: node bench/profile.js "<scenario name>" [--orm] [--ms 3000] [--top 30]');
  process.exit(1);
}

const dir = path.join(__dirname, '.profiles');
fs.mkdirSync(dir, { recursive: true });
const before = new Set(fs.readdirSync(dir));

const nodeArgs = ['--expose-gc', '--cpu-prof', `--cpu-prof-dir=${dir}`];

if (opt.orm === 'true') {
  // Seed first, then run the ORM worker with a single long sample.
  execFileSync(process.execPath, ['-e', "require('./bench/orms/common').seed()"], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
  execFileSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(__dirname, 'orms', 'worker.js'),
      opt.contender,
      name,
      path.resolve(opt.lib),
      '1',
      String(opt.ms),
      '500',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
} else {
  const testCase = listCases(null).find((c) => c.name === name);

  if (!testCase) {
    console.error(
      `unknown scenario "${name}". Scenarios:\n  ${listCases(null)
        .map((c) => c.name)
        .join('\n  ')}`,
    );
    process.exit(1);
  }

  execFileSync(
    process.execPath,
    [
      ...nodeArgs,
      path.join(__dirname, 'worker.js'),
      testCase.scenarioFile,
      testCase.name,
      path.resolve(opt.lib),
      '1',
      String(opt.ms),
      '500',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

const file = fs.readdirSync(dir).find((f) => !before.has(f) && f.endsWith('.cpuprofile'));
const profile = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

// Self time per function: samples whose top frame is the node.
const selfSamples = new Map();
for (const id of profile.samples) {
  selfSamples.set(id, (selfSamples.get(id) || 0) + 1);
}

const byFunction = new Map();
let total = 0;

for (const node of profile.nodes) {
  const count = selfSamples.get(node.id) || 0;
  total += count;

  if (!count) {
    continue;
  }

  const { functionName, url, lineNumber } = node.callFrame;
  const where = url
    ? `${path.relative(process.cwd(), url.replace('file://', ''))}:${lineNumber + 1}`
    : '';
  const key = `${functionName || '(anonymous)'} ${where}`;
  byFunction.set(key, (byFunction.get(key) || 0) + count);
}

console.log(`${path.join(dir, file)}\n\nself time  function`);

for (const [key, count] of [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, Number(opt.top))) {
  console.log(`${((count / total) * 100).toFixed(1).padStart(8)}%  ${key}`);
}
