'use strict';

// Runs one scenario in this process and prints the result as JSON.
// Started by run.js and compare.js with `node --expose-gc`.

const path = require('node:path');

async function main() {
  const [scenarioFile, caseName, lib, samples, sampleMs, warmupMs] = process.argv.slice(2);
  const objection = require(path.resolve(lib));
  const factory = require(path.resolve(scenarioFile))[caseName];
  const run = await factory(objection);

  const isAsync = isPromise(run());
  const runBatch = isAsync ? runAsyncBatch : runSyncBatch;

  // Warm up, and find a batch size that takes about `sampleMs`.
  let batch = 1;
  const warmupStart = now();

  while (now() - warmupStart < Number(warmupMs) * 1e6) {
    const start = now();
    await runBatch(run, batch);
    const elapsed = now() - start;

    if (elapsed < Number(sampleMs) * 1e6) {
      batch = Math.max(
        batch + 1,
        Math.ceil((batch * Number(sampleMs) * 1e6) / Math.max(elapsed, 1)),
      );
      batch = Math.min(batch, 1e7);
    }
  }

  const nsPerOp = [];

  for (let i = 0; i < Number(samples); ++i) {
    global.gc();
    const start = now();
    await runBatch(run, batch);
    nsPerOp.push((now() - start) / batch);
  }

  process.stdout.write(JSON.stringify({ name: caseName, batch, nsPerOp }) + '\n');
  process.exit(0);
}

function runSyncBatch(run, n) {
  for (let i = 0; i < n; ++i) {
    run();
  }
}

async function runAsyncBatch(run, n) {
  for (let i = 0; i < n; ++i) {
    await run();
  }
}

function now() {
  return Number(process.hrtime.bigint());
}

function isPromise(value) {
  return value !== null && typeof value === 'object' && typeof value.then === 'function';
}

main().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exit(1);
});
