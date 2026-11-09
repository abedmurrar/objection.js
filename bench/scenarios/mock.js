'use strict';

// Scenarios that run against a mocked knex. They measure objection's own
// overhead: building queries, running them through the operation pipeline,
// and turning rows into models.

const {
  defineModels,
  createMockKnex,
  personRows,
  joinedRows,
  personGraph,
} = require('../fixtures');

function bind(objection, models, mockOptions) {
  const knex = createMockKnex(objection, mockOptions);

  for (const model of Object.values(models)) {
    model.knex(knex);
  }

  return knex;
}

module.exports = {
  // Building only: no execution.

  'build: where/orderBy/limit': async (objection) => {
    const { Person } = defineModels(objection);
    bind(objection, { Person });

    return () =>
      Person.query()
        .select('id', 'firstName', 'lastName')
        .where('age', '>', 20)
        .where('lastName', 'like', 'S%')
        .whereIn('id', [1, 2, 3, 4, 5])
        .orderBy('lastName')
        .limit(10)
        .offset(20)
        .toKnexQuery()
        .toSQL();
  },

  'build: expressions': async (objection) => {
    const { fn, ref, val } = objection;
    const { Person } = defineModels(objection);
    bind(objection, { Person });

    return () =>
      Person.query()
        .select(
          'id',
          val('person').as('type'),
          Person.ref('age').gte(18).and(Person.ref('active').eq(true)).as('adult'),
          fn.coalesce(ref('score'), 0).plus(1).as('score1'),
        )
        .where(Person.ref('age').between(18, 65))
        .orderBy(Person.ref('id').eq(5), 'desc')
        .toKnexQuery()
        .toSQL();
  },

  'build: $relatedQuery with orWhere': async (objection) => {
    const { Person, Pet } = defineModels(objection);
    bind(objection, { Person, Pet });
    const person = Person.fromJson({ id: 1, firstName: 'A' });

    return () =>
      person
        .$relatedQuery('pets')
        .where('species', 'dog')
        .orWhere('species', 'cat')
        .toKnexQuery()
        .toSQL();
  },

  'build: $relatedQuery delete': async (objection) => {
    const { Person, Pet } = defineModels(objection);
    bind(objection, { Person, Pet });
    const person = Person.fromJson({ id: 1, firstName: 'A' });

    return () =>
      person.$relatedQuery('pets').delete().where('species', 'dog').toKnexQuery().toSQL();
  },

  // Execution overhead of small queries.

  'execute: find 1 row': async (objection) => {
    const { Person } = defineModels(objection);
    bind(objection, { Person }, { personCount: 1 });

    return () => Person.query().where('age', '>', 20);
  },

  'execute: findById': async (objection) => {
    const { Person } = defineModels(objection);
    bind(objection, { Person }, { personCount: 1 });

    return () => Person.query().findById(1);
  },

  'execute: insert 1 row': async (objection) => {
    const { Person } = defineModels(objection);
    bind(objection, { Person });

    return () => Person.query().insert({ firstName: 'Jennifer', lastName: 'Aniston', age: 40 });
  },

  'execute: delete with where': async (objection) => {
    const { Person } = defineModels(objection);
    bind(objection, { Person });

    return () => Person.query().delete().where('age', '<', 20);
  },

  'execute: deleteById': async (objection) => {
    const { Person } = defineModels(objection);
    bind(objection, { Person });

    return () => Person.query().deleteById(1);
  },

  // Per-row work.

  'rows: find 1000 rows': async (objection) => {
    const { Person } = defineModels(objection);
    bind(objection, { Person }, { personCount: 1000 });

    return () => Person.query();
  },

  'rows: find 1000 rows (snakeCaseMappers)': async (objection) => {
    const { Person } = defineModels(objection, { snakeCase: true });
    const rows = personRows(1000, true);
    // A copy per query, as a driver returns new objects every time.
    bind(objection, { Person }, { rows: () => rows.map((row) => ({ ...row })) });

    return () => Person.query();
  },

  'rows: toJSON 1000 models': async (objection) => {
    const { Person } = defineModels(objection);
    const people = personRows(1000).map((row) => Person.fromDatabaseJson(row));

    return () => people.map((person) => person.toJSON());
  },

  // JSON attributes that hold values other than plain objects, arrays and
  // dates take the slower clone path.
  'rows: toJSON 1000 models (class instance, Map and Set attributes)': async (objection) => {
    const { Person } = defineModels(objection);

    class Point {
      constructor(x, y) {
        this.x = x;
        this.y = y;
      }
    }

    const people = personRows(1000).map((row) => {
      const person = Person.fromDatabaseJson(row);
      person.settings.location = new Point(row.id, row.id * 2);
      person.settings.visits = new Map([['home', { count: row.id }]]);
      person.settings.labels = new Set(['a', 'b']);
      return person;
    });

    return () => people.map((person) => person.toJSON());
  },

  // Eager loading.

  'graph: withGraphFetched [pets.toys, movies] x100': async (objection) => {
    const models = defineModels(objection);
    bind(objection, models, { personCount: 100 });

    return () => models.Person.query().withGraphFetched('[pets.toys, movies]');
  },

  // Eager loading runs the queries of sibling relations and batches
  // concurrently, which only shows when the queries take time.
  'graph: withGraphFetched [pets.toys, movies] on MySQL, 1 ms per query': async (objection) => {
    const models = defineModels(objection);
    bind(objection, models, { personCount: 100, client: 'mysql2', latencyMs: 1 });

    return () => models.Person.query().withGraphFetched('[pets.toys, movies]');
  },

  'graph: withGraphJoined [pets.toys] x100': async (objection) => {
    const models = defineModels(objection);
    const rows = joinedRows(100);
    bind(objection, models, { rows: () => rows.map((row) => ({ ...row })) });

    // Fetches and caches the column info.
    await models.Person.query().withGraphJoined('pets.toys');

    return () => models.Person.query().withGraphJoined('pets.toys');
  },

  // Writes.

  'write: batch insert 100 rows': async (objection) => {
    const { Person } = defineModels(objection);
    bind(objection, { Person });
    const rows = personRows(100).map(({ id, address, settings, ...rest }) => rest);

    return () => Person.query().insert(rows);
  },

  'write: insertGraph 50 persons with pets (validated)': async (objection) => {
    const models = defineModels(objection, { schema: true });
    bind(objection, models);
    const graph = personGraph(50);

    return () => models.Person.query().insertGraph(graph);
  },

  'write: upsertGraph 20 persons with pets': async (objection) => {
    const models = defineModels(objection);
    bind(objection, models, { personCount: 20 });

    const graph = [];

    for (let i = 1; i <= 20; ++i) {
      graph.push({
        id: i,
        firstName: `Changed${i}`,
        pets: [{ id: (i - 1) * 3 + 1, name: 'Renamed' }, { name: 'New pet' }],
      });
    }

    return () => models.Person.query().upsertGraph(graph);
  },

  // Graph writes run their queries concurrently, which only shows when the
  // queries take time.
  'write: upsertGraph 20 persons with pets on MySQL, 1 ms per query': async (objection) => {
    const models = defineModels(objection);
    bind(objection, models, { personCount: 20, client: 'mysql2', latencyMs: 1 });

    const graph = [];

    for (let i = 1; i <= 20; ++i) {
      graph.push({
        id: i,
        firstName: `Changed${i}`,
        pets: [{ id: (i - 1) * 3 + 1, name: 'Renamed' }, { name: 'New pet' }],
      });
    }

    return () => models.Person.query().upsertGraph(graph);
  },

  // Validation.

  'validate: 1000 models with defaults': async (objection) => {
    const { Person } = defineModels(objection, { schema: true });
    const inputs = personRows(1000).map(
      ({ address, settings, momId, createdAt, updatedAt, score, ...rest }) => rest,
    );

    return () => inputs.map((json) => Person.fromJson(json));
  },

  // A new bound class per transaction, as `Model.transaction()` does.

  'transaction: bindKnex + validated insert': async (objection) => {
    const { Person } = defineModels(objection, { schema: true });
    const knex = createMockKnex(objection);

    return () => {
      // A stand-in for a transaction: a new knex object without objection's
      // cache of bound classes.
      const trx = function (...args) {
        return knex(...args);
      };

      Object.setPrototypeOf(trx, knex);
      Object.defineProperty(trx, '$$objection', { value: undefined, configurable: true });

      return Person.bindKnex(trx).query().insert({ firstName: 'Jennifer', age: 40 });
    };
  },
};
