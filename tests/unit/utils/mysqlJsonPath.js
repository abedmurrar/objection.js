const expect = require('expect.js');
const Knex = require('knex');
const { Model, ref, raw } = require('../../../');
const { toMySqlJsonPath } = require('../../../lib/utils/mysqlJsonPath');

const PAYLOADS = [
  "x') or 1=1 --",
  "x'}'; drop table foo; --",
  'a?b',
  '??',
  '\\?',
  'a\\b',
  'a"b',
  'a,b',
  'a.b',
  '$',
  '[0]',
  'a b',
  'a\nb',
];

// Removes all string literals from MySQL sql.
function stripStringLiterals(sql) {
  return sql.replace(/'(?:[^'\\]|\\.|'')*'/g, "''");
}

function keyExpr(column, key) {
  return key.includes('"') ? `${column}:['${key}']` : `${column}:["${key}"]`;
}

describe('mysqlJsonPath', () => {
  describe('toMySqlJsonPath', () => {
    it('should quote keys and not array indexes', () => {
      expect(
        toMySqlJsonPath([
          { type: 'object', ref: 'a' },
          { type: 'array', ref: 1 },
          { type: 'object', ref: 'b.c' },
          { type: 'object', ref: 'd"e\\f' },
          { type: 'object', ref: '1' },
        ]),
      ).to.equal('$."a"[1]."b.c"."d\\"e\\\\f"."1"');
    });

    it('should return the whole document for an empty path', () => {
      expect(toMySqlJsonPath([])).to.equal('$');
    });
  });

  describe('queries', () => {
    let mysql;
    let TestModel;

    before(() => {
      mysql = Knex({ client: 'mysql2' });
    });

    beforeEach(() => {
      TestModel = class TestModel extends Model {
        static get tableName() {
          return 'Model';
        }
      };
    });

    function sql(builder) {
      return builder.toKnexQuery().toString();
    }

    it('ref() should use JSON_EXTRACT', () => {
      expect(sql(TestModel.query(mysql).where(ref('Model.data:a.b[1]'), 1))).to.equal(
        'select `Model`.* from `Model` where JSON_EXTRACT(`Model`.`data`, \'$.\\"a\\".\\"b\\"[1]\') = 1',
      );
    });

    it('casts should unquote the value', () => {
      expect(sql(TestModel.query(mysql).where(ref('data:a').castText(), 'x'))).to.equal(
        "select `Model`.* from `Model` where JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.\\\"a\\\"')) = 'x'",
      );

      expect(sql(TestModel.query(mysql).whereIn(ref('data:a').castInt(), [1, 2]))).to.equal(
        'select `Model`.* from `Model` where CAST(JSON_UNQUOTE(JSON_EXTRACT(`data`, \'$.\\"a\\"\')) AS SIGNED) in (1, 2)',
      );

      expect(sql(TestModel.query(mysql).where(ref('data:a').castBool(), true))).to.equal(
        "select `Model`.* from `Model` where (JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.\\\"a\\\"')) IN ('true', '1')) = true",
      );

      expect(sql(TestModel.query(mysql).select(ref('data:a').castDecimal().as('a')))).to.equal(
        'select CAST(JSON_UNQUOTE(JSON_EXTRACT(`data`, \'$.\\"a\\"\')) AS DECIMAL(65,30)) as `a` from `Model`',
      );
    });

    it('casts of plain columns should use MySQL types', () => {
      const casts = {
        castText: 'CAST(`a` AS CHAR)',
        castInt: 'CAST(`a` AS SIGNED)',
        castBigInt: 'CAST(`a` AS SIGNED)',
        castFloat: 'CAST(`a` AS FLOAT)',
        castReal: 'CAST(`a` AS DOUBLE)',
        castDecimal: 'CAST(`a` AS DECIMAL(65,30))',
        castBool: '(`a` <> 0)',
        castJson: 'CAST(`a` AS JSON)',
      };

      for (const [cast, expected] of Object.entries(casts)) {
        expect(sql(TestModel.query(mysql).select(ref('a')[cast]()))).to.equal(
          `select ${expected} from \`Model\``,
        );
      }

      expect(sql(TestModel.query(mysql).select(ref('a').castTo('DATETIME')))).to.equal(
        'select CAST(`a` AS DATETIME) from `Model`',
      );
    });

    it('patch() should use JSON_SET', () => {
      expect(
        TestModel.query(mysql)
          .patch({ 'data:a.b': 1, 'data:c': 'x', 'other:[0]': { d: [1] } })
          .toKnexQuery()
          .toSQL()
          .toNative(),
      ).to.eql({
        sql:
          'update `Model` set `data` = JSON_SET(JSON_SET(COALESCE(`data`, JSON_OBJECT()), ?, CAST(? AS JSON)), ?, CAST(? AS JSON)), ' +
          '`other` = JSON_SET(COALESCE(`other`, JSON_ARRAY()), ?, CAST(? AS JSON))',
        bindings: ['$."a"."b"', '1', '$."c"', '"x"', '$[0]', '{"d":[1]}'],
      });
    });

    it('patch() should accept refs and raw values', () => {
      expect(
        TestModel.query(mysql)
          .patch({ 'data:a': ref('other:b'), 'data:c': raw('NOW()') })
          .toKnexQuery()
          .toSQL()
          .toNative(),
      ).to.eql({
        sql: 'update `Model` set `data` = JSON_SET(JSON_SET(COALESCE(`data`, JSON_OBJECT()), ?, JSON_EXTRACT(`other`, ?)), ?, NOW())',
        bindings: ['$."a"', '$."b"', '$."c"'],
      });
    });

    it('onConflict().merge() should use JSON_SET', () => {
      expect(
        sql(TestModel.query(mysql).insert({ id: 1 }).onConflict('id').merge({ 'data:a': 1 })),
      ).to.equal(
        "insert into `Model` (`id`) values (1) on duplicate key update `data` = JSON_SET(COALESCE(`data`, JSON_OBJECT()), '$.\\\"a\\\"', CAST('1' AS JSON))",
      );
    });

    it('whereJson* methods should use MySQL functions', () => {
      expect(sql(TestModel.query(mysql).whereJsonSupersetOf('Model.data:a', { b: 1 }))).to.equal(
        "select `Model`.* from `Model` where (JSON_CONTAINS(JSON_EXTRACT(`Model`.`data`, '$.\\\"a\\\"'), CAST('{\\\"b\\\":1}' AS JSON)) AND JSON_TYPE(JSON_EXTRACT(`Model`.`data`, '$.\\\"a\\\"')) = 'OBJECT')",
      );

      expect(sql(TestModel.query(mysql).whereJsonNotSubsetOf('data', [1]))).to.equal(
        "select `Model`.* from `Model` where NOT (JSON_CONTAINS(CAST('[1]' AS JSON), `data`) AND JSON_TYPE(`data`) <> 'OBJECT')",
      );

      expect(
        sql(TestModel.query(mysql).whereJsonIsArray('data').orWhereJsonNotArray('other')),
      ).to.equal(
        "select `Model`.* from `Model` where JSON_CONTAINS(`data`, CAST('[]' AS JSON)) or (NOT JSON_CONTAINS(`other`, CAST('[]' AS JSON)) OR `other` IS NULL)",
      );

      expect(sql(TestModel.query(mysql).whereJsonHasAny('data', []))).to.equal(
        'select `Model`.* from `Model` where FALSE',
      );

      expect(sql(TestModel.query(mysql).whereJsonHasAll('data', []))).to.equal(
        'select `Model`.* from `Model` where `data` IS NOT NULL',
      );

      expect(
        sql(
          TestModel.query(mysql)
            .whereJsonOverlaps('data:a', [1])
            .orWhereJsonNotOverlaps('data', 'other'),
        ),
      ).to.equal(
        "select `Model`.* from `Model` where JSON_OVERLAPS(JSON_EXTRACT(`data`, '$.\\\"a\\\"'), CAST('[1]' AS JSON)) or NOT COALESCE(JSON_OVERLAPS(`data`, `other`), FALSE)",
      );
    });

    it('whereJsonOverlaps should throw on postgres', () => {
      expect(() =>
        TestModel.query(Knex({ client: 'pg' }))
          .whereJsonOverlaps('data', [1])
          .toKnexQuery(),
      ).to.throwException(/whereJsonOverlaps is only supported on mysql/);
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
        whereJsonSubsetOf: (qb) => qb.whereJsonSubsetOf(expr, [1]),
        whereJsonIsArray: (qb) => qb.whereJsonIsArray(expr),
        whereJsonNotObject: (qb) => qb.whereJsonNotObject(expr),
        whereJsonHasAny: (qb) => qb.whereJsonHasAny(expr, [key, 'a?b']),
        whereJsonHasAll: (qb) => qb.whereJsonHasAll(expr, [key, "o'k"]),
        whereJsonNotOverlaps: (qb) => qb.whereJsonNotOverlaps(expr, [key]),
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
            const knexQuery = build(TestModel.query(mysql)).toKnexQuery();
            const native = knexQuery.toSQL().toNative();
            const placeholders = stripStringLiterals(native.sql).match(/\?/g) || [];

            expect(placeholders).to.have.length(native.bindings.length);
            // The path and the keys are always bindings, so the key never appears in the sql.
            expect(native.sql).to.not.contain(key);

            const path = native.bindings.find((it) => typeof it === 'string' && it[0] === '$');
            expect(JSON.parse(path.slice(2))).to.equal(key);
          });
        });
      });
    });
  });
});
