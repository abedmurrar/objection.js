const expect = require('expect.js');
const { Model, fn, ref, val } = require('../../');

module.exports = (session) => {
  describe('expressions', () => {
    class Owner extends Model {
      static get tableName() {
        return 'ExpressionsOwner';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'ExpressionsOwner.id', to: 'ExpressionsPet.ownerId' },
          },
        };
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'ExpressionsPet';
      }
    }

    let BoundOwner;
    let BoundPet;

    before(async () => {
      BoundOwner = Owner.bindKnex(session.knex);
      BoundPet = Pet.bindKnex(session.knex);

      await session.knex.schema.dropTableIfExists('ExpressionsPet');
      await session.knex.schema.dropTableIfExists('ExpressionsOwner');

      await session.knex.schema.createTable('ExpressionsOwner', (table) => {
        table.integer('id').primary();
        table.string('name');
        table.string('bio');
      });

      await session.knex.schema.createTable('ExpressionsPet', (table) => {
        table.integer('id').primary();
        table.integer('ownerId');
        table.string('species');
        table.integer('age');
        table.integer('order');
        table.boolean('vaccinated');
      });
    });

    beforeEach(async () => {
      await session.knex('ExpressionsPet').delete();
      await session.knex('ExpressionsOwner').delete();

      await session.knex('ExpressionsOwner').insert([
        { id: 1, name: 'Ann', bio: 'Likes dogs' },
        { id: 2, name: 'Bob', bio: '  ' },
        { id: 3, name: 'Cid', bio: null },
      ]);

      await session.knex('ExpressionsPet').insert([
        { id: 1, ownerId: 1, species: 'dog', age: 3, order: 1, vaccinated: true },
        { id: 2, ownerId: 1, species: 'cat', age: 7, order: 2, vaccinated: false },
        { id: 3, ownerId: 1, species: 'dog', age: 1, order: 3, vaccinated: true },
        { id: 4, ownerId: 2, species: 'dog', age: 10, order: 1, vaccinated: false },
        { id: 5, ownerId: 2, species: 'bird', age: 2, order: 2, vaccinated: true },
      ]);
    });

    after(async () => {
      await session.knex.schema.dropTableIfExists('ExpressionsPet');
      await session.knex.schema.dropTableIfExists('ExpressionsOwner');
    });

    function ids(rows) {
      return rows.map((it) => it.id);
    }

    function truthy(value) {
      return value === true || value === 1;
    }

    it('comparisons and logic in where', async () => {
      const pets = await BoundPet.query()
        .where(Pet.ref('species').eq('dog').and(Pet.ref('age').gte(3)).or(Pet.ref('id').eq(5)))
        .orderBy('id');

      expect(ids(pets)).to.eql([1, 4, 5]);

      expect(
        ids(
          await BoundPet.query()
            .where(Pet.ref('species').in(['cat', 'bird']))
            .orderBy('id'),
        ),
      ).to.eql([2, 5]);
      expect(ids(await BoundPet.query().where(Pet.ref('species').notIn([])).orderBy('id'))).to.eql([
        1, 2, 3, 4, 5,
      ]);
      expect(ids(await BoundPet.query().where(Pet.ref('species').in([])))).to.eql([]);
      expect(ids(await BoundPet.query().where(Pet.ref('age').between(2, 3)).orderBy('id'))).to.eql([
        1, 5,
      ]);
      expect(ids(await BoundPet.query().where(Pet.ref('species').like('b%')))).to.eql([5]);
      expect(
        ids(await BoundPet.query().where(Pet.ref('age').plus(1).times(2).gt(15)).orderBy('id')),
      ).to.eql([2, 4]);
    });

    it('blank checks', async () => {
      expect(ids(await BoundOwner.query().where(Owner.ref('bio').isBlank()).orderBy('id'))).to.eql([
        2, 3,
      ]);
      expect(ids(await BoundOwner.query().where(Owner.ref('bio').isNotBlank()))).to.eql([1]);
    });

    it('conditions in select and orderBy', async () => {
      const pets = await BoundPet.query()
        .select(
          'id',
          Pet.ref('age').gt(5).as('old'),
          val('pet').as('kind'),
          val(null).as('nothing'),
        )
        .orderBy(Pet.ref('species').eq('cat'), 'desc')
        .orderBy('id');

      expect(ids(pets)).to.eql([2, 1, 3, 4, 5]);
      expect(pets.map((it) => truthy(it.old))).to.eql([true, false, false, true, false]);
      expect(pets[0].kind).to.equal('pet');
      expect(pets[0].nothing).to.equal(null);
    });

    it('arithmetic in patch', async () => {
      await BoundPet.query()
        .patch({ order: Pet.ref('order').plus(1) })
        .where('ownerId', 1)
        .where('order', '>=', 2);

      // SQLite has no GREATEST().
      const age = Pet.ref('age').minus(5);
      await BoundPet.query()
        .patch({
          age: session.isSqlite() ? fn.case().when(age.lt(0), 0).else(age) : fn.greatest(age, 0),
        })
        .where('ownerId', 2);

      const pets = await BoundPet.query().orderBy('id');
      expect(pets.map((it) => it.order)).to.eql([1, 3, 4, 1, 2]);
      expect(pets.map((it) => it.age)).to.eql([3, 7, 1, 5, 0]);
    });

    it('fn.case()', async () => {
      const pets = await BoundPet.query()
        .select(
          'id',
          fn
            .case()
            .when(Pet.ref('age').gte(7), 'old')
            .when(Pet.ref('age').gte(3), 'adult')
            .else('young')
            .as('stage'),
          fn.case(Pet.ref('species')).when('dog', 1).when('cat', 2).as('rank'),
        )
        .orderBy('id');

      expect(pets.map((it) => it.stage)).to.eql(['adult', 'old', 'young', 'old', 'young']);
      expect(pets.map((it) => it.rank)).to.eql([1, 2, 1, 1, null]);
    });

    it('fn.exists()', async () => {
      const owners = await BoundOwner.query()
        .select('id', fn.exists(Owner.relatedQuery('pets').where('species', 'cat')).as('hasCat'))
        .where(fn.exists(Owner.relatedQuery('pets')))
        .orderBy('id');

      expect(ids(owners)).to.eql([1, 2]);
      expect(owners.map((it) => truthy(it.hasCat))).to.eql([true, false]);
    });

    it('none()', async () => {
      expect(await BoundPet.query().none()).to.eql([]);
      expect(await BoundOwner.fromJson({ id: 1 }).$relatedQuery('pets').none()).to.eql([]);
    });

    it('aggregates with filter()', async () => {
      const rows = await BoundPet.query()
        .select(
          'ownerId',
          fn.count().as('pets'),
          fn.count().filter(Pet.ref('vaccinated')).as('vaccinated'),
          fn
            .count()
            .filter(Pet.ref('species').eq('dog'))
            .filter(Pet.ref('age').gt(2))
            .as('oldDogs'),
          fn.countDistinct(Pet.ref('species')).filter(Pet.ref('age').lt(5)).as('youngSpecies'),
          fn.sum(Pet.ref('age')).filter(Pet.ref('species').eq('dog')).as('dogYears'),
          fn.avg(Pet.ref('age')).filter(Pet.ref('species').eq('cat')).as('catAge'),
          fn.max(Pet.ref('age')).filter(Pet.ref('vaccinated')).as('maxVaccinatedAge'),
        )
        .groupBy('ownerId')
        .having(fn.count().gt(1))
        .orderBy('ownerId');

      expect(rows.map((it) => Number(it.pets))).to.eql([3, 2]);
      expect(rows.map((it) => Number(it.vaccinated))).to.eql([2, 1]);
      expect(rows.map((it) => Number(it.oldDogs))).to.eql([1, 1]);
      expect(rows.map((it) => Number(it.youngSpecies))).to.eql([1, 1]);
      expect(rows.map((it) => Number(it.dogYears))).to.eql([4, 10]);
      expect(Number(rows[0].catAge)).to.equal(7);
      expect(rows[1].catAge).to.equal(null);
      expect(rows.map((it) => it.maxVaccinatedAge)).to.eql([3, 2]);
    });

    it('window functions: the two youngest pets of each owner', async () => {
      const pets = await BoundPet.query()
        .from(
          BoundPet.query()
            .select(
              'ExpressionsPet.*',
              fn
                .rowNumber()
                .over({ partitionBy: 'ownerId', orderBy: ['age', 'asc'] })
                .as('rn'),
              fn.count().over({ partitionBy: 'ownerId' }).as('ownerPets'),
              fn
                .lag(Pet.ref('age'))
                .over({ partitionBy: 'ownerId', orderBy: 'age' })
                .as('previousAge'),
            )
            .as('ExpressionsPet'),
        )
        .where('rn', '<=', 2)
        .orderBy(['ownerId', 'rn']);

      expect(ids(pets)).to.eql([3, 1, 5, 4]);
      expect(pets.map((it) => Number(it.ownerPets))).to.eql([3, 3, 2, 2]);
      expect(pets.map((it) => it.previousAge)).to.eql([null, 1, null, 2]);
    });

    it('fn.excluded() in an upsert', async () => {
      // MySQL and SQLite need a unique key for the conflict.
      await BoundPet.query()
        .insert([
          { id: 1, ownerId: 1, species: 'wolf', age: 4, order: 1, vaccinated: true },
          { id: 2, ownerId: 1, species: 'lion', age: 99, order: 2, vaccinated: false },
        ])
        .onConflict('id')
        .merge({
          species: fn.excluded('species'),
          age: fn.case().when(fn.excluded('age').gt(50), Pet.ref('age')).else(fn.excluded('age')),
        });

      const pets = await BoundPet.query().whereIn('id', [1, 2]).orderBy('id');
      expect(pets.map((it) => it.species)).to.eql(['wolf', 'lion']);
      expect(pets.map((it) => it.age)).to.eql([4, 7]);
    });

    it('casts and comparisons should compose', async () => {
      const rows = await BoundPet.query()
        .select('id', Pet.ref('age').castText().eq('3').as('isThree'))
        .orderBy('id')
        .limit(1);

      expect(truthy(rows[0].isThree)).to.equal(true);
    });
  });
};
