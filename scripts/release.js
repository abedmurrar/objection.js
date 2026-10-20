'use strict';

// Prepares a release: bumps the version, dates the changelog, commits and tags.
// Pushing the tag starts .github/workflows/release.yml, which runs the tests
// and publishes to npm.
//
//   npm run release -- <version> [--dry-run]
//
// <version> is an exact version (4.0.0-alpha.0) or one of npm's increments:
// patch, minor, major, prerelease, prepatch, preminor, premajor. Prereleases
// use the `alpha` id unless the current version has another one, and are
// published with the `next` dist-tag. See RELEASING.md.

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const changelog = require('./changelog');

const rootDir = path.join(__dirname, '..');
const RELEASE_BRANCH = 'main';
const INCREMENTS = ['patch', 'minor', 'major', 'prerelease', 'prepatch', 'preminor', 'premajor'];

function run(cmd, args, opts = {}) {
  const output = execFileSync(cmd, args, { cwd: rootDir, encoding: 'utf8', ...opts });
  // `null` when the output goes to the terminal.
  return output === null ? '' : output.trim();
}

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

// Read from disk every time, since `npm version` changes it.
function currentVersion() {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;
}

function preid(version) {
  const match = /-([a-z]+)\./.exec(version);
  return match ? match[1] : 'alpha';
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const target = args.find((it) => !it.startsWith('--'));

  if (!target || !(INCREMENTS.includes(target) || /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(target))) {
    fail(`usage: npm run release -- <version|${INCREMENTS.join('|')}> [--dry-run]`);
  }

  const branch = run('git', ['branch', '--show-current']);

  if (branch !== RELEASE_BRANCH && !dryRun) {
    fail(`releases are made from "${RELEASE_BRANCH}", not "${branch}".`);
  }

  if (run('git', ['status', '--porcelain']) !== '' && !dryRun) {
    fail('the working tree has uncommitted changes.');
  }

  const notes = changelog.unreleasedNotes(changelog.read());

  if (!notes) {
    fail(`the "## Unreleased" section of ${changelog.changelogPath} is empty.`);
  }

  console.log('Checking lint, types and unit tests. The integration tests run in CI.');
  const checks = [
    ['npm', ['run', 'eslint']],
    ['npm', ['run', 'test:typings']],
    ['npx', ['mocha', '--recursive', 'tests/unit', '--exclude', 'tests/unit/relations/files/**']],
  ];

  for (const [cmd, cmdArgs] of checks) {
    try {
      run(cmd, cmdArgs, { stdio: 'inherit' });
    } catch (err) {
      fail(`"${cmd} ${cmdArgs.join(' ')}" failed.`);
    }
  }

  const from = currentVersion();
  const versionArgs = ['version', target, '--no-git-tag-version', '--preid', preid(from)];

  if (dryRun) {
    console.log(`\nDry run: would run "npm ${versionArgs.join(' ')}" (now ${from}),`);
    console.log('date the changelog, commit "Release v<version>" and tag it. Notes:\n');
    console.log(notes);
    return;
  }

  run('npm', versionArgs);
  const version = currentVersion();
  const date = new Date().toISOString().slice(0, 10);

  changelog.write(changelog.release(changelog.read(), version, date));

  run('git', ['add', 'package.json', 'package-lock.json', changelog.changelogPath]);
  run('git', ['commit', '-m', `Release v${version}`]);
  run('git', ['tag', '-a', `v${version}`, '-m', `v${version}`]);

  const distTag = version.includes('-') ? 'next' : 'latest';

  console.log(
    `\nCommitted and tagged v${version} (${from} -> ${version}, npm dist-tag "${distTag}").`,
  );
  console.log('Nothing was pushed. To publish:\n');
  console.log(`  git push origin ${RELEASE_BRANCH} --follow-tags\n`);
  console.log('To undo instead:\n');
  console.log(`  git tag -d v${version} && git reset --hard HEAD~1`);
}

main();
