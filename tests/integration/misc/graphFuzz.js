const fc = require('fast-check');
const chai = require('chai');
const { Model } = require('../../../');

// Random graphs for insertGraph() and upsertGraph(), checked against the
// database. The models have a composite primary key, a nullable self
// reference, a has-many relation with a nullable composite foreign key and a
// many-to-many relation with an extra column.
//
// GRAPH_FUZZ_RUNS sets the number of graphs per property (50 by default, 20 on
// SQLite, whose writes are slower), and GRAPH_FUZZ_SEED the seed. A failure prints the seed and the smallest graph
// that fails, which reruns with the same seed reproduce.
const SEED = Number(process.env.GRAPH_FUZZ_SEED || 4242);
const TAG_IDS = [1, 2, 3, 4, 5];

module.exports = (session) => {
  describe('random graphs', function () {
    const knex = session.knex;
    const RUNS = Number(process.env.GRAPH_FUZZ_RUNS || (session.isSqlite() ? 20 : 50));
    // A graph takes up to about 100 ms on MySQL.
    this.timeout(Math.max(60000, RUNS * 500));
    let Owner;

    before(async () => {
      await dropTables(knex);

      await knex.schema
        .createTable('gfOwner', (table) => {
          table.integer('tenant');
          table.integer('id');
          table.string('name');
          table.integer('mentorTenant').nullable();
          table.integer('mentorId').nullable();
          table.primary(['tenant', 'id']);
        })
        .createTable('gfTag', (table) => {
          table.integer('id').primary();
          table.string('name');
        })
        .createTable('gfPet', (table) => {
          table.increments('id').primary();
          table.string('name');
          table.integer('ownerTenant').nullable();
          table.integer('ownerId').nullable();
          table.foreign(['ownerTenant', 'ownerId']).references(['tenant', 'id']).inTable('gfOwner');
        })
        .createTable('gfOwnerTag', (table) => {
          table.integer('ownerTenant');
          table.integer('ownerId');
          table.integer('tagId').references('gfTag.id');
          table.integer('note').nullable();
          table.primary(['ownerTenant', 'ownerId', 'tagId']);
          table.foreign(['ownerTenant', 'ownerId']).references(['tenant', 'id']).inTable('gfOwner');
        });

      class Tag extends Model {
        static tableName = 'gfTag';
      }

      class Pet extends Model {
        static tableName = 'gfPet';
      }

      Owner = class Owner extends Model {
        static tableName = 'gfOwner';
        static idColumn = ['tenant', 'id'];

        static get relationMappings() {
          return {
            mentor: {
              relation: Model.BelongsToOneRelation,
              modelClass: Owner,
              join: {
                from: ['gfOwner.mentorTenant', 'gfOwner.mentorId'],
                to: ['gfOwner.tenant', 'gfOwner.id'],
              },
            },
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: {
                from: ['gfOwner.tenant', 'gfOwner.id'],
                to: ['gfPet.ownerTenant', 'gfPet.ownerId'],
              },
            },
            tags: {
              relation: Model.ManyToManyRelation,
              modelClass: Tag,
              join: {
                from: ['gfOwner.tenant', 'gfOwner.id'],
                through: {
                  from: ['gfOwnerTag.ownerTenant', 'gfOwnerTag.ownerId'],
                  to: 'gfOwnerTag.tagId',
                  extra: ['note'],
                },
                to: 'gfTag.id',
              },
            },
          };
        }
      };
    });

    after(() => dropTables(knex));

    async function reset() {
      await knex('gfOwnerTag').delete();
      await knex('gfPet').delete();
      await knex('gfOwner').update({ mentorTenant: null, mentorId: null });
      await knex('gfOwner').delete();
      await knex('gfTag').delete();
      await knex('gfTag').insert(TAG_IDS.map((id) => ({ id, name: `tag ${id}` })));
    }

    // Every owner in the database, with its relations, in a form that compares
    // with the expected one.
    async function fetchState() {
      const owners = await Owner.query(knex)
        .withGraphFetched('[pets, tags]')
        .orderBy(['tenant', 'id']);

      return owners.map((owner) => ({
        tenant: owner.tenant,
        id: owner.id,
        name: owner.name,
        mentor: owner.mentorId === null ? null : [owner.mentorTenant, owner.mentorId],
        pets: owner.pets.map((pet) => pet.name).sort(),
        tags: owner.tags.map((tag) => ({ id: tag.id, note: tag.note })).sort((a, b) => a.id - b.id),
      }));
    }

    async function checkIntegrity() {
      chai.expect(await knex('gfTag').orderBy('id').pluck('id')).to.eql(TAG_IDS);
      // Every join row and pet belongs to an owner.
      const orphanJoins = await knex('gfOwnerTag')
        .leftJoin('gfOwner', function () {
          this.on('gfOwner.tenant', 'gfOwnerTag.ownerTenant').andOn(
            'gfOwner.id',
            'gfOwnerTag.ownerId',
          );
        })
        .whereNull('gfOwner.id');
      chai.expect(orphanJoins).to.eql([]);
      chai.expect(await knex('gfPet').whereNull('ownerId')).to.eql([]);
    }

    it('insertGraph() writes the graph it was given', () =>
      fc.assert(
        fc.asyncProperty(ownersArbitrary(), async (owners) => {
          await reset();
          await Owner.query(knex).insertGraph(toGraph(owners), {
            allowRefs: true,
            relate: ['tags'],
          });

          chai.expect(await fetchState()).to.eql(expectedState(owners));
          await checkIntegrity();
        }),
        { numRuns: RUNS, seed: SEED },
      ));

    it('upsertGraph() leaves exactly the edited graph and nothing else changes', () =>
      fc.assert(
        fc.asyncProperty(
          ownersArbitrary().chain((owners) =>
            fc.tuple(fc.constant(owners), editsArbitrary(owners)),
          ),
          async ([owners, edits]) => {
            await reset();
            await Owner.query(knex).insertGraph(toGraph(owners), {
              allowRefs: true,
              relate: ['tags'],
            });
            const before = await fetchState();

            const pets = await knex('gfPet').select('id', 'name', 'ownerTenant', 'ownerId');
            const graph = edits.map((edit) => toUpsert(edit, owners, pets));

            await Owner.query(knex).upsertGraph(graph, {
              relate: ['tags'],
              unrelate: ['tags'],
            });

            const expected = before.map((owner) => {
              const edit = edits.find((it) => it.index === indexOf(owners, owner));
              return edit ? applyEdit(owner, edit) : owner;
            });

            chai.expect(await fetchState()).to.eql(expected);
            await checkIntegrity();

            // The pets that were dropped are deleted, the others are kept.
            const keptPetIds = new Set(graph.flatMap((it) => it.pets.map((pet) => pet.id)));
            const editedOwners = new Set(edits.map((edit) => edit.index));

            for (const pet of pets) {
              const ownerIndex = owners.findIndex(
                (it) => it.tenant === pet.ownerTenant && it.id === pet.ownerId,
              );
              const exists = (await knex('gfPet').where('id', pet.id)).length === 1;
              const shouldExist = !editedOwners.has(ownerIndex) || keptPetIds.has(pet.id);
              chai.expect(exists, `pet ${pet.id} (${pet.name})`).to.equal(shouldExist);
            }
          },
        ),
        { numRuns: RUNS, seed: SEED },
      ));

    it('references between the graphs of related models resolve to the written model', () =>
      fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-z]{1,6}$/),
          fc.constantFrom(1, 2),
          fc.boolean(),
          async (name, tenant, referFromFirst) => {
            await reset();
            await Owner.query(knex).insert([
              { tenant, id: 1, name: 'root 1' },
              { tenant, id: 2, name: 'root 2' },
              { tenant, id: 3, name: 'mentor 3' },
              { tenant, id: 4, name: 'mentor 4' },
            ]);

            // Each root relates an existing owner as its mentor, with pets of
            // its own, so each mentor gets a recursive upsertGraph(). The new
            // pet of one mentor refers to the new pet of the other.
            const referenced = { tenant, id: 3, pets: [{ '#id': 'pet', name }] };
            const referring = { tenant, id: 4, pets: [{ name: 'copy of #ref{pet.name}' }] };
            const graph = [
              { tenant, id: 1, mentor: referFromFirst ? referring : referenced },
              { tenant, id: 2, mentor: referFromFirst ? referenced : referring },
            ];

            await Owner.query(knex).upsertGraph(graph, { relate: true, allowRefs: true });

            const pets = await knex('gfPet').orderBy('ownerId').select('name', 'ownerId');
            chai.expect(pets).to.eql([
              { name, ownerId: 3 },
              { name: `copy of ${name}`, ownerId: 4 },
            ]);

            const roots = await knex('gfOwner')
              .whereIn('id', [1, 2])
              .orderBy('id')
              .pluck('mentorId');
            chai.expect(roots).to.eql(referFromFirst ? [4, 3] : [3, 4]);
            await checkIntegrity();
          },
        ),
        { numRuns: RUNS, seed: SEED },
      ));
  });
};

function dropTables(knex) {
  return knex.schema
    .dropTableIfExists('gfOwnerTag')
    .dropTableIfExists('gfPet')
    .dropTableIfExists('gfTag')
    .dropTableIfExists('gfOwner');
}

// 1 to 4 owners. Owner `i` has the id `i + 1`, so the composite keys are
// unique whatever the tenants are, and may have an earlier owner as mentor.
function ownersArbitrary() {
  return fc
    .array(
      fc.record({
        tenant: fc.constantFrom(1, 2),
        name: fc.stringMatching(/^[a-z]{1,6}$/),
        pets: fc.array(fc.stringMatching(/^[a-z]{1,6}$/), { maxLength: 3 }),
        tags: fc.uniqueArray(
          fc.record({
            id: fc.constantFrom(...TAG_IDS),
            note: fc.option(fc.integer({ min: 0, max: 99 }), { nil: null }),
          }),
          { selector: (tag) => tag.id, maxLength: 3 },
        ),
        mentor: fc.option(fc.nat(), { nil: null }),
      }),
      { minLength: 1, maxLength: 4 },
    )
    .map((owners) =>
      owners.map((owner, index) => ({
        ...owner,
        id: index + 1,
        // Pet names are unique, so that the pets can be told apart.
        pets: owner.pets.map((name, i) => `${name}-${index}-${i}`),
        mentor: owner.mentor === null || index === 0 ? null : owner.mentor % index,
      })),
    );
}

// Edits of some of the owners: a new name, pets kept (some renamed), dropped
// and added, and a new set of tags with notes.
function editsArbitrary(owners) {
  return fc
    .uniqueArray(fc.nat({ max: owners.length - 1 }), { minLength: 1, maxLength: owners.length })
    .chain((indexes) =>
      fc.tuple(
        ...indexes.map((index) =>
          fc.record({
            index: fc.constant(index),
            name: fc.stringMatching(/^[a-z]{1,6}$/),
            keepPets: fc.subarray(owners[index].pets),
            renamePets: fc.boolean(),
            newPets: fc.array(fc.stringMatching(/^[a-z]{1,6}$/), { maxLength: 2 }),
            tags: fc.uniqueArray(
              fc.record({
                id: fc.constantFrom(...TAG_IDS),
                note: fc.option(fc.integer({ min: 0, max: 99 }), { nil: null }),
              }),
              { selector: (tag) => tag.id, maxLength: 3 },
            ),
          }),
        ),
      ),
    );
}

function toGraph(owners) {
  return owners.map((owner, index) => ({
    '#id': `owner${index}`,
    tenant: owner.tenant,
    id: owner.id,
    name: owner.name,
    pets: owner.pets.map((name) => ({ name })),
    tags: owner.tags.map((tag) => ({ id: tag.id, note: tag.note })),
    ...(owner.mentor === null ? {} : { mentor: { '#ref': `owner${owner.mentor}` } }),
  }));
}

function expectedState(owners) {
  return owners
    .map((owner) => ({
      tenant: owner.tenant,
      id: owner.id,
      name: owner.name,
      mentor: owner.mentor === null ? null : [owners[owner.mentor].tenant, owners[owner.mentor].id],
      pets: [...owner.pets].sort(),
      tags: [...owner.tags].sort((a, b) => a.id - b.id),
    }))
    .sort((a, b) => a.tenant - b.tenant || a.id - b.id);
}

function indexOf(owners, owner) {
  return owners.findIndex((it) => it.tenant === owner.tenant && it.id === owner.id);
}

function petName(edit, name) {
  return edit.renamePets ? `${name}+` : name;
}

function newPetNames(edit) {
  return edit.newPets.map((name, i) => `${name}-new-${edit.index}-${i}`);
}

function toUpsert(edit, owners, pets) {
  const owner = owners[edit.index];
  const ownerPets = pets.filter(
    (pet) => pet.ownerTenant === owner.tenant && pet.ownerId === owner.id,
  );

  return {
    tenant: owner.tenant,
    id: owner.id,
    name: edit.name,
    pets: [
      ...edit.keepPets.map((name) => ({
        id: ownerPets.find((pet) => pet.name === name).id,
        name: petName(edit, name),
      })),
      ...newPetNames(edit).map((name) => ({ name })),
    ],
    tags: edit.tags.map((tag) => ({ id: tag.id, note: tag.note })),
  };
}

function applyEdit(owner, edit) {
  return {
    ...owner,
    name: edit.name,
    pets: [...edit.keepPets.map((name) => petName(edit, name)), ...newPetNames(edit)].sort(),
    tags: [...edit.tags].sort((a, b) => a.id - b.id),
  };
}
