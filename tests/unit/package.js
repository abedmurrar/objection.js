const expect = require('expect.js');
const { name } = require('../../package.json');

// The package is loaded by its name, through the `exports` map of
// package.json, as an app would load it.
describe('package', () => {
  it('should give the same objects to require() and import', async () => {
    const cjs = require(name);
    const esm = await import(name);

    expect(esm.default).to.equal(cjs);
    expect(esm.Model).to.equal(cjs.Model);
    expect(esm.QueryBuilder).to.equal(cjs.QueryBuilder);

    const named = Object.keys(esm).filter((key) => key !== 'default');
    expect(named.sort()).to.eql(Object.keys(cjs).sort());

    for (const key of named) {
      expect(esm[key]).to.equal(cjs[key]);
    }
  });

  it("shouldn't expose the internal files", () => {
    expect(() => require(`${name}/lib/utils/cloneDeep`)).to.throwException(
      (err) => err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    );
  });
});
