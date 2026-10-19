'use strict';

// Checks the error messages produced by the typings.
//
// Every file in `tests/ts-errors` is type checked. A line comment
// `// @error: <text>` asserts that the next line produces a diagnostic whose
// message contains `<text>`. Diagnostics on lines without such a comment are
// reported as failures, as are expected errors that don't occur.

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const rootDir = path.join(__dirname, '..');
const testDir = path.join(rootDir, 'tests', 'ts-errors');

function readCompilerOptions() {
  const configPath = path.join(rootDir, 'tsconfig.json');
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  return ts.parseJsonConfigFileContent(config, ts.sys, rootDir).options;
}

function collectExpectations(fileName) {
  const lines = fs.readFileSync(fileName, 'utf8').split('\n');
  const expectations = [];

  lines.forEach((line, i) => {
    const match = line.match(/\/\/\s*@error:\s*(.+?)\s*$/);

    if (match) {
      expectations.push({ line: i + 1, text: match[1], found: false });
    }
  });

  return expectations;
}

function main() {
  const fileNames = fs
    .readdirSync(testDir)
    .filter((it) => it.endsWith('.ts'))
    .map((it) => path.join(testDir, it));

  const program = ts.createProgram(fileNames, readCompilerOptions());
  const failures = [];
  let checked = 0;

  for (const fileName of fileNames) {
    const sourceFile = program.getSourceFile(fileName);
    const expectations = collectExpectations(fileName);
    const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
    const relativeName = path.relative(rootDir, fileName);

    for (const diagnostic of diagnostics) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      // The comment is on the line before the error (lines are 0-based here).
      const expectation = expectations.find((it) => it.line === line);

      if (expectation && message.includes(expectation.text)) {
        expectation.found = true;
      } else if (!expectation || !expectation.found) {
        failures.push(`${relativeName}:${line + 1}: unexpected error:\n  ${message}`);
      }
    }

    for (const expectation of expectations) {
      checked++;

      if (!expectation.found) {
        failures.push(
          `${relativeName}:${expectation.line + 1}: expected an error containing "${expectation.text}"`,
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
