const expect = require('expect.js');
const { Model, QueryBuilder } = require('../..');

// A custom query builder as an app would write one: soft deletes, a flag kept
// on the builder instance, custom methods used from modifiers, and a static
// `query()` that filters the soft-deleted rows. Checks that every query
// objection creates on its own, for relations, graphs, streams and pages,
// is one of these builders and keeps its state.
module.exports = (session) => {
  describe('custom query builder', () => {
    const knex = session.knex;
    const builders = [];

    class AppQueryBuilder extends QueryBuilder {
      constructor(...args) {
        super(...args);
        this.includeDeleted = false;
        this.hardDeletes = false;
        builders.push(this);
      }

      withDeleted() {
        this.includeDeleted = true;
        return this;
      }

      active() {
        return this.whereNull(`${this.tableRefFor(this.modelClass())}.deletedAt`);
      }

      named(name) {
        return this.where(`${this.tableRefFor(this.modelClass())}.name`, name);
      }

      // Soft deletes, unless `hardDelete()` was called.
      delete() {
        if (this.hardDeletes) {
          return super.delete();
        }

        return this.patch({ deletedAt: 'deleted' });
      }

      hardDelete() {
        this.hardDeletes = true;
        return this.delete();
      }
    }

    class BaseModel extends Model {
      static get QueryBuilder() {
        return AppQueryBuilder;
      }

      // Every find query of these models leaves out the soft-deleted rows.
      static query(...args) {
        return super.query(...args).onBuild((builder) => {
          if (builder.isFind() && !builder.includeDeleted) {
            builder.active();
          }
        });
      }

      static get modifiers() {
        return {
          active: (qb) => qb.active(),
          named: (qb, name) => qb.named(name),
        };
      }
    }

    class Owner extends BaseModel {
      static get tableName() {
        return 'cbOwners';
      }

      static get relationMappings() {
        return {
          pets: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            join: { from: 'cbOwners.id', to: 'cbPets.ownerId' },
          },
          tags: {
            relation: Model.ManyToManyRelation,
            modelClass: Tag,
            join: {
              from: 'cbOwners.id',
              through: { from: 'cbOwnerTags.ownerId', to: 'cbOwnerTags.tagId' },
              to: 'cbTags.id',
            },
          },
          // A relation filtered by a method of the custom builder.
          namedRex: {
            relation: Model.HasManyRelation,
            modelClass: Pet,
            modify: (qb) => qb.named('Rex'),
            join: { from: 'cbOwners.id', to: 'cbPets.ownerId' },
          },
        };
      }
    }

    class Pet extends BaseModel {
      static get tableName() {
        return 'cbPets';
      }

      static get relationMappings() {
        return {
          owner: {
            relation: Model.BelongsToOneRelation,
            modelClass: Owner,
            join: { from: 'cbPets.ownerId', to: 'cbOwners.id' },
          },
        };
      }
    }

    class Tag extends BaseModel {
      static get tableName() {
        return 'cbTags';
      }
    }

    const BoundOwner = Owner.bindKnex(knex);
    const BoundPet = Pet.bindKnex(knex);
    const TABLES = ['cbOwnerTags', 'cbPets', 'cbTags', 'cbOwners'];

    before(async () => {
      for (const table of TABLES) {
        await knex.schema.dropTableIfExists(table);
      }

      await knex.schema.createTable('cbOwners', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.string('deletedAt');
      });
      await knex.schema.createTable('cbPets', (table) => {
        table.increments('id').primary();
        table.integer('ownerId');
        table.string('name');
        table.string('deletedAt');
      });
      await knex.schema.createTable('cbTags', (table) => {
        table.increments('id').primary();
        table.string('name');
        table.string('deletedAt');
      });
      await knex.schema.createTable('cbOwnerTags', (table) => {
        table.integer('ownerId');
        table.integer('tagId');
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

      await knex('cbOwners').insert([
        { id: 1, name: 'Ann', deletedAt: null },
        { id: 2, name: 'Bob', deletedAt: 'deleted' },
      ]);
      await knex('cbPets').insert([
        { id: 1, ownerId: 1, name: 'Fido', deletedAt: null },
        { id: 2, ownerId: 1, name: 'Rex', deletedAt: null },
        { id: 3, ownerId: 1, name: 'Gone', deletedAt: 'deleted' },
        { id: 4, ownerId: 2, name: 'Tom', deletedAt: null },
      ]);
      await knex('cbTags').insert([
        { id: 1, name: 'red', deletedAt: null },
        { id: 2, name: 'old', deletedAt: 'deleted' },
      ]);
      await knex('cbOwnerTags').insert([
        { ownerId: 1, tagId: 1 },
        { ownerId: 1, tagId: 2 },
      ]);

      if (session.isPostgres()) {
        for (const table of ['cbOwners', 'cbPets', 'cbTags']) {
          await knex.raw(`select setval('"${table}_id_seq"', 100)`);
        }
      }

      builders.length = 0;
    });

    const names = (models) => models.map((it) => it.name);
    const rows = async (table) =>
      (await knex(table).orderBy('id')).map((it) => `${it.id}:${it.name}:${it.deletedAt}`);

    describe('the builders that objection creates', () => {
      it('should be custom builders for every kind of query', async () => {
        const owner = await BoundOwner.query().findById(1);

        expect(BoundOwner.query()).to.be.an(AppQueryBuilder);
        expect(owner.$query()).to.be.an(AppQueryBuilder);
        expect(owner.$relatedQuery('pets')).to.be.an(AppQueryBuilder);
        expect(BoundOwner.relatedQuery('pets')).to.be.an(AppQueryBuilder);

        builders.length = 0;
        await BoundOwner.query().withGraphFetched('[pets, tags]');

        expect(builders.every((it) => it instanceof AppQueryBuilder)).to.equal(true);
        expect(builders.length).to.be.greaterThan(2);
      });
    });

    describe('state kept on the builder instance', () => {
      it('should keep the state of withDeleted() when the query runs', async () => {
        const all = await BoundOwner.query().withDeleted().orderBy('id');
        const active = await BoundOwner.query().orderBy('id');

        expect(names(all)).to.eql(['Ann', 'Bob']);
        expect(names(active)).to.eql(['Ann']);
      });

      it('should keep the state in clones, pages, counts and streams', async () => {
        const query = BoundPet.query().withDeleted().orderBy('id');
        const streamed = [];

        for await (const pet of query.clone().stream()) {
          streamed.push(pet.name);
        }

        expect(names(await query.clone())).to.eql(['Fido', 'Rex', 'Gone', 'Tom']);
        expect((await query.clone().page(0, 2)).total).to.equal(4);
        expect(await query.clone().resultSize()).to.equal(4);
        expect(streamed).to.eql(['Fido', 'Rex', 'Gone', 'Tom']);
        expect(names((await query.clone().cursorPage(10)).results)).to.eql([
          'Fido',
          'Rex',
          'Gone',
          'Tom',
        ]);
      });

      it('should filter the soft-deleted rows in pages, counts and streams', async () => {
        const query = BoundPet.query().orderBy('id');
        const streamed = [];

        for await (const pet of query.clone().stream()) {
          streamed.push(pet.name);
        }

        expect((await query.clone().page(0, 2)).total).to.equal(3);
        expect(await query.clone().resultSize()).to.equal(3);
        expect(streamed).to.eql(['Fido', 'Rex', 'Tom']);
        expect(names((await query.clone().cursorPage(2)).results)).to.eql(['Fido', 'Rex']);
      });
    });

    describe('custom methods in modifiers and relations', () => {
      for (const method of ['withGraphFetched', 'withGraphJoined']) {
        it(`should filter the relations of ${method}()`, async () => {
          const owners = await BoundOwner.query()
            [method]('[pets(named), tags, namedRex]')
            .modifiers({ named: (qb) => qb.named('Fido') })
            .orderBy('cbOwners.id');

          expect(owners.map((it) => it.name)).to.eql(['Ann']);
          expect(names(owners[0].pets)).to.eql(['Fido']);
          expect(names(owners[0].tags)).to.eql(['red']);
          expect(names(owners[0].namedRex)).to.eql(['Rex']);
        });
      }

      it('should filter $relatedQuery() and joinRelated()', async () => {
        const owner = await BoundOwner.query().findById(1);
        const pets = await owner.$relatedQuery('pets').orderBy('id');
        const rex = await owner.$relatedQuery('namedRex');
        const joined = await BoundOwner.query()
          .joinRelated('pets(active)')
          .select('cbOwners.name', 'pets.name as petName')
          .orderBy('pets.id');

        expect(names(pets)).to.eql(['Fido', 'Rex']);
        expect(names(rex)).to.eql(['Rex']);
        // The owner Bob is soft-deleted, so his pet Tom isn't joined.
        expect(joined.map((it) => `${it.name}:${it.petName}`)).to.eql(['Ann:Fido', 'Ann:Rex']);
      });

      it('should filter static relatedQuery() subqueries with the onBuild() hook', async () => {
        // The hook of `query()` runs when the subquery is built, when its table
        // has the alias of the relation.
        const owners = await BoundOwner.query()
          .withDeleted()
          .select('cbOwners.name', BoundOwner.relatedQuery('pets').count().as('n'))
          .orderBy('cbOwners.id');

        expect(owners.map((it) => `${it.name}:${it.n}`)).to.eql(['Ann:2', 'Bob:1']);
      });

      it('should use custom methods in relatedQuery().for()', async () => {
        const pets = await BoundOwner.relatedQuery('pets').for(1).named('Rex');
        const all = await BoundOwner.relatedQuery('pets').for([1, 2]).withDeleted().orderBy('id');

        expect(names(pets)).to.eql(['Rex']);
        expect(names(all)).to.eql(['Fido', 'Rex', 'Gone', 'Tom']);
      });
    });

    describe('deletes through the custom delete()', () => {
      it('should soft delete by id, $query() and $relatedQuery()', async () => {
        await BoundPet.query().deleteById(1);
        const owner = await BoundOwner.query().findById(1);
        await owner.$relatedQuery('pets').delete().where('name', 'Rex');
        await owner.$relatedQuery('tags').delete();

        expect(await rows('cbPets')).to.eql([
          '1:Fido:deleted',
          '2:Rex:deleted',
          '3:Gone:deleted',
          '4:Tom:null',
        ]);
        expect(await rows('cbTags')).to.eql(['1:red:deleted', '2:old:deleted']);
      });

      it('should hard delete with hardDelete()', async () => {
        await BoundPet.query().where('name', 'Fido').hardDelete();

        expect(await rows('cbPets')).to.eql(['2:Rex:null', '3:Gone:deleted', '4:Tom:null']);
      });

      it('should soft delete the children that upsertGraph() leaves out', async () => {
        const owner = await BoundOwner.query().findById(1).withGraphFetched('pets');
        owner.pets = owner.pets.filter((it) => it.name !== 'Rex');
        owner.pets.push({ name: 'New' });

        await BoundOwner.query().upsertGraph(owner);

        expect(await rows('cbPets')).to.eql([
          '1:Fido:null',
          '2:Rex:deleted',
          '3:Gone:deleted',
          '4:Tom:null',
          `${session.isPostgres() ? 101 : 5}:New:null`,
        ]);
      });
    });

    describe('writes that fetch', () => {
      it('should fetch through the custom builder in insertAndFetch() and patchAndFetchById()', async () => {
        const inserted = await BoundPet.query().insertAndFetch({ ownerId: 1, name: 'Neo' });
        const patched = await BoundPet.query().patchAndFetchById(1, { name: 'Fidel' });

        expect(inserted.name).to.equal('Neo');
        expect(patched.name).to.equal('Fidel');
      });

      it('should run in a transaction with bound builders', async () => {
        await Model.transaction(knex, async (trx) => {
          const owner = await Owner.query(trx).findById(1);
          expect(owner.$query(trx)).to.be.an(AppQueryBuilder);
          await owner.$relatedQuery('pets', trx).delete().where('name', 'Fido');
        });

        expect(await rows('cbPets')).to.contain('1:Fido:deleted');
      });
    });
  });
};
