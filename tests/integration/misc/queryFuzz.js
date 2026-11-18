const fc = require('fast-check');
const expect = require('expect.js');
const { Model } = require('../../../');

// Random queries checked against what the data says, computed here and not by
// objection:
//
// - Walking every page of cursorPage() with random sort columns, directions
//   and page sizes gives every row once, in the order of the full query.
// - The where clauses a user adds to a relation query, with any mix of where,
//   orWhere and whereNot, only filter the rows of that relation: an orWhere
//   never returns the rows of another owner.
//
// QUERY_FUZZ_RUNS sets the number of runs per property (30 by default), and
// QUERY_FUZZ_SEED the seed. A failure prints the seed and the smallest case.
const SEED = Number(process.env.QUERY_FUZZ_SEED || 4242);
const RUNS = Number(process.env.QUERY_FUZZ_RUNS || 30);

module.exports = (session) => {
  describe('random queries', function () {
    const knex = session.knex;
    this.timeout(120000);

    describe('cursorPage()', () => {
      class Row extends Model {
        static get tableName() {
          return 'fzRows';
        }
      }

      const BoundRow = Row.bindKnex(knex);
      const hasMicroseconds = session.isPostgres() || session.isMySql();

      before(async () => {
        await knex.schema.dropTableIfExists('fzRows');
        await knex.schema.createTable('fzRows', (table) => {
          table.increments('id').primary();
          table.integer('a').notNullable();
          table.string('b', 8).notNullable();
          table.datetime('c', { precision: 6 }).notNullable();
        });
      });

      after(() => knex.schema.dropTableIfExists('fzRows'));

      const rowArb = fc.record({
        a: fc.integer({ min: 0, max: 3 }),
        b: fc.constantFrom('x', 'y', 'z'),
        // Microseconds within two milliseconds, so that many rows tie at the
        // millisecond.
        c: fc.integer({ min: 0, max: 1999 }),
      });

      const orderArb = fc.uniqueArray(
        fc.record({ column: fc.constantFrom('a', 'b', 'c'), desc: fc.boolean() }),
        { minLength: 0, maxLength: 3, selector: (it) => it.column },
      );

      const timestamp = (micros) => {
        const ms = String(Math.floor(micros / 1000)).padStart(3, '0');
        const rest = String(micros % 1000).padStart(3, '0');
        return hasMicroseconds ? `2026-01-01 00:00:00.${ms}${rest}` : `2026-01-01 00:00:00.${ms}`;
      };

      it('should page through every row once, in order', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.array(rowArb, { maxLength: 25 }),
            orderArb,
            fc.integer({ min: 1, max: 7 }),
            async (rows, order, limit) => {
              await knex('fzRows').delete();

              if (rows.length > 0) {
                await knex('fzRows').insert(rows.map((it) => ({ ...it, c: timestamp(it.c) })));
              }

              const build = () => {
                let qb = BoundRow.query();

                for (const { column, desc } of order) {
                  qb = qb.orderBy(column, desc ? 'desc' : 'asc');
                }

                return qb;
              };

              const full = (await build().orderBy('id')).map((it) => it.id);
              const seen = [];
              let after = null;
              let pages = 0;

              do {
                const page = await build().cursorPage(limit, after);
                seen.push(...page.results.map((it) => it.id));
                after = page.next;
                pages++;

                if (pages > rows.length + 2) {
                  throw new Error('cursorPage() did not end');
                }
              } while (after !== null);

              expect(seen).to.eql(full);
            },
          ),
          { numRuns: RUNS, seed: SEED },
        );
      });
    });

    describe('where clauses of relation queries', () => {
      class Owner extends Model {
        static get tableName() {
          return 'fzOwners';
        }

        static get relationMappings() {
          return {
            pets: {
              relation: Model.HasManyRelation,
              modelClass: Pet,
              join: { from: 'fzOwners.id', to: 'fzPets.ownerId' },
            },
            friends: {
              relation: Model.ManyToManyRelation,
              modelClass: Pet,
              join: {
                from: 'fzOwners.id',
                through: { from: 'fzFriends.ownerId', to: 'fzFriends.petId' },
                to: 'fzPets.id',
              },
            },
          };
        }
      }

      class Pet extends Model {
        static get tableName() {
          return 'fzPets';
        }
      }

      const BoundOwner = Owner.bindKnex(knex);

      before(async () => {
        for (const table of ['fzFriends', 'fzPets', 'fzOwners']) {
          await knex.schema.dropTableIfExists(table);
        }

        await knex.schema.createTable('fzOwners', (table) => {
          table.integer('id').primary();
        });
        await knex.schema.createTable('fzPets', (table) => {
          table.integer('id').primary();
          table.integer('ownerId').notNullable();
          table.string('name', 4).notNullable();
          table.integer('n').notNullable();
        });
        await knex.schema.createTable('fzFriends', (table) => {
          table.integer('ownerId').notNullable();
          table.integer('petId').notNullable();
        });

        // Three owners with 12 pets between them, every pet a friend of the
        // owners whose id differs from its owner's.
        const pets = [];

        for (let id = 1; id <= 12; ++id) {
          pets.push({ id, ownerId: (id % 3) + 1, name: 'abc'[id % 3], n: id % 5 });
        }

        await knex('fzOwners').insert([{ id: 1 }, { id: 2 }, { id: 3 }]);
        await knex('fzPets').insert(pets);
        await knex('fzFriends').insert(
          pets.flatMap((pet) =>
            [1, 2, 3]
              .filter((it) => it !== pet.ownerId)
              .map((ownerId) => ({ ownerId, petId: pet.id })),
          ),
        );

        PETS.push(...pets);
      });

      after(async () => {
        for (const table of ['fzFriends', 'fzPets', 'fzOwners']) {
          await knex.schema.dropTableIfExists(table);
        }
      });

      const PETS = [];

      // A condition on a pet, or `and`, `or` and `not` of conditions.
      const conditionArb = fc.letrec((tie) => ({
        node: fc.oneof(
          { depthSize: 'small', withCrossShrink: true },
          tie('compare'),
          tie('and'),
          tie('or'),
          tie('not'),
        ),
        compare: fc.oneof(
          fc.record({
            kind: fc.constant('compare'),
            column: fc.constant('n'),
            op: fc.constantFrom('=', '<', '>', '<>'),
            value: fc.integer({ min: 0, max: 4 }),
          }),
          fc.record({
            kind: fc.constant('compare'),
            column: fc.constant('name'),
            op: fc.constantFrom('=', '<>'),
            value: fc.constantFrom('a', 'b', 'c'),
          }),
        ),
        and: fc.record({
          kind: fc.constant('and'),
          children: fc.array(tie('node'), { minLength: 1, maxLength: 3 }),
        }),
        or: fc.record({
          kind: fc.constant('or'),
          children: fc.array(tie('node'), { minLength: 1, maxLength: 3 }),
        }),
        not: fc.record({ kind: fc.constant('not'), child: tie('node') }),
      })).node;

      // What a user writes on the relation query: conditions joined with where
      // or orWhere, without a group around them.
      const userFilterArb = fc.array(
        fc.record({ method: fc.constantFrom('where', 'orWhere'), condition: conditionArb }),
        { minLength: 1, maxLength: 4 },
      );

      function apply(qb, method, node, column) {
        if (node.kind === 'compare') {
          qb[method](column(node.column), node.op, node.value);
        } else if (node.kind === 'and') {
          qb[method]((sub) => node.children.forEach((it) => apply(sub, 'where', it, column)));
        } else if (node.kind === 'or') {
          qb[method]((sub) => node.children.forEach((it) => apply(sub, 'orWhere', it, column)));
        } else {
          qb[method === 'where' ? 'whereNot' : 'orWhereNot']((sub) =>
            apply(sub, 'where', node.child, column),
          );
        }
      }

      function evaluate(pet, node) {
        if (node.kind === 'compare') {
          const value = pet[node.column];
          return {
            '=': value === node.value,
            '<>': value !== node.value,
            '<': value < node.value,
            '>': value > node.value,
          }[node.op];
        } else if (node.kind === 'and') {
          return node.children.every((it) => evaluate(pet, it));
        } else if (node.kind === 'or') {
          return node.children.some((it) => evaluate(pet, it));
        } else {
          return !evaluate(pet, node.child);
        }
      }

      // SQL's precedence: `a or b and c` is `a or (b and c)`.
      function evaluateFilter(pet, filter) {
        const groups = [[]];

        for (const { method, condition } of filter) {
          if (method === 'orWhere' && groups[groups.length - 1].length > 0) {
            groups.push([]);
          }

          groups[groups.length - 1].push(condition);
        }

        return groups.some((group) => group.every((it) => evaluate(pet, it)));
      }

      const applyFilter = (qb, filter, column) => {
        for (const { method, condition } of filter) {
          apply(qb, method, condition, column);
        }

        return qb;
      };

      const sortedIds = (models) => models.map((it) => it.id).sort((a, b) => a - b);

      const expectedPets = (ownerId, relation, filter) =>
        PETS.filter((pet) =>
          relation === 'pets' ? pet.ownerId === ownerId : pet.ownerId !== ownerId,
        )
          .filter((pet) => evaluateFilter(pet, filter))
          .map((it) => it.id)
          .sort((a, b) => a - b);

      for (const relation of ['pets', 'friends']) {
        it(`should only filter the rows of the relation ${relation}`, async () => {
          const owners = await BoundOwner.query().orderBy('id');

          await fc.assert(
            fc.asyncProperty(
              fc.integer({ min: 0, max: 2 }),
              userFilterArb,
              async (ownerIndex, filter) => {
                const owner = owners[ownerIndex];
                const want = expectedPets(owner.id, relation, filter);
                const qualified = (column) => `fzPets.${column}`;

                const related = await applyFilter(owner.$relatedQuery(relation), filter, qualified);
                const forQuery = await applyFilter(
                  BoundOwner.relatedQuery(relation).for(owner.id),
                  filter,
                  qualified,
                );
                const [fetched] = await BoundOwner.query()
                  .findByIds([owner.id])
                  .withGraphFetched(`${relation}(filter)`)
                  .modifiers({ filter: (qb) => applyFilter(qb, filter, qualified) });

                expect(sortedIds(related)).to.eql(want);
                expect(sortedIds(forQuery)).to.eql(want);
                expect(sortedIds(fetched[relation])).to.eql(want);
              },
            ),
            { numRuns: RUNS, seed: SEED },
          );
        });
      }
    });
  });
};
