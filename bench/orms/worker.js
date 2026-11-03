'use strict';

// Runs one scenario of one contender in this process and prints the result as
// JSON. Started by run.js with `node --expose-gc`.

const path = require('node:path');
const { CONTENDERS } = require('./contenders');

async function main() {
  const [contenderName, scenarioName, lib, samples, sampleMs, warmupMs] = process.argv.slice(2);
  const contender = CONTENDERS[contenderName];
  const { scenarios, close } = await require(
    path.join(__dirname, 'contenders', contender.file),
  ).create({
    ...contender.options,
    lib,
  });

  try {
    const run = scenarios[scenarioName];

    if (!run) {
      return print({ name: scenarioName, contender: contenderName, unsupported: true });
    }

    // One run first, so that a contender that doesn't support the scenario is
    // reported instead of timed.
    try {
      await run();
    } catch (err) {
      return print({
        name: scenarioName,
        contender: contenderName,
        error: String(err.message || err).slice(0, 200),
      });
    }

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
        batch = Math.min(batch, 1e6);
      }
    }

    const nsPerOp = [];

    for (let i = 0; i < Number(samples); ++i) {
      global.gc();
      const start = now();
      await runBatch(run, batch);
      nsPerOp.push((now() - start) / batch);
    }

    print({ name: scenarioName, contender: contenderName, batch, nsPerOp });
  } finally {
    await close();
  }
}

async function runBatch(run, n) {
  for (let i = 0; i < n; ++i) {
    await run();
  }
}

function now() {
  return Number(process.hrtime.bigint());
}

function print(result) {
  process.stdout.write(JSON.stringify(result) + '\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(String((err && err.stack) || err) + '\n');
    process.exit(1);
  });
