'use strict';

// Generates the typings of the MySQL `fn.*` helpers from
// lib/queryBuilder/functions/mysql.js into typings/objection/index.d.ts.
//
//   node scripts/generate-fn-typings.js           write the typings
//   node scripts/generate-fn-typings.js --check   fail if they are out of date

const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const {
  FUNCTIONS,
  INTERVAL_UNITS,
  TIMESTAMP_UNITS,
} = require('../lib/queryBuilder/functions/mysql');

const typingsPath = path.join(__dirname, '..', 'typings', 'objection', 'index.d.ts');

function unionOf(units) {
  return units.map((unit) => `'${unit}' | '${unit.toLowerCase()}'`).join(' | ');
}

function functionTypes() {
  return [
    `type FnIntervalUnit = ${unionOf(INTERVAL_UNITS)};`,
    `type FnTimestampUnit = ${unionOf(TIMESTAMP_UNITS)};`,
  ];
}

function builderType(options) {
  if (options.window) {
    return 'WindowFunctionBuilder';
  } else if (options.aggregate) {
    return 'AggregateFunctionBuilder';
  } else {
    return 'FunctionBuilder';
  }
}

function functionMembers() {
  return FUNCTIONS.flatMap(([name, sql, params, result, options = {}]) => [
    `/** \`${sql}()\` (${options.portable ? 'portable' : 'MySQL'}${
      options.window ? ', window function' : options.aggregate ? ', aggregate' : ''
    }) */`,
    `${name}(${params}): ${builderType(options)}<${result}>;`,
  ]);
}

function replaceRegion(source, region, lines) {
  const start = `// <generated:${region}>`;
  const end = `// </generated:${region}>`;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`markers for ${region} not found in ${typingsPath}`);
  }

  return (
    source.slice(0, startIndex + start.length) +
    '\n' +
    lines.join('\n') +
    '\n' +
    source.slice(endIndex)
  );
}

async function main() {
  const source = fs.readFileSync(typingsPath, 'utf8');
  let generated = replaceRegion(source, 'mysql-function-types', functionTypes());
  generated = replaceRegion(generated, 'mysql-functions', functionMembers());

  const options = await prettier.resolveConfig(typingsPath);
  generated = await prettier.format(generated, { ...options, filepath: typingsPath });

  if (process.argv.includes('--check')) {
    if (generated !== source) {
      console.error('The fn typings are out of date. Run `node scripts/generate-fn-typings.js`.');
      process.exit(1);
    }
  } else {
    fs.writeFileSync(typingsPath, generated);
  }
}

main();
