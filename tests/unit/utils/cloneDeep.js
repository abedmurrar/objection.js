const expect = require('expect.js');
const { cloneDeep } = require('../../../lib/utils/cloneDeep');
const { cloneDeep: lodashCloneDeep } = require('../../../lib/utils/clone');

describe('cloneDeep', () => {
  const shared = { shared: true };
  const sharedBuffer = Buffer.from('abc');
  const sym = Symbol('sym');
  const hiddenSym = Symbol('hidden');

  class Point {
    constructor(x) {
      this.x = x;
    }
  }

  const circular = { name: 'root', children: [] };
  circular.children.push({ parent: circular });
  circular.self = circular;

  const withSymbols = { a: 1, [sym]: { b: 2 } };
  Object.defineProperty(withSymbols, hiddenSym, { value: 3, enumerable: false });

  const dateWithProps = new Date(0);
  dateWithProps.extra = 1;

  const nullProto = Object.create(null);
  nullProto.a = 1;

  const withGetter = {
    get value() {
      return 42;
    },
  };

  class MyArray extends Array {}

  const cases = {
    'a number': 1,
    'a string': 'str',
    null: null,
    undefined: undefined,
    'a plain object': { a: 1, b: 'two', c: null, d: undefined, e: true },
    'a nested object': { a: { b: { c: [1, 2, { d: 3 }] } } },
    'an array with holes': [1, , 3], // eslint-disable-line no-sparse-arrays
    'shared references': { first: shared, second: shared, list: [shared] },
    'circular references': circular,
    'a __proto__ key': JSON.parse('{"__proto__": {"polluted": true}, "a": 1}'),
    'symbol keys': withSymbols,
    'a buffer': Buffer.from('hello'),
    'a shared buffer': { a: sharedBuffer, b: sharedBuffer },
    'a date': new Date('2026-01-01T00:00:00Z'),
    'shared dates': ((date) => ({ a: date, b: date }))(new Date(1)),
    'a date with properties': { date: dateWithProps },
    'a class instance': { point: new Point(1) },
    'a map': { map: new Map([['a', { b: 1 }]]) },
    'a set': new Set([1, { a: 2 }]),
    'a typed array': { bytes: new Uint8Array([1, 2, 3]) },
    'a nested function': { fn() {} },
    'a function': function () {},
    'a null prototype object': { obj: nullProto },
    'a regexp match array': /(b)/.exec('abc'),
    'a getter': withGetter,
    'an array subclass': MyArray.from([1, 2]),
    'a deep class instance': { a: [{ b: { c: new Point(2) } }], d: shared, e: shared },
    'a JSON attribute': { theme: 'dark', tags: ['a', 'b'], notify: { email: true, at: null } },
  };

  for (const [name, input] of Object.entries(cases)) {
    it(`should clone ${name} like lodash`, () => {
      const expected = lodashCloneDeep(input);
      const actual = cloneDeep(input);

      expectSameClone(actual, expected);

      if (input !== null && typeof input === 'object') {
        expect(actual).not.to.equal(input);
      }
    });
  }

  // Compares two clones: the same prototypes, own keys in the same order, the
  // same property descriptors and values, and the same references shared.
  function expectSameClone(actual, expected) {
    const pairs = new Map();

    compare(actual, expected, '$');

    function compare(a, b, path) {
      if (typeof b !== 'object' || b === null) {
        if (typeof b === 'function') {
          expect(a).to.equal(b);
        } else {
          expect(Object.is(a, b)).to.equal(true, `${path}: ${String(a)} !== ${String(b)}`);
        }

        return;
      }

      expect(typeof a).to.equal('object', path);
      expect(a).not.to.equal(null, path);

      if (pairs.has(b)) {
        expect(pairs.get(b)).to.equal(a, `${path}: a shared reference isn't shared`);
        return;
      }

      pairs.set(b, a);
      expect(Object.getPrototypeOf(a)).to.equal(Object.getPrototypeOf(b), `${path}: prototype`);

      if (Buffer.isBuffer(b)) {
        expect(Buffer.isBuffer(a)).to.equal(true, path);
        expect(a.equals(b)).to.equal(true, path);
        return;
      }

      if (b instanceof Date) {
        expect(a.getTime()).to.equal(b.getTime(), path);
      }

      if (b instanceof Map) {
        expect([...a.keys()]).to.eql([...b.keys()]);
        [...b.entries()].forEach(([k, v]) => compare(a.get(k), v, `${path}.get(${k})`));
      }

      if (b instanceof Set) {
        const av = [...a];
        [...b].forEach((v, i) => compare(av[i], v, `${path}[set ${i}]`));
      }

      const aKeys = Reflect.ownKeys(a);
      const bKeys = Reflect.ownKeys(b);
      expect(aKeys.map(String)).to.eql(bKeys.map(String), `${path}: keys`);

      for (const key of bKeys) {
        const ad = Object.getOwnPropertyDescriptor(a, key);
        const bd = Object.getOwnPropertyDescriptor(b, key);

        expect(ad.enumerable).to.equal(bd.enumerable, `${path}.${String(key)}: enumerable`);
        expect(ad.writable).to.equal(bd.writable, `${path}.${String(key)}: writable`);
        expect(ad.configurable).to.equal(bd.configurable, `${path}.${String(key)}: configurable`);
        compare(ad.value, bd.value, `${path}.${String(key)}`);
      }
    }
  }
});
