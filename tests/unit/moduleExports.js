const fs = require('node:fs');
const path = require('node:path');
const expect = require('expect.js');

const libDir = path.join(__dirname, '..', '..', 'lib');

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(file);
    return entry.name.endsWith('.js') ? [file] : [];
  });
}

describe('compiled modules', () => {
  // tsc compiles a re-export of an imported binding to a getter. A getter on an
  // exports object puts the whole object in V8's slow dictionary mode, and the
  // compiled code calls every imported function through that object
  // (`(0, objectUtils_1.isObject)(x)`), which made queries 10-20% slower.
  // Export a local constant instead of re-exporting.
  it("shouldn't export getters", () => {
    const getters = [];

    for (const file of jsFiles(libDir)) {
      if (file.includes(`${path.sep}parsers${path.sep}`)) continue;
      const exported = require(file);

      for (const key of Object.keys(exported)) {
        if (Object.getOwnPropertyDescriptor(exported, key).get) {
          getters.push(`${path.relative(libDir, file)}: ${key}`);
        }
      }
    }

    expect(getters).to.eql([]);
  });
});
