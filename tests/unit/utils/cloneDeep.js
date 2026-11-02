const expect = require('expect.js');
const { cloneDeep } = require('../../../lib/utils/cloneDeep');

// cloneDeep gives the same results as lodash 4.17's cloneDeep, which objection
// used before. These tests spell out those results, quirks included.
describe('cloneDeep', () => {
  class Point {
    constructor(x) {
      this.x = x;
    }

    get double() {
      return this.x * 2;
    }
  }

  function expectProto(value, proto) {
    expect(Object.getPrototypeOf(value)).to.equal(proto);
  }

  describe('values that are not objects', () => {
    it('should return them as is', () => {
      const sym = Symbol('s');

      for (const value of [1, 's', null, undefined, true, 10n, sym, NaN]) {
        expect(Object.is(cloneDeep(value), value)).to.equal(true);
      }
    });
  });

  describe('plain objects and arrays', () => {
    it('should clone nested objects and arrays', () => {
      const input = { a: 1, b: 'two', c: null, d: undefined, e: { f: [1, 2, { g: 3 }] } };
      const clone = cloneDeep(input);

      expect(clone).to.eql(input);
      expect(clone).not.to.equal(input);
      expect(clone.e).not.to.equal(input.e);
      expect(clone.e.f).not.to.equal(input.e.f);
      expect(clone.e.f[2]).not.to.equal(input.e.f[2]);
      expect(Object.keys(clone)).to.eql(['a', 'b', 'c', 'd', 'e']);
    });

    it('should turn holes of arrays into undefined', () => {
      const clone = cloneDeep([1, , 3]); // eslint-disable-line no-sparse-arrays

      expect(clone).to.have.length(3);
      expect(Object.keys(clone)).to.eql(['0', '1', '2']);
      expect(clone[1]).to.equal(undefined);
    });

    it("should drop the properties of arrays that aren't indexes", () => {
      const sym = Symbol('s');
      const clone = cloneDeep(Object.assign([1, 2], { extra: 1, [sym]: 2 }));

      expect(Reflect.ownKeys(clone)).to.eql(['0', '1', 'length']);
    });

    it('should keep the index and input of RegExp match arrays', () => {
      const clone = cloneDeep(/(b)/.exec('abc'));

      expect(Array.isArray(clone)).to.equal(true);
      expect(clone.slice()).to.eql(['b', 'b']);
      expect(clone.index).to.equal(1);
      expect(clone.input).to.equal('abc');
      expect(clone).not.to.have.property('groups');
    });

    it('should keep array subclasses', () => {
      class MyArray extends Array {}
      const input = MyArray.from([1, { a: 2 }]);
      const clone = cloneDeep(input);

      expectProto(clone, MyArray.prototype);
      expect(clone.slice()).to.eql([1, { a: 2 }]);
      expect(clone[1]).not.to.equal(input[1]);
    });

    it('should clone the same object found twice into the same clone', () => {
      const shared = { shared: true };
      const clone = cloneDeep({ first: shared, second: shared, list: [shared] });

      expect(clone.first).not.to.equal(shared);
      expect(clone.second).to.equal(clone.first);
      expect(clone.list[0]).to.equal(clone.first);
    });

    it('should clone circular references', () => {
      const input = { name: 'root', children: [] };
      input.children.push({ parent: input });
      input.self = input;

      const clone = cloneDeep(input);

      expect(clone.self).to.equal(clone);
      expect(clone.children[0].parent).to.equal(clone);

      const array = [1];
      array.push(array);
      const arrayClone = cloneDeep(array);

      expect(arrayClone[1]).to.equal(arrayClone);
    });

    it('should define a __proto__ key as an own property', () => {
      const clone = cloneDeep(JSON.parse('{"__proto__": {"polluted": true}, "a": 1}'));

      expectProto(clone, Object.prototype);
      expect(Object.keys(clone)).to.eql(['__proto__', 'a']);
      expect(Object.getOwnPropertyDescriptor(clone, '__proto__').value).to.eql({ polluted: true });
      expect({}.polluted).to.equal(undefined);
    });

    it('should copy enumerable symbol keys after the other keys', () => {
      const sym = Symbol('sym');
      const hidden = Symbol('hidden');
      const input = { [sym]: { b: 2 }, a: 1 };
      Object.defineProperty(input, hidden, { value: 3, enumerable: false });

      const clone = cloneDeep(input);

      expect(Reflect.ownKeys(clone)).to.eql(['a', sym]);
      expect(clone[sym]).to.eql({ b: 2 });
      expect(clone[sym]).not.to.equal(input[sym]);
    });

    it('should read getters and drop non-enumerable properties', () => {
      const input = {
        get value() {
          return 42;
        },
      };
      Object.defineProperty(input, 'hidden', { value: 1, enumerable: false });

      const clone = cloneDeep(input);

      expect(Object.getOwnPropertyDescriptor(clone, 'value')).to.eql({
        value: 42,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      expect(clone).not.to.have.property('hidden');
    });

    it("shouldn't freeze the clone of a frozen object", () => {
      const clone = cloneDeep(Object.freeze({ a: { b: 1 } }));

      expect(Object.isFrozen(clone)).to.equal(false);
      expect(clone).to.eql({ a: { b: 1 } });
    });

    it('should treat an object with a length like any other object', () => {
      const clone = cloneDeep({ length: 2, 0: 'x', 1: 'y', b: 2 });

      expect(Object.keys(clone)).to.eql(['0', '1', 'length', 'b']);
    });

    it('should clone objects without a prototype into plain objects', () => {
      const input = Object.assign(Object.create(null), { a: { b: 1 } });
      const clone = cloneDeep({ obj: input });

      expectProto(clone.obj, Object.prototype);
      expect(clone.obj).to.eql({ a: { b: 1 } });
      expect(clone.obj.a).not.to.equal(input.a);
    });

    it('should clone a JSON attribute', () => {
      const input = { theme: 'dark', tags: ['a', 'b'], notify: { email: true, at: null } };
      expect(cloneDeep(input)).to.eql(input);
    });
  });

  describe('class instances and prototypes', () => {
    it('should clone a class instance into an object with the same prototype', () => {
      const input = { a: [{ b: { c: new Point(2) } }] };
      const clone = cloneDeep(input);
      const point = clone.a[0].b.c;

      expectProto(point, Point.prototype);
      expect(point).not.to.equal(input.a[0].b.c);
      expect(Object.keys(point)).to.eql(['x']);
      expect(point.double).to.equal(4);
    });

    it("shouldn't run the constructor", () => {
      let calls = 0;

      class Counted {
        constructor() {
          calls++;
          this.a = 1;
        }
      }

      const clone = cloneDeep(new Counted());

      expect(calls).to.equal(1);
      expectProto(clone, Counted.prototype);
      expect(clone.a).to.equal(1);
    });

    it('should assign the properties, which runs setters of the prototype', () => {
      class WithSetter {
        set v(x) {
          this._v = x * 10;
        }
      }

      const input = new WithSetter();
      Object.defineProperty(input, 'v', { value: 3, enumerable: true, writable: true });

      const clone = cloneDeep(input);

      expect(Object.keys(clone)).to.eql(['_v']);
      expect(clone._v).to.equal(30);
    });

    it('should clone prototype objects into plain objects without the constructor key', () => {
      function H() {}
      Object.defineProperty(H.prototype, 'constructor', {
        value: H,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      H.prototype.b = { c: 1 };

      const clone = cloneDeep(H.prototype);

      expectProto(clone, Object.prototype);
      expect(Object.keys(clone)).to.eql(['b']);
      expect(clone.b).not.to.equal(H.prototype.b);
    });
  });

  describe('dates and buffers', () => {
    it('should clone dates', () => {
      const input = new Date('2026-01-01T00:00:00Z');
      const clone = cloneDeep(input);

      expect(clone).to.be.a(Date);
      expect(clone).not.to.equal(input);
      expect(clone.getTime()).to.equal(input.getTime());
      expect(Number.isNaN(cloneDeep(new Date(NaN)).getTime())).to.equal(true);
    });

    it('should clone the same date found twice into the same clone', () => {
      const date = new Date(1);
      const clone = cloneDeep({ a: date, b: date });

      expect(clone.a).not.to.equal(date);
      expect(clone.b).to.equal(clone.a);
    });

    it('should copy the properties of a date', () => {
      const input = Object.assign(new Date(0), { extra: { deep: 1 } });
      const clone = cloneDeep(input);

      expect(clone.getTime()).to.equal(0);
      expect(clone.extra).to.eql({ deep: 1 });
      expect(clone.extra).not.to.equal(input.extra);
    });

    it('should copy buffers', () => {
      const input = Buffer.from('hello');
      const clone = cloneDeep({ b: input }).b;

      expect(Buffer.isBuffer(clone)).to.equal(true);
      expect(clone.toString()).to.equal('hello');

      // Unlike lodash, whose clone shares the memory of the original.
      clone[0] = 0;
      expect(input.toString()).to.equal('hello');
    });

    it('should copy a buffer found twice into two copies', () => {
      const buffer = Buffer.from('abc');
      const clone = cloneDeep({ a: buffer, b: buffer });

      expect(clone.a).not.to.equal(clone.b);
      expect(clone.a.equals(buffer)).to.equal(true);
      expect(clone.b.equals(buffer)).to.equal(true);
    });
  });

  describe('maps and sets', () => {
    it('should clone the values of a Map but not its keys', () => {
      const key = { k: 1 };
      const input = new Map([
        ['a', { b: 1 }],
        [key, [2]],
      ]);
      const clone = cloneDeep(input);

      expectProto(clone, Map.prototype);
      expect([...clone.keys()]).to.eql(['a', key]);
      expect([...clone.keys()][1]).to.equal(key);
      expect(clone.get('a')).to.eql({ b: 1 });
      expect(clone.get('a')).not.to.equal(input.get('a'));
      expect(clone.get(key)).not.to.equal(input.get(key));
    });

    it('should clone the values of a Set', () => {
      const input = new Set([1, { a: 2 }]);
      const clone = cloneDeep(input);
      const [one, obj] = clone;

      expectProto(clone, Set.prototype);
      expect(one).to.equal(1);
      expect(obj).to.eql({ a: 2 });
      expect(obj).not.to.equal([...input][1]);
    });

    it('should keep subclasses and drop other properties', () => {
      class MyMap extends Map {}
      class MySet extends Set {}

      const map = cloneDeep(Object.assign(new MyMap([['a', 1]]), { extra: 1 }));
      const set = cloneDeep(new MySet([1]));

      expectProto(map, MyMap.prototype);
      expect([...map]).to.eql([['a', 1]]);
      expect(Object.keys(map)).to.eql([]);
      expectProto(set, MySet.prototype);
      expect([...set]).to.eql([1]);
    });

    it('should share references through maps and sets', () => {
      const shared = { s: 1 };
      const clone = cloneDeep({ m: new Map([['x', shared]]), set: new Set([shared]), shared });

      expect(clone.shared).not.to.equal(shared);
      expect(clone.m.get('x')).to.equal(clone.shared);
      expect([...clone.set][0]).to.equal(clone.shared);

      const circular = new Map();
      circular.set('self', circular);
      const circularClone = cloneDeep(circular);

      expect(circularClone.get('self')).to.equal(circularClone);
    });
  });

  describe('typed arrays and other built-ins', () => {
    it('should copy typed arrays', () => {
      const input = new Uint8Array([1, 2, 3]);
      const clone = cloneDeep({ bytes: input }).bytes;

      expectProto(clone, Uint8Array.prototype);
      expect([...clone]).to.eql([1, 2, 3]);
      clone[0] = 9;
      expect(input[0]).to.equal(1);

      const floats = cloneDeep(new Float64Array([1.5, NaN, -0]));
      expect(floats[0]).to.equal(1.5);
      expect(Number.isNaN(floats[1])).to.equal(true);
      expect(Object.is(floats[2], -0)).to.equal(true);
    });

    it('should copy the whole buffer of a typed array view', () => {
      const input = new Uint8Array([1, 2, 3, 4]).subarray(1, 3);
      const clone = cloneDeep(input);

      expect([...clone]).to.eql([2, 3]);
      expect(clone.byteOffset).to.equal(1);
      expect(clone.buffer.byteLength).to.equal(4);
      expect(clone.buffer).not.to.equal(input.buffer);
    });

    it('should copy the other properties of a typed array', () => {
      const clone = cloneDeep(Object.assign(new Uint8Array([1, 2]), { extra: { a: 1 } }));

      expect(Object.keys(clone)).to.eql(['0', '1', 'extra']);
      expect(clone.extra).to.eql({ a: 1 });
    });

    it('should copy ArrayBuffers and DataViews', () => {
      const arrayBuffer = new Uint8Array([1, 2]).buffer;
      const bufferClone = cloneDeep(arrayBuffer);

      expect(bufferClone).to.be.an(ArrayBuffer);
      expect(bufferClone).not.to.equal(arrayBuffer);
      expect([...new Uint8Array(bufferClone)]).to.eql([1, 2]);

      const view = new DataView(new Uint8Array([1, 2, 3]).buffer, 1, 2);
      const viewClone = cloneDeep(view);

      expect(viewClone).to.be.a(DataView);
      expect(viewClone.buffer).not.to.equal(view.buffer);
      expect(viewClone.byteOffset).to.equal(1);
      expect(viewClone.byteLength).to.equal(2);
      expect(viewClone.getUint8(0)).to.equal(2);
    });

    it('should clone regular expressions with their flags and lastIndex', () => {
      const input = /a/gi;
      input.exec('aa');
      const clone = cloneDeep(input);

      expect(clone).not.to.equal(input);
      expect(clone.source).to.equal('a');
      expect(clone.flags).to.equal('gi');
      expect(clone.lastIndex).to.equal(1);
    });

    it('should clone boxed primitives', () => {
      const number = cloneDeep(Object.assign(new Number(3), { extra: 1 }));
      const string = cloneDeep(new String('ab'));
      const bool = cloneDeep(new Boolean(false));
      const symbol = Symbol('boxed');
      const boxedSymbol = cloneDeep(Object(symbol));

      expect(number).to.be.a(Number);
      expect(number.valueOf()).to.equal(3);
      expect(number.extra).to.equal(1);
      expect(string.valueOf()).to.equal('ab');
      expect(bool.valueOf()).to.equal(false);
      expect(typeof boxedSymbol).to.equal('object');
      expect(boxedSymbol.valueOf()).to.equal(symbol);
    });

    it('should clone an arguments object into a plain object', () => {
      const input = (function () {
        return arguments;
      })(1, { a: 2 });
      const clone = cloneDeep(input);

      expectProto(clone, Object.prototype);
      expect(clone).to.eql({ 0: 1, 1: { a: 2 } });
      expect(clone[1]).not.to.equal(input[1]);
    });
  });

  describe("values lodash doesn't clone", () => {
    class Tagged {
      get [Symbol.toStringTag]() {
        return 'Custom';
      }
    }

    const uncloneable = {
      'a function': () => function () {},
      'an error': () => new Error('x'),
      'a WeakMap': () => new WeakMap(),
      'a WeakSet': () => new WeakSet(),
      'a promise': () => Promise.resolve(),
      'an object with a custom Symbol.toStringTag': () => new Tagged(),
    };

    for (const [name, make] of Object.entries(uncloneable)) {
      it(`should keep ${name} inside another value by reference`, () => {
        const value = make();
        const clone = cloneDeep({ value, list: [value], map: new Map([['v', value]]) });

        expect(clone.value).to.equal(value);
        expect(clone.list[0]).to.equal(value);
        expect(clone.map.get('v')).to.equal(value);
      });
    }

    it('should clone them on their own into an empty object', () => {
      for (const name of Object.keys(uncloneable)) {
        if (name === 'a function') {
          continue;
        }

        const clone = cloneDeep(uncloneable[name]());
        expectProto(clone, Object.prototype);
        expect(Reflect.ownKeys(clone)).to.eql([]);
      }

      const asyncClone = cloneDeep(Object.assign(async function () {}, { a: 1 }));
      expectProto(asyncClone, Object.prototype);
      expect(Reflect.ownKeys(asyncClone)).to.eql([]);
    });

    it('should clone a function on its own into an object with its properties', () => {
      const input = Object.assign(function () {}, { a: { b: 1 } });
      const clone = cloneDeep(input);

      expectProto(clone, Object.prototype);
      expect(clone).to.eql({ a: { b: 1 } });
      expect(clone.a).not.to.equal(input.a);
    });
  });
});
