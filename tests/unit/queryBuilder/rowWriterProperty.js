const Knex = require('knex');
const fc = require('fast-check');
const expect = require('expect.js');
const { Model, snakeCaseMappers } = require('../../../');
const knexMocker = require('../../../testUtils/mockKnex');

// The rows of a query of two or more rows are written to the models by a
// writer cached per model class, and a single row through
// `fromDatabaseJson()`. For random rows, column names, mappers and JSON
// attributes, both give the same models.
//
// ROW_WRITER_RUNS sets the number of runs (200 by default) and
// ROW_WRITER_SEED the seed.
const SEED = Number(process.env.ROW_WRITER_SEED || 4242);
const RUNS = Number(process.env.ROW_WRITER_RUNS || 200);

describe('the row writer against fromDatabaseJson()', () => {
  let results;
  let mockKnex;

  before(() => {
    mockKnex = knexMocker(Knex({ client: 'pg' }), function (mock, oldImpl, args) {
      const promise = Promise.resolve(results.shift() || []);
      return promise.then.apply(promise, args);
    });
  });

  beforeEach(() => {
    results = [];
  });

  // Column names that map to the same property name with some mappers, like
  // `first_name` and `firstName`, and names with digits.
  const columnArb = fc.constantFrom(
    'id',
    'first_name',
    'firstName',
    'last_name',
    'address2',
    'address_2',
    'json_data',
    'jsonData',
    'Upper_Case',
    'x',
  );

  const valueArb = fc.oneof(
    fc.constant(null),
    fc.integer(),
    fc.string({ maxLength: 6 }),
    fc.constantFrom('{"a":1}', '[1,2]', 'not json', '"quoted"', '1', 'true', '{'),
    fc.dictionary(fc.constantFrom('a', 'b'), fc.integer(), { maxKeys: 2 }),
    fc.array(fc.integer(), { maxLength: 2 }),
    fc.date({ min: new Date(0), max: new Date(2e12), noInvalidDate: true }),
  );

  const mapperArb = fc.constantFrom(null, 'snake', 'snakeUpper', 'snakeDigits');

  const caseArb = fc
    .record({
      columns: fc.uniqueArray(columnArb, { minLength: 1, maxLength: 6 }),
      mapper: mapperArb,
      jsonProps: fc.subarray(['jsonData', 'json_data', 'firstName', 'x']),
      rowCount: fc.integer({ min: 2, max: 4 }),
    })
    .chain(({ columns, mapper, jsonProps, rowCount }) =>
      fc
        .array(fc.tuple(...columns.map(() => valueArb)), {
          minLength: rowCount,
          maxLength: rowCount,
        })
        .map((valueRows) => ({
          mapper,
          jsonProps,
          rows: valueRows.map((values) =>
            Object.fromEntries(columns.map((column, i) => [column, values[i]])),
          ),
        })),
    );

  function createModelClass(mapper, jsonProps) {
    class Item extends Model {
      static get tableName() {
        return 'items';
      }
    }

    if (mapper !== null) {
      Item.columnNameMappers = snakeCaseMappers({
        upperCase: mapper === 'snakeUpper',
        underscoreBeforeDigits: mapper === 'snakeDigits',
      });
    }

    Item.jsonAttributes = jsonProps;
    return Item;
  }

  // The own enumerable properties of a model, with the values as JSON would
  // give them and their types, since `eql()` treats `1` and `'1'` alike.
  const plain = (model) =>
    Object.fromEntries(
      Object.keys(model)
        .sort()
        .map((key) => {
          const value = model[key];
          const type =
            value instanceof Date ? 'date' : Array.isArray(value) ? 'array' : typeof value;
          return [key, [type, JSON.stringify(value)]];
        }),
    );

  it('should give the same models as fromDatabaseJson()', async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, async ({ mapper, jsonProps, rows }) => {
        const Item = createModelClass(mapper, jsonProps);
        // Copies, since the rows may be changed in place.
        const copies = rows.map((row) => structuredClone(row));

        results.push(rows);
        const written = await Item.query(mockKnex);
        const parsed = copies.map((row) => Item.fromDatabaseJson(row));

        expect(written.map(plain)).to.eql(parsed.map(plain));
        expect(written.every((it) => it instanceof Item)).to.equal(true);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});
