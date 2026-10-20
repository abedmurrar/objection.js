const Knex = require('knex');
const expect = require('expect.js');
const { Model, ref, fn } = require('../../../');

describe('whereIn with a raw column', () => {
  class Person extends Model {
    static get tableName() {
      return 'persons';
    }
  }

  const pg = Knex({ client: 'pg' });

  function sql(builder) {
    return builder.toKnexQuery().toSQL().toNative();
  }

  // knex compiles the values before the column, so the bindings of the column
  // used to end up after the values.
  it('should keep the bindings of the column before the values', () => {
    expect(sql(Person.query(pg).whereIn(fn('f', 'x'), [1, 2]))).to.eql({
      sql: 'select "persons".* from "persons" where f($1) in ($2, $3)',
      bindings: ['x', 1, 2],
    });

    expect(sql(Person.query(pg).where('a', 0).orWhereNotIn(fn('f', 'x'), [1]))).to.eql({
      sql: 'select "persons".* from "persons" where "a" = $1 or f($2) not in ($3)',
      bindings: [0, 'x', 1],
    });

    expect(
      sql(Person.query(pg).whereNotIn(fn('f', 'x'), Person.query().select('id').where('a', 5))),
    ).to.eql({
      sql: 'select "persons".* from "persons" where f($1) not in (select "id" from "persons" where "a" = $2)',
      bindings: ['x', 5],
    });

    expect(
      sql(
        Person.query(pg).join('pets', (join) =>
          join.on('pets.ownerId', 'persons.id').andOnIn(fn('f', 'x'), [1]),
        ),
      ),
    ).to.eql({
      sql: 'select "persons".* from "persons" inner join "pets" on "pets"."ownerId" = "persons"."id" and f($1) in ($2)',
      bindings: ['x', 1],
    });
  });

  it('should not change other whereIn queries', () => {
    expect(
      sql(Person.query(pg).whereIn('a', [1, 2]).whereIn(ref('b'), [3]).whereIn(fn('f', 'x'), [])),
    ).to.eql({
      sql: 'select "persons".* from "persons" where "a" in ($1, $2) and "b" in ($3) and 1 = $4',
      bindings: [1, 2, 3, 0],
    });
  });
});
