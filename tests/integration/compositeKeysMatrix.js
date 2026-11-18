const expect = require('expect.js');
const { Model } = require('../..');

// Composite keys across every relation type, in a multi-tenant schema: every
// key starts with `tenantId`, and both tenants have owners, pets and tags with
// the same codes and numbers. A query that loses the `tenantId` part of a key
// returns or changes the rows of the other tenant, which the expectations,
// computed from the data below and not by objection, catch.
module.exports = (session) => {
  describe('composite keys across relation types', () => {
    const knex = session.knex;

    class Owner extends Model {
      static get tableName() {
        return 'cmOwners';
      }

      static get idColumn() {
        return ['tenantId', 'code'];
      }

      static get modifiers() {
        return {
          named: (qb, name) => qb.where('cmOwners.name', name),
        };
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: {
              from: ['cmOwners.tenantId', 'cmOwners.code'],
              to: ['cmPets.tenantId', 'cmPets.ownerCode'],
            },
          },
          firstPet: {
            relation: Model.HasOneRelation,
            modelClass: Pet,
            // Unqualified: the static `relatedQuery()` aliases the table as the
            // relation's name.
            modify: (qb) => qb.where('petNo', 1),
            join: {
              from: ['cmOwners.tenantId', 'cmOwners.code'],
              to: ['cmPets.tenantId', 'cmPets.ownerCode'],
            },
          },
          // A key that is all part of the related id: it can't be unrelated.
          tenantPets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'cmOwners.tenantId', to: 'cmPets.tenantId' },
          },
          tags: {
            relation: Model.ManyToManyRelation,
            modelClass: Tag,
            join: {
              from: ['cmOwners.tenantId', 'cmOwners.code'],
              through: {
                from: ['cmOwnerTags.tenantId', 'cmOwnerTags.ownerCode'],
                to: ['cmOwnerTags.tenantId', 'cmOwnerTags.tagCode'],
                extra: ['note'],
              },
              to: ['cmTags.tenantId', 'cmTags.code'],
            },
          },
          favoriteTag: {
            relation: Model.HasOneThroughRelation,
            modelClass: Tag,
            join: {
              from: ['cmOwners.tenantId', 'cmOwners.code'],
              through: {
                from: ['cmFavorites.tenantId', 'cmFavorites.ownerCode'],
                to: ['cmFavorites.tenantId', 'cmFavorites.tagCode'],
              },
              to: ['cmTags.tenantId', 'cmTags.code'],
            },
          },
        };
      }
    }

    class Pet extends Model {
      static get tableName() {
        return 'cmPets';
      }

      static get idColumn() {
        return ['tenantId', 'petNo'];
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Owner,
            join: {
              from: ['cmPets.tenantId', 'cmPets.ownerCode'],
              to: ['cmOwners.tenantId', 'cmOwners.code'],
            },
          },
          toys: {
            relation: Model.HasManyRelation,
            modelClass: Toy,
            join: {
              from: ['cmPets.tenantId', 'cmPets.petNo'],
              to: ['cmToys.tenantId', 'cmToys.petNo'],
            },
          },
        };
      }
    }

    // A single-column id, with a composite foreign key.
    class Toy extends Model {
      static get tableName() {
        return 'cmToys';
      }

      static get relationMappings() {
        return {
          pet: {
            relation: Model.BelongsToOneRelation,
            modelClass: Pet,
            join: {
              from: ['cmToys.tenantId', 'cmToys.petNo'],
              to: ['cmPets.tenantId', 'cmPets.petNo'],
            },
          },
        };
      }
    }

    class Tag extends Model {
      static get tableName() {
        return 'cmTags';
      }

      static get idColumn() {
        return ['tenantId', 'code'];
      }
    }

    const BoundOwner = Owner.bindKnex(knex);
    const BoundPet = Pet.bindKnex(knex);
    const BoundToy = Toy.bindKnex(knex);
    const BoundTag = Tag.bindKnex(knex);

    const TABLES = ['cmToys', 'cmFavorites', 'cmOwnerTags', 'cmPets', 'cmTags', 'cmOwners'];

    // Both tenants have owners `a` and `b`, a pet 1 and a tag `red`.
    const DATA = {
      cmOwners: [
        { tenantId: 1, code: 'a', name: 'Ann' },
        { tenantId: 1, code: 'b', name: 'Bob' },
        { tenantId: 2, code: 'a', name: 'Ada' },
        { tenantId: 2, code: 'b', name: 'Ben' },
      ],
      cmPets: [
        { tenantId: 1, petNo: 1, ownerCode: 'a', name: 'Fido' },
        { tenantId: 1, petNo: 2, ownerCode: 'a', name: 'Rex' },
        { tenantId: 1, petNo: 3, ownerCode: 'b', name: 'Tom' },
        { tenantId: 2, petNo: 1, ownerCode: 'a', name: 'Kit' },
        { tenantId: 2, petNo: 2, ownerCode: 'b', name: 'Max' },
      ],
      cmToys: [
        { id: 1, tenantId: 1, petNo: 1, name: 'ball' },
        { id: 2, tenantId: 1, petNo: 1, name: 'bone' },
        { id: 3, tenantId: 2, petNo: 1, name: 'mouse' },
        { id: 4, tenantId: 1, petNo: 3, name: 'yarn' },
      ],
      cmTags: [
        { tenantId: 1, code: 'red', label: 'Red' },
        { tenantId: 1, code: 'blue', label: 'Blue' },
        { tenantId: 2, code: 'red', label: 'Rot' },
        { tenantId: 2, code: 'blue', label: 'Blau' },
      ],
      cmOwnerTags: [
        { tenantId: 1, ownerCode: 'a', tagCode: 'red', note: 'n1' },
        { tenantId: 1, ownerCode: 'a', tagCode: 'blue', note: 'n2' },
        { tenantId: 1, ownerCode: 'b', tagCode: 'red', note: 'n3' },
        { tenantId: 2, ownerCode: 'a', tagCode: 'blue', note: 'n4' },
      ],
      cmFavorites: [
        { tenantId: 1, ownerCode: 'a', tagCode: 'blue' },
        { tenantId: 2, ownerCode: 'a', tagCode: 'red' },
      ],
    };

    before(async () => {
      for (const table of TABLES) {
        await knex.schema.dropTableIfExists(table);
      }

      await knex.schema.createTable('cmOwners', (table) => {
        table.integer('tenantId').notNullable();
        table.string('code', 16).notNullable();
        table.string('name');
        table.primary(['tenantId', 'code']);
      });
      await knex.schema.createTable('cmTags', (table) => {
        table.integer('tenantId').notNullable();
        table.string('code', 16).notNullable();
        table.string('label');
        table.primary(['tenantId', 'code']);
      });
      await knex.schema.createTable('cmPets', (table) => {
        table.integer('tenantId').notNullable();
        table.integer('petNo').notNullable();
        table.string('ownerCode', 16);
        table.string('name');
        table.primary(['tenantId', 'petNo']);
      });
      await knex.schema.createTable('cmToys', (table) => {
        table.increments('id').primary();
        table.integer('tenantId');
        table.integer('petNo');
        table.string('name');
      });
      await knex.schema.createTable('cmOwnerTags', (table) => {
        table.integer('tenantId').notNullable();
        table.string('ownerCode', 16).notNullable();
        table.string('tagCode', 16).notNullable();
        table.string('note');
        table.primary(['tenantId', 'ownerCode', 'tagCode']);
      });
      await knex.schema.createTable('cmFavorites', (table) => {
        table.integer('tenantId').notNullable();
        table.string('ownerCode', 16).notNullable();
        table.string('tagCode', 16).notNullable();
        table.primary(['tenantId', 'ownerCode']);
      });
    });

    after(async () => {
      for (const table of TABLES) {
        await knex.schema.dropTableIfExists(table);
      }
    });

    beforeEach(async () => {
      for (const table of TABLES) {
        await knex(table).delete();
      }

      for (const table of [...TABLES].reverse()) {
        await knex(table).insert(DATA[table]);
      }

      if (session.isPostgres()) {
        await knex.raw(`select setval('"cmToys_id_seq"', 100)`);
      }
    });

    // The rows of a table, as sorted strings of their values.
    async function rows(table, columns) {
      const result = await knex(table).select(columns);
      return result.map((row) => columns.map((col) => String(row[col])).join('/')).sort();
    }

    // What the data says the relations of an owner are.
    const expected = {
      pets: (t, code) =>
        DATA.cmPets.filter((p) => p.tenantId === t && p.ownerCode === code).map((p) => p.name),
      tags: (t, code) =>
        DATA.cmOwnerTags
          .filter((ot) => ot.tenantId === t && ot.ownerCode === code)
          .map((ot) => {
            const tag = DATA.cmTags.find((it) => it.tenantId === t && it.code === ot.tagCode);
            return `${tag.label}:${ot.note}`;
          }),
      favorite: (t, code) => {
        const fav = DATA.cmFavorites.find((f) => f.tenantId === t && f.ownerCode === code);
        return fav
          ? DATA.cmTags.find((it) => it.tenantId === t && it.code === fav.tagCode).label
          : null;
      },
    };

    const sorted = (arr) => [...arr].sort();

    describe('finding by id', () => {
      it('should find by ids, also with a number for a string part', async () => {
        const owner = await BoundOwner.query().findById([2, 'a']);
        expect(owner.name).to.equal('Ada');

        const owners = await BoundOwner.query()
          .findByIds([
            [1, 'b'],
            [2, 'b'],
          ])
          .orderBy('tenantId');
        expect(owners.map((it) => it.name)).to.eql(['Bob', 'Ben']);

        const pet = await BoundPet.query().findById(['2', 1]);
        expect(pet.name).to.equal('Kit');
      });
    });

    describe('writes by id', () => {
      it('should patch and fetch one row by its composite id', async () => {
        const owner = await BoundOwner.query().patchAndFetchById([2, 'a'], { name: 'Adele' });

        expect(owner.name).to.equal('Adele');
        expect(await rows('cmOwners', ['tenantId', 'code', 'name'])).to.eql([
          '1/a/Ann',
          '1/b/Bob',
          '2/a/Adele',
          '2/b/Ben',
        ]);
      });

      it('should patch and delete through $query()', async () => {
        const owner = await BoundOwner.query().findById([1, 'b']);
        await owner.$query().patch({ name: 'Bobby' });
        expect(owner.name).to.equal('Bobby');

        const pet = await BoundPet.query().findById([2, 1]);
        await pet.$query().delete();

        expect(await rows('cmOwners', ['tenantId', 'code', 'name'])).to.contain('1/b/Bobby');
        expect(await rows('cmPets', ['tenantId', 'petNo'])).to.eql(['1/1', '1/2', '1/3', '2/2']);
      });
    });

    describe('$relatedQuery()', () => {
      const owner = (t, code) => BoundOwner.query().findById([t, code]);

      it('should find the related rows of each relation type', async () => {
        for (const [t, code] of [
          [1, 'a'],
          [2, 'a'],
          [1, 'b'],
          [2, 'b'],
        ]) {
          const o = await owner(t, code);
          const pets = await o.$relatedQuery('pets');
          const firstPet = await o.$relatedQuery('firstPet');
          const tags = await o.$relatedQuery('tags');
          const favorite = await o.$relatedQuery('favoriteTag');

          expect(sorted(pets.map((it) => it.name))).to.eql(sorted(expected.pets(t, code)));
          expect(firstPet ? firstPet.name : null).to.equal(
            DATA.cmPets.find((p) => p.tenantId === t && p.ownerCode === code && p.petNo === 1)
              ?.name ?? null,
          );
          expect(sorted(tags.map((it) => `${it.label}:${it.note}`))).to.eql(
            sorted(expected.tags(t, code)),
          );
          expect(favorite ? favorite.label : null).to.equal(expected.favorite(t, code));
        }
      });

      it('should insert related rows of each relation type in the tenant', async () => {
        const o = await owner(2, 'b');

        await o.$relatedQuery('pets').insert({ petNo: 7, name: 'New' });
        await o
          .$relatedQuery('tags')
          .insert({ tenantId: 2, code: 'green', label: 'Grün', note: 'n9' });

        expect(await rows('cmPets', ['tenantId', 'petNo', 'ownerCode', 'name'])).to.contain(
          '2/7/b/New',
        );
        expect(await rows('cmTags', ['tenantId', 'code'])).to.contain('2/green');
        expect(await rows('cmOwnerTags', ['tenantId', 'ownerCode', 'tagCode', 'note'])).to.contain(
          '2/b/green/n9',
        );
      });

      it('should patch, relate and unrelate with filters in the tenant only', async () => {
        const o = await owner(1, 'a');

        await o.$relatedQuery('tags').patch({ note: 'patched' }).where('cmTags.code', 'red');
        await o.$relatedQuery('pets').patch({ name: 'Rexy' }).where('cmPets.petNo', 2);
        await o.$relatedQuery('tags').unrelate().where('cmTags.code', 'blue');
        await (await owner(2, 'b')).$relatedQuery('tags').relate({
          tenantId: 2,
          code: 'red',
          note: 'n5',
        });

        expect(await rows('cmOwnerTags', ['tenantId', 'ownerCode', 'tagCode', 'note'])).to.eql([
          '1/a/red/patched',
          '1/b/red/n3',
          '2/a/blue/n4',
          '2/b/red/n5',
        ]);
        expect(await rows('cmPets', ['tenantId', 'petNo', 'name'])).to.eql([
          '1/1/Fido',
          '1/2/Rexy',
          '1/3/Tom',
          '2/1/Kit',
          '2/2/Max',
        ]);
      });

      it('should relate and unrelate a has-many relation in the tenant', async () => {
        await knex('cmPets').insert({ tenantId: 2, petNo: 9, ownerCode: null, name: 'Stray' });
        await (await owner(2, 'b')).$relatedQuery('pets').relate([2, 9]);
        await (await owner(1, 'a')).$relatedQuery('pets').unrelate().where('cmPets.petNo', 1);

        expect(await rows('cmPets', ['tenantId', 'petNo', 'ownerCode'])).to.eql([
          '1/1/null',
          '1/2/a',
          '1/3/b',
          '2/1/a',
          '2/2/b',
          '2/9/b',
        ]);
      });

      it('should delete related rows in the tenant only', async () => {
        await (await owner(2, 'a')).$relatedQuery('pets').delete();
        await (await owner(1, 'b')).$relatedQuery('tags').delete();

        expect(await rows('cmPets', ['tenantId', 'petNo'])).to.eql(['1/1', '1/2', '1/3', '2/2']);
        expect(await rows('cmTags', ['tenantId', 'code'])).to.eql(['1/blue', '2/blue', '2/red']);
      });

      it('should unrelate a key that shares a column with the id', async () => {
        // The pet's key to its owner is (tenantId, ownerCode), and its id
        // (tenantId, petNo): unrelating clears ownerCode only.
        const pet = await BoundPet.query().findById([1, 2]);
        await pet.$relatedQuery('owner').unrelate();

        expect(pet.tenantId).to.equal(1);
        expect(pet.ownerCode).to.equal(null);
        expect(await rows('cmPets', ['tenantId', 'petNo', 'ownerCode'])).to.eql([
          '1/1/a',
          '1/2/null',
          '1/3/b',
          '2/1/a',
          '2/2/b',
        ]);
      });

      it('should not unrelate a key that is all part of the id', async () => {
        const owner = await BoundOwner.query().findById([1, 'a']);
        let error = null;

        try {
          await owner.$relatedQuery('tenantPets').unrelate();
        } catch (err) {
          error = err;
        }

        expect(error.message).to.equal(
          "Owner.relationMappings.tenantPets: can't unrelate: the key Pet.tenantId is part of the id of Pet. Delete the rows instead.",
        );
        expect(await rows('cmPets', ['tenantId', 'petNo', 'ownerCode'])).to.eql([
          '1/1/a',
          '1/2/a',
          '1/3/b',
          '2/1/a',
          '2/2/b',
        ]);
      });

      it('should relate and unrelate a belongs-to-one relation', async () => {
        const pet = await BoundPet.query().findById([2, 2]);
        await pet.$relatedQuery('owner').relate([2, 'a']);
        const toy = await BoundToy.query().findById(4);
        await toy.$relatedQuery('pet').unrelate();

        expect(await rows('cmPets', ['tenantId', 'petNo', 'ownerCode'])).to.contain('2/2/a');
        expect(await rows('cmToys', ['id', 'tenantId', 'petNo'])).to.contain('4/null/null');
      });
    });

    describe('static relatedQuery()', () => {
      it('should count the related rows in a select', async () => {
        const owners = await BoundOwner.query()
          .select(
            'cmOwners.*',
            BoundOwner.relatedQuery('pets').count().as('petCount'),
            BoundOwner.relatedQuery('tags').count().as('tagCount'),
          )
          .orderBy(['tenantId', 'code']);

        expect(owners.map((it) => `${it.name}:${it.petCount}:${it.tagCount}`)).to.eql(
          DATA.cmOwners.map(
            (o) =>
              `${o.name}:${expected.pets(o.tenantId, o.code).length}:${expected.tags(o.tenantId, o.code).length}`,
          ),
        );
      });

      it('should filter with whereExists() on each relation type', async () => {
        for (const relation of ['pets', 'firstPet', 'tags', 'favoriteTag']) {
          const owners = await BoundOwner.query()
            .whereExists(BoundOwner.relatedQuery(relation))
            .orderBy(['tenantId', 'code']);
          const want = DATA.cmOwners.filter((o) => {
            if (relation === 'pets') return expected.pets(o.tenantId, o.code).length > 0;
            if (relation === 'tags') return expected.tags(o.tenantId, o.code).length > 0;
            if (relation === 'favoriteTag') return expected.favorite(o.tenantId, o.code) !== null;
            return DATA.cmPets.some(
              (p) => p.tenantId === o.tenantId && p.ownerCode === o.code && p.petNo === 1,
            );
          });

          expect(owners.map((it) => it.name)).to.eql(want.map((it) => it.name));
        }
      });

      it('should find the related rows for ids, models and a query', async () => {
        const forIds = await BoundOwner.relatedQuery('pets').for([[2, 'a']]);
        const forModels = await BoundOwner.relatedQuery('tags').for(
          await BoundOwner.query().where('tenantId', 1).where('code', 'b'),
        );
        const forQuery = await BoundPet.relatedQuery('owner').for(
          BoundPet.query().where('tenantId', 2),
        );

        expect(forIds.map((it) => it.name)).to.eql(['Kit']);
        expect(forModels.map((it) => it.label)).to.eql(['Red']);
        expect(sorted(forQuery.map((it) => it.name))).to.eql(['Ada', 'Ben']);
      });

      it('should find related rows of a composite key that is not the id', async () => {
        const owners = await BoundToy.relatedQuery('pet')
          .for([1, 3])
          .withGraphFetched('owner')
          .orderBy('cmPets.tenantId');

        expect(owners.map((it) => `${it.name}:${it.owner.name}`)).to.eql(['Fido:Ann', 'Kit:Ada']);
      });
    });

    describe('loading relations', () => {
      const shape = (owners) =>
        owners.map((o) => ({
          owner: `${o.tenantId}/${o.code}`,
          pets: sorted(
            o.pets.map((p) => `${p.name}(${sorted(p.toys.map((toy) => toy.name)).join(',')})`),
          ),
          firstPet: o.firstPet ? o.firstPet.name : null,
          tags: sorted(o.tags.map((t) => `${t.label}:${t.note}`)),
          favorite: o.favoriteTag ? o.favoriteTag.label : null,
        }));

      const want = DATA.cmOwners.map((o) => ({
        owner: `${o.tenantId}/${o.code}`,
        pets: sorted(
          DATA.cmPets
            .filter((p) => p.tenantId === o.tenantId && p.ownerCode === o.code)
            .map(
              (p) =>
                `${p.name}(${sorted(
                  DATA.cmToys
                    .filter((toy) => toy.tenantId === p.tenantId && toy.petNo === p.petNo)
                    .map((toy) => toy.name),
                ).join(',')})`,
            ),
        ),
        firstPet:
          DATA.cmPets.find(
            (p) => p.tenantId === o.tenantId && p.ownerCode === o.code && p.petNo === 1,
          )?.name ?? null,
        tags: sorted(expected.tags(o.tenantId, o.code)),
        favorite: expected.favorite(o.tenantId, o.code),
      }));

      for (const method of ['withGraphFetched', 'withGraphJoined']) {
        it(`should load every relation type with ${method}()`, async () => {
          const owners = await BoundOwner.query()
            [method]('[pets.toys, firstPet, tags, favoriteTag]')
            .orderBy(['cmOwners.tenantId', 'cmOwners.code']);

          expect(shape(owners)).to.eql(want);
        });

        it(`should filter the relations with modifiers in ${method}()`, async () => {
          const owners = await BoundOwner.query()
            [method]('[pets(onlyFirst), tags(onlyRed)]')
            .modifiers({
              onlyFirst: (qb) => qb.where('petNo', 1),
              onlyRed: (qb) => qb.where('code', 'red'),
            })
            .orderBy(['cmOwners.tenantId', 'cmOwners.code']);

          expect(
            owners.map(
              (o) =>
                `${o.tenantId}/${o.code}:${o.pets.map((p) => p.name).join(',')}:${o.tags
                  .map((t) => t.label)
                  .join(',')}`,
            ),
          ).to.eql(['1/a:Fido:Red', '1/b::Red', '2/a:Kit:', '2/b::']);
        });
      }

      it('should load the graph of fetched models with $fetchGraph()', async () => {
        const owners = await BoundOwner.query().orderBy(['tenantId', 'code']);
        await BoundOwner.fetchGraph(owners, '[pets.toys, firstPet, tags, favoriteTag]');

        expect(shape(owners)).to.eql(want);
      });

      it('should join each relation type with joinRelated() and leftJoinRelated()', async () => {
        const pets = await BoundOwner.query()
          .joinRelated('pets')
          .select('cmOwners.name', 'pets.name as petName')
          .orderBy(['cmOwners.tenantId', 'pets.petNo']);
        const tags = await BoundOwner.query()
          .leftJoinRelated('[tags, favoriteTag]')
          .select('cmOwners.name', 'tags.label as tagLabel', 'favoriteTag.label as favLabel')
          .where('cmOwners.tenantId', 2)
          .orderBy(['cmOwners.code', 'tags.code']);

        expect(pets.map((it) => `${it.name}:${it.petName}`)).to.eql([
          'Ann:Fido',
          'Ann:Rex',
          'Bob:Tom',
          'Ada:Kit',
          'Ben:Max',
        ]);
        expect(tags.map((it) => `${it.name}:${it.tagLabel}:${it.favLabel}`)).to.eql([
          'Ada:Blau:Rot',
          'Ben:null:null',
        ]);
      });
    });

    describe('paging and streaming', () => {
      it('should page with page(), range() and resultSize()', async () => {
        const page = await BoundOwner.query().orderBy(['tenantId', 'code']).page(1, 3);
        const range = await BoundPet.query().orderBy(['tenantId', 'petNo']).range(1, 2);
        const size = await BoundPet.query().where('tenantId', 1).resultSize();

        expect(page.total).to.equal(4);
        expect(page.results.map((it) => it.name)).to.eql(['Ben']);
        expect(range.results.map((it) => it.name)).to.eql(['Rex', 'Tom']);
        expect(size).to.equal(3);
      });

      it('should stream and cursor-page through the composite ids', async () => {
        const streamed = [];

        for await (const pet of BoundPet.query().orderBy(['tenantId', 'petNo']).stream()) {
          streamed.push(pet.name);
        }

        const paged = [];
        let after = null;

        do {
          const page = await BoundPet.query().orderBy('name', 'desc').cursorPage(2, after);
          paged.push(...page.results.map((it) => it.name));
          after = page.next;
        } while (after !== null && paged.length < 20);

        expect(streamed).to.eql(['Fido', 'Rex', 'Tom', 'Kit', 'Max']);
        expect(paged).to.eql(['Tom', 'Rex', 'Max', 'Kit', 'Fido']);
      });
    });

    describe('onConflict() on a composite key', () => {
      it('should merge and ignore by both columns', async () => {
        await BoundOwner.query()
          .insert({ tenantId: 2, code: 'a', name: 'Adeline' })
          .onConflict(['tenantId', 'code'])
          .merge(['name']);
        await BoundOwner.query()
          .insert({ tenantId: 1, code: 'a', name: 'Ignored' })
          .onConflict(['tenantId', 'code'])
          .ignore();
        const inserted = await BoundOwner.query()
          .insert({ tenantId: 3, code: 'a', name: 'Cid' })
          .onConflict(['tenantId', 'code'])
          .merge();

        expect(inserted.$id()).to.eql([3, 'a']);
        expect(await rows('cmOwners', ['tenantId', 'code', 'name'])).to.eql([
          '1/a/Ann',
          '1/b/Bob',
          '2/a/Adeline',
          '2/b/Ben',
          '3/a/Cid',
        ]);
      });
    });

    // The rows of the tenants in `tenants` are those of `DATA`.
    async function expectUntouched(tenants) {
      const columns = {
        cmOwners: ['tenantId', 'code', 'name'],
        cmPets: ['tenantId', 'petNo', 'ownerCode', 'name'],
        cmToys: ['tenantId', 'petNo', 'name'],
        cmTags: ['tenantId', 'code', 'label'],
        cmOwnerTags: ['tenantId', 'ownerCode', 'tagCode', 'note'],
        cmFavorites: ['tenantId', 'ownerCode', 'tagCode'],
      };

      for (const [table, cols] of Object.entries(columns)) {
        const actual = (await rows(table, cols)).filter((it) =>
          tenants.includes(Number(it.split('/')[0])),
        );
        const want = DATA[table]
          .filter((it) => tenants.includes(it.tenantId))
          .map((it) => cols.map((col) => String(it[col])).join('/'))
          .sort();

        expect(actual).to.eql(want);
      }
    }

    const ofTenant = async (table, columns, tenant) =>
      (await rows(table, columns)).filter((it) => it.startsWith(`${tenant}/`));

    describe('insertGraph()', () => {
      it('should give every relation type both parts of its key', async () => {
        await BoundOwner.query().insertGraph({
          tenantId: 3,
          code: 'a',
          name: 'Cid',
          pets: [
            { petNo: 1, name: 'P1', toys: [{ name: 't1' }, { name: 't2' }] },
            { petNo: 2, name: 'P2' },
          ],
          tags: [{ tenantId: 3, code: 'red', label: 'Rouge', note: 'm1' }],
          favoriteTag: { tenantId: 3, code: 'blue', label: 'Bleu' },
        });

        expect(await ofTenant('cmOwners', ['tenantId', 'code', 'name'], 3)).to.eql(['3/a/Cid']);
        expect(await ofTenant('cmPets', ['tenantId', 'petNo', 'ownerCode', 'name'], 3)).to.eql([
          '3/1/a/P1',
          '3/2/a/P2',
        ]);
        expect(await ofTenant('cmToys', ['tenantId', 'petNo', 'name'], 3)).to.eql([
          '3/1/t1',
          '3/1/t2',
        ]);
        expect(await ofTenant('cmTags', ['tenantId', 'code', 'label'], 3)).to.eql([
          '3/blue/Bleu',
          '3/red/Rouge',
        ]);
        expect(
          await ofTenant('cmOwnerTags', ['tenantId', 'ownerCode', 'tagCode', 'note'], 3),
        ).to.eql(['3/a/red/m1']);
        expect(await ofTenant('cmFavorites', ['tenantId', 'ownerCode', 'tagCode'], 3)).to.eql([
          '3/a/blue',
        ]);
        await expectUntouched([1, 2]);
      });

      it('should insert several owners with the same pet numbers', async () => {
        await BoundOwner.query().insertGraph([
          { tenantId: 3, code: 'a', name: 'Cid', pets: [{ petNo: 1, name: 'C1' }] },
          {
            tenantId: 4,
            code: 'a',
            name: 'Dan',
            pets: [
              { petNo: 1, name: 'D1' },
              { petNo: 2, name: 'D2', toys: [{ name: 'dt' }] },
            ],
          },
        ]);

        const pets = (await rows('cmPets', ['tenantId', 'petNo', 'ownerCode', 'name'])).filter(
          (it) => /^[34]\//.test(it),
        );
        const toys = (await rows('cmToys', ['tenantId', 'petNo', 'name'])).filter((it) =>
          /^[34]\//.test(it),
        );

        expect(pets).to.eql(['3/1/a/C1', '4/1/a/D1', '4/2/a/D2']);
        expect(toys).to.eql(['4/2/dt']);
        await expectUntouched([1, 2]);
      });

      it('should share a new tag through #ref', async () => {
        await BoundOwner.query().insertGraph(
          [
            {
              tenantId: 3,
              code: 'a',
              name: 'Cid',
              tags: [{ '#id': 'shared', tenantId: 3, code: 'green', label: 'Vert', note: 'x1' }],
            },
            { tenantId: 3, code: 'b', name: 'Cal', tags: [{ '#ref': 'shared' }] },
          ],
          { allowRefs: true },
        );

        expect(await ofTenant('cmTags', ['tenantId', 'code'], 3)).to.eql(['3/green']);
        // `#ref` is the same model, and the extras of the join rows are its
        // properties: both join rows get its note.
        expect(
          await ofTenant('cmOwnerTags', ['tenantId', 'ownerCode', 'tagCode', 'note'], 3),
        ).to.eql(['3/a/green/x1', '3/b/green/x1']);
        await expectUntouched([1, 2]);
      });

      it('should relate existing tags of the tenant with relate: true', async () => {
        await BoundOwner.query().insertGraph(
          { tenantId: 2, code: 'c', name: 'Cora', tags: [{ tenantId: 2, code: 'red', note: 'r' }] },
          { relate: true },
        );

        expect(await rows('cmTags', ['tenantId', 'code'])).to.eql([
          '1/blue',
          '1/red',
          '2/blue',
          '2/red',
        ]);
        expect(
          await ofTenant('cmOwnerTags', ['tenantId', 'ownerCode', 'tagCode', 'note'], 2),
        ).to.eql(['2/a/blue/n4', '2/c/red/r']);
        await expectUntouched([1]);
      });

      it('should insert the owner of a pet first and give the pet its key', async () => {
        await BoundPet.query().insertGraph([
          { tenantId: 3, petNo: 5, name: 'Solo', owner: { tenantId: 3, code: 'z', name: 'Zed' } },
          // The pet's tenantId comes from its owner.
          { petNo: 6, name: 'Solo2', owner: { tenantId: 3, code: 'y', name: 'Yan' } },
        ]);

        expect(await ofTenant('cmOwners', ['tenantId', 'code', 'name'], 3)).to.eql([
          '3/y/Yan',
          '3/z/Zed',
        ]);
        expect(await ofTenant('cmPets', ['tenantId', 'petNo', 'ownerCode', 'name'], 3)).to.eql([
          '3/5/z/Solo',
          '3/6/y/Solo2',
        ]);
        await expectUntouched([1, 2]);
      });

      it('should fetch the stored graph with insertGraphAndFetch()', async () => {
        const owner = await BoundOwner.query().insertGraphAndFetch({
          tenantId: 3,
          code: 'a',
          name: 'Cid',
          pets: [{ petNo: 1, name: 'P1', toys: [{ name: 't1' }] }],
          tags: [{ tenantId: 3, code: 'red', label: 'Rouge', note: 'n' }],
        });

        expect(owner.$id()).to.eql([3, 'a']);
        expect(owner.pets.map((it) => [...it.$id(), it.ownerCode, it.name])).to.eql([
          [3, 1, 'a', 'P1'],
        ]);
        expect(owner.pets[0].toys.map((it) => `${it.tenantId}/${it.petNo}/${it.name}`)).to.eql([
          '3/1/t1',
        ]);
        expect(owner.tags.map((it) => `${it.tenantId}/${it.code}/${it.label}/${it.note}`)).to.eql([
          '3/red/Rouge/n',
        ]);
      });

      it('should roll back a graph that fails in a transaction', async () => {
        let error = null;

        try {
          await Model.transaction(knex, (trx) =>
            Owner.query(trx).insertGraph({
              tenantId: 3,
              code: 'a',
              name: 'Cid',
              tags: [{ tenantId: 3, code: 'red', label: 'Rouge' }],
              // The same id twice.
              pets: [
                { petNo: 1, name: 'one' },
                { petNo: 1, name: 'again' },
              ],
            }),
          );
        } catch (err) {
          error = err;
        }

        expect(error).to.be.an(Error);
        await expectUntouched([1, 2, 3]);
      });
    });

    describe('more upsertGraph()', () => {
      it('should update a has-one relation and change a has-one-through relation', async () => {
        const graph = await BoundOwner.query()
          .findById([1, 'a'])
          .withGraphFetched('[firstPet, favoriteTag]');

        expect(graph.firstPet.name).to.equal('Fido');
        expect(graph.favoriteTag.code).to.equal('blue');

        graph.firstPet.name = 'Fido 2';
        graph.favoriteTag = { tenantId: 1, code: 'red' };

        await BoundOwner.query().upsertGraph(graph, { relate: true, unrelate: true });

        expect(await rows('cmFavorites', ['tenantId', 'ownerCode', 'tagCode'])).to.eql([
          '1/a/red',
          '2/a/red',
        ]);
        expect(await ofTenant('cmPets', ['tenantId', 'petNo', 'name'], 1)).to.eql([
          '1/1/Fido 2',
          '1/2/Rex',
          '1/3/Tom',
        ]);
        expect(await rows('cmTags', ['tenantId', 'code'])).to.eql([
          '1/blue',
          '1/red',
          '2/blue',
          '2/red',
        ]);
        await expectUntouched([2]);
      });

      it('should update an extra column of a many-to-many relation', async () => {
        const graph = await BoundOwner.query().findById([1, 'a']).withGraphFetched('tags');
        graph.tags.find((it) => it.code === 'red').note = 'changed';

        await BoundOwner.query().upsertGraph(graph);

        expect(await rows('cmOwnerTags', ['tenantId', 'ownerCode', 'tagCode', 'note'])).to.eql([
          '1/a/blue/n2',
          '1/a/red/changed',
          '1/b/red/n3',
          '2/a/blue/n4',
        ]);
        expect(await rows('cmTags', ['tenantId', 'code', 'label'])).to.eql(
          DATA.cmTags.map((it) => `${it.tenantId}/${it.code}/${it.label}`).sort(),
        );
      });

      it('should move a pet between two owners of the tenant in one upsert', async () => {
        await BoundOwner.query().upsertGraph(
          [
            { tenantId: 1, code: 'a', pets: [{ tenantId: 1, petNo: 1 }] },
            {
              tenantId: 1,
              code: 'b',
              pets: [
                { tenantId: 1, petNo: 3 },
                { tenantId: 1, petNo: 2 },
              ],
            },
          ],
          { relate: true, unrelate: true },
        );

        expect(await ofTenant('cmPets', ['tenantId', 'petNo', 'ownerCode', 'name'], 1)).to.eql([
          '1/1/a/Fido',
          '1/2/b/Rex',
          '1/3/b/Tom',
        ]);
        await expectUntouched([2]);
      });

      it('should insert missing rows with given composite ids', async () => {
        await BoundOwner.query().upsertGraph(
          [
            {
              tenantId: 3,
              code: 'n',
              name: 'New',
              pets: [{ tenantId: 3, petNo: 1, name: 'NP' }],
            },
          ],
          { insertMissing: true },
        );

        expect(await ofTenant('cmOwners', ['tenantId', 'code', 'name'], 3)).to.eql(['3/n/New']);
        expect(await ofTenant('cmPets', ['tenantId', 'petNo', 'ownerCode', 'name'], 3)).to.eql([
          '3/1/n/NP',
        ]);
        await expectUntouched([1, 2]);
      });

      it('should update the whole row with update: true', async () => {
        await BoundOwner.query().upsertGraph(
          { tenantId: 2, code: 'a', name: 'Ada U' },
          { update: true },
        );

        expect(await ofTenant('cmOwners', ['tenantId', 'code', 'name'], 2)).to.eql([
          '2/a/Ada U',
          '2/b/Ben',
        ]);
        await expectUntouched([1]);
      });

      it('should fetch the stored graph with upsertGraphAndFetch()', async () => {
        const graph = await BoundOwner.query()
          .findById([2, 'a'])
          .withGraphFetched('[pets.toys, tags]');
        graph.pets[0].name = 'Kitty';

        const owner = await BoundOwner.query().upsertGraphAndFetch(graph);

        expect(owner.$id()).to.eql([2, 'a']);
        expect(owner.pets.map((it) => `${it.tenantId}/${it.petNo}/${it.name}`)).to.eql([
          '2/1/Kitty',
        ]);
        expect(owner.pets[0].toys.map((it) => it.name)).to.eql(['mouse']);
        expect(owner.tags.map((it) => `${it.label}:${it.note}`)).to.eql(['Blau:n4']);
      });
    });

    describe('upsertGraph()', () => {
      const fetchGraph = (t, code) =>
        BoundOwner.query()
          .findById([t, code])
          .withGraphFetched('[pets.toys, tags]')
          .modifyGraph('pets', (qb) => qb.orderBy('petNo'))
          .modifyGraph('pets.toys', (qb) => qb.orderBy('id'));

      it('should update, insert and delete in the tenant only', async () => {
        const graph = await fetchGraph(2, 'a');
        graph.name = 'Ada 2';
        graph.pets[0].name = 'Kitty';
        graph.pets[0].toys = [{ id: graph.pets[0].toys[0].id }, { name: 'laser' }];
        graph.pets.push({ petNo: 5, name: 'Newt' });
        graph.tags = [];

        await BoundOwner.query().upsertGraph(graph);

        expect(await rows('cmOwners', ['tenantId', 'code', 'name'])).to.eql([
          '1/a/Ann',
          '1/b/Bob',
          '2/a/Ada 2',
          '2/b/Ben',
        ]);
        expect(await rows('cmPets', ['tenantId', 'petNo', 'ownerCode', 'name'])).to.eql([
          '1/1/a/Fido',
          '1/2/a/Rex',
          '1/3/b/Tom',
          '2/1/a/Kitty',
          '2/2/b/Max',
          '2/5/a/Newt',
        ]);
        expect(await rows('cmToys', ['tenantId', 'petNo', 'name'])).to.eql([
          '1/1/ball',
          '1/1/bone',
          '1/3/yarn',
          '2/1/laser',
          '2/1/mouse',
        ]);
        // The tags of tenant 2's owner a are deleted, the others are kept. The
        // join rows of deleted rows are left to the database's cascades.
        expect(await rows('cmTags', ['tenantId', 'code'])).to.eql(['1/blue', '1/red', '2/red']);
        expect((await BoundOwner.query().findById([2, 'a'])).$id()).to.eql([2, 'a']);
        expect(await (await BoundOwner.query().findById([2, 'a'])).$relatedQuery('tags')).to.eql(
          [],
        );
      });

      it('should relate and unrelate instead of inserting and deleting', async () => {
        const graph = await fetchGraph(1, 'b');
        graph.pets = [{ tenantId: 1, petNo: 2 }];
        graph.tags = [{ tenantId: 1, code: 'blue', note: 'related' }];

        await BoundOwner.query().upsertGraph(graph, { relate: true, unrelate: true });

        expect(await rows('cmPets', ['tenantId', 'petNo', 'ownerCode'])).to.eql([
          '1/1/a',
          '1/2/b',
          '1/3/null',
          '2/1/a',
          '2/2/b',
        ]);
        expect(await rows('cmOwnerTags', ['tenantId', 'ownerCode', 'tagCode', 'note'])).to.eql([
          '1/a/blue/n2',
          '1/a/red/n1',
          '1/b/blue/related',
          '2/a/blue/n4',
        ]);
        expect(await rows('cmTags', ['tenantId', 'code'])).to.eql([
          '1/blue',
          '1/red',
          '2/blue',
          '2/red',
        ]);
      });

      const options = [
        ['noDelete', { noDelete: true }, { pets: 3, tags: 2 }],
        // `noUnrelate` keeps the tags: it doesn't fall back to deleting them.
        [
          'noUnrelate with unrelate',
          { unrelate: true, noUnrelate: ['tags'] },
          { pets: 2, tags: 2 },
        ],
        ['noInsert', { noInsert: true }, { pets: 1, tags: 0 }],
        ['noUpdate', { noUpdate: true }, { pets: 2, tags: 0 }],
      ];

      for (const [name, opt, counts] of options) {
        it(`should keep the other tenant's rows with ${name}`, async () => {
          const before = {
            otherPets: await rows('cmPets', ['tenantId', 'petNo', 'ownerCode', 'name']),
          };
          const graph = await fetchGraph(1, 'a');
          graph.pets = [
            { tenantId: 1, petNo: 2, name: 'Changed' },
            { petNo: 8, name: 'Added' },
          ];
          graph.tags = [];

          await BoundOwner.query().upsertGraph(graph, opt);

          const pets = await knex('cmPets').where({ tenantId: 1, ownerCode: 'a' });
          const tags = await (await BoundOwner.query().findById([1, 'a'])).$relatedQuery('tags');

          expect({ pets: pets.length, tags: tags.length }).to.eql(counts);
          // Tenant 2 is untouched.
          expect(
            (await rows('cmPets', ['tenantId', 'petNo', 'ownerCode', 'name'])).filter((it) =>
              it.startsWith('2/'),
            ),
          ).to.eql(before.otherPets.filter((it) => it.startsWith('2/')));
          expect(
            (await rows('cmOwnerTags', ['tenantId', 'ownerCode', 'tagCode'])).filter((it) =>
              it.startsWith('2/'),
            ),
          ).to.eql(['2/a/blue']);
        });
      }
    });
  });
};
