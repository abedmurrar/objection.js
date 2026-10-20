'use strict';

// Reads and updates doc/release-notes/changelog.md.
//
//   node scripts/changelog.js notes <version>   print the notes of a version
//
// The notes of the next release are collected under `## Unreleased`.
// `scripts/release.js` turns that heading into `## <version> (<date>)`.

const fs = require('fs');
const path = require('path');

const changelogPath = path.join(__dirname, '..', 'doc', 'release-notes', 'changelog.md');
const UNRELEASED = '## Unreleased';

function read() {
  return fs.readFileSync(changelogPath, 'utf8');
}

// The lines between the heading `## <title>` (up to a space or the end of the
// line) and the next `## ` heading.
function section(changelog, title) {
  const lines = changelog.split('\n');
  const start = lines.findIndex(
    (line) => line === `## ${title}` || line.startsWith(`## ${title} `),
  );

  if (start === -1) {
    return null;
  }

  let end = lines.findIndex((line, i) => i > start && line.startsWith('## '));

  if (end === -1) {
    end = lines.length;
  }

  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

function unreleasedNotes(changelog) {
  return section(changelog, 'Unreleased');
}

// Moves the unreleased notes under a heading for `version`, and starts a new,
// empty unreleased section.
function release(changelog, version, date) {
  if (!changelog.includes(`\n${UNRELEASED}\n`)) {
    throw new Error(`${changelogPath} has no "${UNRELEASED}" section.`);
  }

  if (section(changelog, version) !== null) {
    throw new Error(`${changelogPath} already has a section for ${version}.`);
  }

  return changelog.replace(`\n${UNRELEASED}\n`, `\n${UNRELEASED}\n\n## ${version} (${date})\n`);
}

function write(changelog) {
  fs.writeFileSync(changelogPath, changelog);
}

if (require.main === module) {
  const [command, version] = process.argv.slice(2);

  if (command !== 'notes' || !version) {
    console.error('usage: node scripts/changelog.js notes <version>');
    process.exit(1);
  }

  const notes = section(read(), version);

  if (notes === null) {
    console.error(`No section for ${version} in ${changelogPath}.`);
    process.exit(1);
  }

  console.log(notes);
}

module.exports = {
  changelogPath,
  read,
  write,
  section,
  unreleasedNotes,
  release,
};
