'use strict';

// Runs a scenario a fixed number of times and exits. Run by count.js under
// `perf stat`, which counts the instructions of the whole process.

const path = require('node:path');

async function main() {
  const [scenarioFile, caseName, lib, iterations] = process.argv.slice(2);
  const objection = require(path.resolve(lib));
  const factory = require(path.resolve(scenarioFile))[caseName];
  const run = await factory(objection);
  const n = Number(iterations);

  for (let i = 0; i < n; ++i) {
    const result = run();

    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      await result;
    }
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exit(1);
});
