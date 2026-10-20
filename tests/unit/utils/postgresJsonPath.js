const expect = require('expect.js');
const Knex = require('knex');
const { Model, ref } = require('../../../');
const {
  toPgTextArray,
  toPgStringLiteral,
  toPgJsonPathLiteral,
  toPgQuotedColumn,
} = require('../../../lib/utils/postgresJsonPath');

const PAYLOADS = [
  "x') or 1=1 --",
  "x'}'; drop table foo; --",
  'a?b',
  '??',
  '\\?',
  'a\\b',
  'a"b',
  'a,b',
  '{}',
  'a b',
  'NULL',
  'a\nb',
];

// Removes all string literals (both '...' and E'...') from the sql.
function stripStringLiterals(sql) {
  return sql.replace(/E?'(?:[^']|'')*'/g, "''");
}

function keyExpr(column, key) {
  return key.includes('"') ? `${column}:['${key}']` : `${column}:["${key}"]`;
}

describe('postgresJsonPath', () => {
  describe('toPgTextArray', () => {
    it('should not quote plain keys and array indexes', () => {
      expect(
        toPgTextArray([
          { type: 'object', ref: 'a' },
          { type: 'array', ref: 1 },
          { type: 'object', ref: 'b_c' },
        ]),
      ).to.equal('{a,1,b_c}');
    });

    it('should quote and escape keys with special characters', () => {
      const access = (ref) => [{ type: 'object', ref }];

      expect(toPgTextArray(access('a,b'))).to.equal('{"a,b"}');
      expect(toPgTextArray(access('{}'))).to.equal('{"{}"}');
      expect(toPgTextArray(access('a b'))).to.equal('{"a b"}');
      expect(toPgTextArray(access('a"b'))).to.equal('{"a\\"b"}');
      expect(toPgTextArray(access('a\\b'))).to.equal('{"a\\\\b"}');
      expect(toPgTextArray(access('NULL'))).to.equal('{"NULL"}');
      expect(toPgTextArray(access('null'))).to.equal('{"null"}');
      expect(toPgTextArray(access(''))).to.equal('{""}');
      expect(toPgTextArray(access('1'))).to.equal('{1}');
    });
  });

  describe('toPgStringLiteral', () => {
    it('should create plain literals', () => {
      expect(toPgStringLiteral('{a,b}')).to.equal("'{a,b}'");
    });

    it('should double single quotes', () => {
      expect(toPgStringLiteral("a'b")).to.equal("'a''b'");
    });

    it('should escape binding placeholders', () => {
      expect(toPgStringLiteral('a?b??')).to.equal("'a\\?b\\?\\?'");
    });

    it('should use escape strings with octal escapes for backslashes and control characters', () => {
      expect(toPgStringLiteral('a\\b')).to.equal("E'a\\134b'");
      expect(toPgStringLiteral('a\nb')).to.equal("E'a\\012b'");
      expect(toPgStringLiteral('\\?')).to.equal("E'\\134\\?'");
    });
  });

  describe('toPgQuotedColumn', () => {
    it('should quote and escape column parts', () => {
      expect(toPgQuotedColumn('Table.column')).to.equal('"Table"."column"');
      expect(toPgQuotedColumn('we"ird')).to.equal('"we""ird"');
      expect(toPgQuotedColumn('a?b')).to.equal('"a\\?b"');
    });
  });

  describe('queries', () => {
    let pg;
    let mysql;
    let TestModel;

    before(() => {
      pg = Knex({ client: 'pg' });
      mysql = Knex({ client: 'mysql' });
    });

    beforeEach(() => {
      TestModel = class TestModel extends Model {
        static get tableName() {
          return 'Model';
        }
      };
    });

    function queries(key) {
      const expr = keyExpr('data', key);

      return {
        'where(ref)': (qb) => qb.where(ref(expr), 1),
        'where(ref.castText())': (qb) => qb.where(ref(expr).castText(), 'x'),
        'whereIn(ref.castInt())': (qb) => qb.whereIn(ref(expr).castInt(), [1, 2]),
        'select(ref.as())': (qb) => qb.select(ref(expr).as('v')),
        'orderBy(ref)': (qb) => qb.orderBy(ref(expr)),
        whereJsonSupersetOf: (qb) => qb.whereJsonSupersetOf(expr, { a: 1 }),
        'whereJsonSupersetOf(ref, ref)': (qb) => qb.whereJsonSupersetOf(expr, expr),
        whereJsonSubsetOf: (qb) => qb.whereJsonSubsetOf('data', { a: 1 }),
        whereJsonIsArray: (qb) => qb.whereJsonIsArray(expr),
        whereJsonIsObject: (qb) => qb.whereJsonIsObject(expr),
        whereJsonNotArray: (qb) => qb.whereJsonNotArray(expr),
        whereJsonNotObject: (qb) => qb.whereJsonNotObject(expr),
        whereJsonHasAny: (qb) => qb.whereJsonHasAny(expr, [key, 'a?b']),
        whereJsonHasAll: (qb) => qb.whereJsonHasAll(expr, [key, "o'k"]),
        patch: (qb) => qb.patch({ [expr]: 1 }),
        'patch(ref)': (qb) => qb.patch({ [expr]: ref(expr) }),
        'onConflict().merge()': (qb) =>
          qb
            .insert({ id: 1 })
            .onConflict('id')
            .merge({ [expr]: 1 }),
      };
    }

    PAYLOADS.forEach((key) => {
      describe(JSON.stringify(key), () => {
        Object.entries(queries(key)).forEach(([name, build]) => {
          it(name, () => {
            const knexQuery = build(TestModel.query(pg)).toKnexQuery();
            const native = knexQuery.toSQL().toNative();
            const placeholders = native.sql.match(/\$\d+/g) || [];

            expect(placeholders).to.have.length(native.bindings.length);
            expect(() => knexQuery.toString()).to.not.throwException();
            // The key must never appear outside of string literals.
            const needle = key.replace(/[?\\\s]/g, '');

            // `NULL` is skipped since `is NULL` is a valid part of some queries.
            if (needle.length > 1 && needle !== 'NULL') {
              expect(stripStringLiterals(native.sql)).to.not.contain(needle);
            }
          });
        });
      });
    });

    it('should generate the same sql as before for plain keys', () => {
      expect(
        TestModel.query(pg).where(ref('data:a.b[1]').castText(), 'x').toKnexQuery().toString(),
      ).to.equal(`select "Model".* from "Model" where CAST("data"#>>'{a,b,1}' AS text) = 'x'`);

      expect(TestModel.query(pg).patch({ 'data:a.b': 1 }).toKnexQuery().toString()).to.equal(
        `update "Model" set "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{a,b}', '1', true)`,
      );

      expect(
        TestModel.query(pg).whereJsonSupersetOf('Model.data:a', { a: 1 }).toKnexQuery().toString(),
      ).to.equal(
        `select "Model".* from "Model" where ( "Model"."data"#>'{a}' )::jsonb @> '{"a":1}'::jsonb`,
      );

      expect(
        TestModel.query(pg).whereJsonHasAny('data:a', ['b', 'c']).toKnexQuery().toString(),
      ).to.equal(`select "Model".* from "Model" where "data"#>'{a}' ?| array['b','c']`);
    });

    it('should escape special characters', () => {
      const native = TestModel.query(pg)
        .where(ref(`data:["x') or 1=1 --"]`), 1)
        .toKnexQuery()
        .toSQL()
        .toNative();

      expect(native.sql).to.equal(
        `select "Model".* from "Model" where "data"#>'{"x'') or 1=1 --"}' = $1`,
      );
      expect(native.bindings).to.eql([1]);

      expect(TestModel.query(pg).patch({ 'data:a?b': 1 }).toKnexQuery().toSQL().toNative()).to.eql({
        sql: `update "Model" set "data" = jsonb_set(COALESCE("data", '{}'::jsonb), '{a?b}', $1, true)`,
        bindings: ['1'],
      });

      expect(TestModel.query(pg).whereJsonIsArray('we"ird:a').toKnexQuery().toString()).to.contain(
        `"we""ird"#>'{a}'`,
      );
    });

    it('should throw for field expressions on other databases', () => {
      const sqlite = Knex({ client: 'sqlite3', useNullAsDefault: true });

      expect(() => TestModel.query(sqlite).where(ref('data:a'), 1).toKnexQuery()).to.throwException(
        /only supported on postgres and mysql/,
      );
      expect(() => TestModel.query(sqlite).patch({ 'data:a': 1 }).toKnexQuery()).to.throwException(
        /only supported on postgres and mysql/,
      );
      expect(() => TestModel.query(mysql).whereJsonIsArray('data').toKnexQuery()).to.throwException(
        /only supported on postgres/,
      );
    });

    it('should allow plain refs on other databases', () => {
      expect(TestModel.query(mysql).where(ref('data'), 1).toKnexQuery().toString()).to.equal(
        'select `Model`.* from `Model` where `data` = 1',
      );
    });

    it('andWhereJsonNotSupersetOf should not recurse infinitely', () => {
      expect(
        TestModel.query(pg).andWhereJsonNotSupersetOf('data', { a: 1 }).toKnexQuery().toString(),
      ).to.equal(
        `select "Model".* from "Model" where not ( "data"#>'{}' )::jsonb @> '{"a":1}'::jsonb`,
      );
    });
  });
});
