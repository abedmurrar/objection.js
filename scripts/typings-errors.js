'use strict';

// Checks the error messages produced by the typings.
//
// Every file in `tests/ts-errors` is type checked. A line comment
// `// @error: <text>` asserts that the next line produces a diagnostic whose
// message contains `<text>`. Diagnostics on lines without such a comment are
// reported as failures, as are expected errors that don't occur.
//
// TypeScript 7 has no stable JavaScript API, so this runs `tsc` and reads its
// diagnostics from the output.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.join(__dirname, '..');
const testDir = path.join(rootDir, 'tests', 'ts-errors');
const tsc = path.join(rootDir, 'node_modules', '.bin', 'tsc');

// `file(line,col): error TS1234: message`, followed by indented lines that
// elaborate on the message.
const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error TS\d+: (.*)$/;

function collectExpectations(fileName) {
  const lines = fs.readFileSync(fileName, 'utf8').split('\n');
  const expectations = [];

  lines.forEach((line, i) => {
    const match = line.match(/\/\/\s*@error:\s*(.+?)\s*$/);

    if (match) {
      // The error is expected on the line after the comment (1-based).
      expectations.push({ line: i + 2, text: match[1], found: false });
    }
  });

  return expectations;
}

function readDiagnostics() {
  const result = spawnSync(
    tsc,
    ['-p', path.join(testDir, 'tsconfig.json'), '--pretty', 'false', '--noErrorTruncation'],
    { cwd: rootDir, encoding: 'utf8' },
  );

  if (result.error) {
    throw result.error;
  }

  const diagnostics = [];

  for (const line of result.stdout.split('\n')) {
    const match = line.match(DIAGNOSTIC);

    if (match) {
      diagnostics.push({
        file: path.resolve(rootDir, match[1]),
        line: Number(match[2]),
        message: match[4],
      });
    } else if (diagnostics.length && /^\s+\S/.test(line)) {
      diagnostics[diagnostics.length - 1].message += '\n' + line.trim();
    } else if (line.trim()) {
      throw new Error(`unexpected output from tsc: ${line}`);
    }
  }

  return diagnostics;
}

function main() {
  const fileNames = fs
    .readdirSync(testDir)
    .filter((it) => it.endsWith('.ts'))
    .map((it) => path.join(testDir, it));

  const diagnostics = readDiagnostics();
  const failures = [];
  let checked = 0;

  for (const diagnostic of diagnostics) {
    if (!fileNames.includes(diagnostic.file)) {
      failures.push(
        `${path.relative(rootDir, diagnostic.file)}: unexpected error:\n  ${diagnostic.message}`,
      );
    }
  }

  for (const fileName of fileNames) {
    const expectations = collectExpectations(fileName);
    const relativeName = path.relative(rootDir, fileName);

    for (const diagnostic of diagnostics.filter((it) => it.file === fileName)) {
      const expectation = expectations.find((it) => it.line === diagnostic.line);

      if (expectation && diagnostic.message.includes(expectation.text)) {
        expectation.found = true;
      } else if (!expectation || !expectation.found) {
        failures.push(
          `${relativeName}:${diagnostic.line}: unexpected error:\n  ${diagnostic.message}`,
        );
      }
    }

    for (const expectation of expectations) {
      checked++;

      if (!expectation.found) {
        failures.push(
          `${relativeName}:${expectation.line}: expected an error containing "${expectation.text}"`,
        );
      }
    }
  }

  if (failures.length) {
    console.error(failures.join('\n\n'));
    process.exit(1);
  }

  console.log(`typings-errors: ${checked} expected errors found`);
}

main();
