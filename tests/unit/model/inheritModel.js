const Knex = require('knex');
const expect = require('expect.js');
const { Model } = require('../../../');
const { inheritModel } = require('../../../lib/model/inheritModel');

// `bindKnex()` and `bindTransaction()` create an empty subclass with the same
// name. The name used to be put into the code of a `new Function`.
describe('inheritModel', () => {
  let knex;

  before(() => {
    knex = Knex({
      client: 'sqlite3',
      connection: { filename: ':memory:' },
      useNullAsDefault: true,
    });
  });

  after(() => knex.destroy());

  it('should create a subclass with the same name and statics', () => {
    class Person extends Model {
      static tableName = 'person';
    }

    const Sub = inheritModel(Person);

    expect(Sub.name).to.equal('Person');
    expect(Object.getPrototypeOf(Sub)).to.be(Person);
    expect(Sub.tableName).to.equal('person');
    expect(new Sub()).to.be.a(Person);
    expect(inheritModel(Person)).not.to.be(Sub);
  });

  it('should bind a class whose name is not an identifier', () => {
    class Weird extends Model {
      static tableName = 'weird';

      static get name() {
        return 'Weird Model';
      }
    }

    expect(Weird.bindKnex(knex).name).to.equal('Weird Model');
  });

  it('should not run a class name as code', () => {
    class Evil extends Model {
      static tableName = 'evil';

      static get name() {
        return 'X extends (globalThis.inheritModelRan = true, BaseClass) {}; return class Z';
      }
    }

    const Bound = Evil.bindKnex(knex);

    expect(globalThis.inheritModelRan).to.be(undefined);
    expect(Object.getPrototypeOf(Bound)).to.be(Evil);
  });
});
