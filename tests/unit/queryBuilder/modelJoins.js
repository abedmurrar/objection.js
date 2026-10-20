const Knex = require('knex');
const expect = require('expect.js');
const { Model, ref } = require('../../../');

describe('model classes as tables', () => {
  let Person;
  let Pet;
  let Toy;

  before(() => {
    const knex = Knex({ client: 'pg' });

    Person = class Person extends Model {
      static get tableName() {
        return 'persons';
      }
    }.bindKnex(knex);

    Pet = class Pet extends Model {
      static get tableName() {
        return 'pets';
      }
    }.bindKnex(knex);

    Toy = class Toy extends Model {
      static get tableName() {
        return 'toys';
      }
    }.bindKnex(knex);
  });

  it('join methods should accept a model class', () => {
    for (const method of [
      'join',
      'innerJoin',
      'leftJoin',
      'leftOuterJoin',
      'rightJoin',
      'rightOuterJoin',
      'fullOuterJoin',
    ]) {
      const sql = Person.query()[method](Pet, Pet.ref('ownerId'), Person.ref('id')).toKnexQuery();
      const knexSql = Person.knex()('persons')
        .select('persons.*')
        [method]('pets', 'pets.ownerId', 'persons.id');

      expect(sql.toString()).to.equal(knexSql.toString());
    }
  });

  it('crossJoin should accept a model class', () => {
    expect(Person.query().crossJoin(Pet).toKnexQuery().toString()).to.equal(
      'select "persons".* from "persons" cross join "pets"',
    );
  });

  it('join methods should accept an alias object with a model class', () => {
    expect(
      Person.query().innerJoin({ p: Pet }, 'p.ownerId', Person.ref('id')).toKnexQuery().toString(),
    ).to.equal(
      'select "persons".* from "persons" inner join "pets" as "p" on "p"."ownerId" = "persons"."id"',
    );
  });

  it('join callbacks should accept model refs', () => {
    expect(
      Person.query()
        .leftJoin(Pet, (join) => {
          join
            .on(Pet.ref('ownerId'), Person.ref('id'))
            .andOn(Pet.ref('ownerId'), '=', Person.ref('id'))
            .orOn(Pet.ref('id'), ref('persons.favoritePetId'))
            .andOnVal(Pet.ref('species'), 'dog')
            .andOnIn(Pet.ref('id'), [1, 2])
            .andOnNull(Pet.ref('deletedAt'));
        })
        .leftJoin(Toy, function () {
          this.on(Toy.ref('petId'), Pet.ref('id'));
        })
        .toKnexQuery()
        .toString(),
    ).to.equal(
      'select "persons".* from "persons" ' +
        'left join "pets" on "pets"."ownerId" = "persons"."id" and "pets"."ownerId" = "persons"."id" ' +
        'or "pets"."id" = "persons"."favoritePetId" and "pets"."species" = \'dog\' ' +
        'and "pets"."id" in (1, 2) and "pets"."deletedAt" is null ' +
        'left join "toys" on "toys"."petId" = "pets"."id"',
    );
  });

  it('from should accept a model class', () => {
    expect(Person.query().from(Person).toKnexQuery().toString()).to.equal(
      'select "persons".* from "persons"',
    );
  });

  it('from should accept an alias object with a model class and use the alias', () => {
    expect(
      Person.query().from({ p: Person }).where(Person.ref('id'), 1).toKnexQuery().toString(),
    ).to.equal('select "p".* from "persons" as "p" where "p"."id" = 1');
  });

  it('table and into should accept a model class', () => {
    expect(Person.query().table(Person).toKnexQuery().toString()).to.equal(
      'select "persons".* from "persons"',
    );
  });

  it('model classes in subqueries should be table names', () => {
    expect(
      Person.query()
        .whereExists(Pet.query().select(1).join(Toy, Toy.ref('petId'), Pet.ref('id')))
        .toKnexQuery()
        .toString(),
    ).to.equal(
      'select "persons".* from "persons" where exists (select 1 from "pets" inner join "toys" on "toys"."petId" = "pets"."id")',
    );
  });
});
