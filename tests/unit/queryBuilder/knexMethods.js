const Knex = require('knex');
const expect = require('expect.js');
const { Model, raw } = require('../../../');
const mockKnexFactory = require('../../../testUtils/mockKnex');

describe('knex methods', () => {
  class Person extends Model {
    static get tableName() {
      return 'persons';
    }
  }

  const pg = Knex({ client: 'pg' });

  function sql(builder) {
    return builder.toKnexQuery().toSQL().toNative();
  }

  it('or variants of having should use or', () => {
    // These used to call the and variants of knex.
    expect(
      sql(
        Person.query(pg)
          .groupBy('id')
          .having('a', '>', 0)
          .orHavingIn('b', [1])
          .orHavingBetween('c', [2, 3])
          .orHavingNotBetween('d', [4, 5]),
      ).sql,
    ).to.equal(
      'select "persons".* from "persons" group by "id" having "a" > $1 or "b" in ($2) or "c" between $3 and $4 or "d" not between $5 and $6',
    );
  });

  it('and variants of having', () => {
    expect(
      sql(
        Person.query(pg)
          .groupBy('id')
          .havingIn('a', [1])
          .orHaving('b', '=', 2)
          .andHaving('c', '>', 3)
          .andHavingIn('d', [4])
          .andHavingNotIn('e', [5])
          .andHavingNull('f')
          .andHavingNotNull('g')
          .andHavingBetween('h', [6, 7])
          .andHavingNotBetween('i', [8, 9])
          .andHavingExists(raw('select 1'))
          .andHavingNotExists(raw('select 2')),
      ).sql,
    ).to.equal(
      'select "persons".* from "persons" group by "id" having "a" in ($1) or "b" = $2 and "c" > $3 and "d" in ($4) and "e" not in ($5) and "f" is null and "g" is not null and "h" between $6 and $7 and "i" not between $8 and $9 and exists (select 1) and not exists (select 2)',
    );
  });

  it('clearGroup() and clearHaving() should remove the operations', () => {
    const query = Person.query(pg)
      .groupBy('a')
      .groupByRaw('b')
      .having('c', '>', 1)
      .orHavingRaw('d > 2')
      .clearGroup()
      .clearHaving()
      .groupBy('e');

    expect(sql(query).sql).to.equal('select "persons".* from "persons" group by "e"');
    expect(query.has(/having/i)).to.equal(false);
    expect(query.has('groupByRaw')).to.equal(false);
  });

  it('comment(), hintComment() and using()', () => {
    expect(sql(Person.query(pg).comment('report').hintComment(['NO_ICP(persons)'])).sql).to.equal(
      '/* report */ select /*+ NO_ICP(persons) */ "persons".* from "persons"',
    );

    expect(
      sql(
        Person.query(pg)
          .delete()
          .using('pets')
          .where('pets.ownerId', raw('??', ['persons.id'])),
      ).sql,
    ).to.equal('delete from "persons" using "pets" where "pets"."ownerId" = "persons"."id"');
  });

  it('`or` in join callbacks', () => {
    expect(
      sql(
        Person.query(pg).join('pets', (join) =>
          join.on('pets.ownerId', 'persons.id').or.on('pets.sitterId', 'persons.id').on('a', 'b'),
        ),
      ).sql,
    ).to.equal(
      'select "persons".* from "persons" inner join "pets" on "pets"."ownerId" = "persons"."id" or "pets"."sitterId" = "persons"."id" and "a" = "b"',
    );
  });

  it('finally() should run after the query', async () => {
    const knex = mockKnexFactory(Knex({ client: 'pg' }), function (mock, oldImpl, args) {
      return Promise.resolve([{ id: 1 }]).then(...args);
    });

    const events = [];
    const result = await Person.query(knex).finally(() => events.push('finally'));

    expect(events).to.eql(['finally']);
    expect(result[0]).to.be.a(Person);
  });
});
