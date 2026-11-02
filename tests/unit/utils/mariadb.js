const Knex = require('knex');
const expect = require('expect.js');
const { Model, ref, val, fn } = require('../../../');
const { isMariaDb, getMariaDbVersion } = require('../../../lib/utils/knexUtils');

describe('MariaDB', () => {
  const mysql = Knex({ client: 'mysql2' });
  const mariadb = Knex({ client: 'mariadb' });
  const mariadb106 = Knex({ client: 'mariadb', version: '10.6.18-MariaDB' });
  const mysql2OnMariaDb = Knex({ client: 'mysql2', version: '11.4.2-MariaDB' });

  class Person extends Model {
    static get tableName() {
      return 'persons';
    }
  }

  function sql(builder) {
    return builder.toKnexQuery().toString();
  }

  describe('detection', () => {
    it("should recognize knex's mariadb client", () => {
      expect(isMariaDb(mariadb)).to.equal(true);
      expect(getMariaDbVersion(mariadb)).to.equal(null);
    });

    it('should recognize MariaDB from the version of the knex config', () => {
      expect(isMariaDb(mysql2OnMariaDb)).to.equal(true);
      expect(getMariaDbVersion(mysql2OnMariaDb)).to.eql([11, 4]);
      expect(getMariaDbVersion(mariadb106)).to.eql([10, 6]);
    });

    it('should treat mysql2 without a version as MySQL', () => {
      expect(isMariaDb(mysql)).to.equal(false);
      expect(isMariaDb(Knex({ client: 'mysql2', version: '8.4.0' }))).to.equal(false);
      expect(isMariaDb(Knex({ client: 'pg' }))).to.equal(false);
    });

    it('should recognize transactions', () => {
      // knex's transaction clients inherit from the client.
      const trx = { client: Object.create(mariadb.client) };
      expect(isMariaDb(trx)).to.equal(true);
    });
  });

  describe('JSON values', () => {
    it('should use JSON_COMPACT() instead of CAST(... AS JSON)', () => {
      expect(sql(Person.query(mysql).where('data', val({ a: 1 })))).to.equal(
        'select `persons`.* from `persons` where `data` = CAST(\'{\\"a\\":1}\' AS JSON)',
      );
      expect(sql(Person.query(mariadb).where('data', val({ a: 1 })))).to.equal(
        'select `persons`.* from `persons` where `data` = JSON_COMPACT(\'{\\"a\\":1}\')',
      );
      expect(sql(Person.query(mysql2OnMariaDb).where('data', val([1]).castJson()))).to.equal(
        "select `persons`.* from `persons` where `data` = JSON_COMPACT('[1]')",
      );
    });

    it('should patch fields of JSON columns', () => {
      expect(sql(Person.query(mariadb).patch({ 'data:a': { b: 1 } }))).to.equal(
        'update `persons` set `data` = JSON_SET(COALESCE(`data`, JSON_OBJECT()), \'$.\\"a\\"\', JSON_COMPACT(\'{\\"b\\":1}\'))',
      );
      expect(sql(Person.query(mysql).patch({ 'data:a': { b: 1 } }))).to.equal(
        'update `persons` set `data` = JSON_SET(COALESCE(`data`, JSON_OBJECT()), \'$.\\"a\\"\', CAST(\'{\\"b\\":1}\' AS JSON))',
      );
    });

    it('should compare fields of JSON columns in their compact form', () => {
      // MariaDB's JSON_EXTRACT() returns the JSON with spaces.
      expect(sql(Person.query(mariadb).where(ref('data:a'), val({ b: 1 })))).to.equal(
        'select `persons`.* from `persons` where JSON_COMPACT(JSON_EXTRACT(`data`, \'$.\\"a\\"\')) = JSON_COMPACT(\'{\\"b\\":1}\')',
      );
      expect(sql(Person.query(mysql).where(ref('data:a'), val({ b: 1 })))).to.equal(
        'select `persons`.* from `persons` where JSON_EXTRACT(`data`, \'$.\\"a\\"\') = CAST(\'{\\"b\\":1}\' AS JSON)',
      );
      // Casts unquote the value, as on MySQL.
      expect(sql(Person.query(mariadb).where(ref('data:a').castText(), 'x'))).to.equal(
        "select `persons`.* from `persons` where JSON_UNQUOTE(JSON_EXTRACT(`data`, '$.\\\"a\\\"')) = 'x'",
      );
    });

    it('should use JSON_COMPACT() in the whereJson* methods and fn helpers', () => {
      expect(sql(Person.query(mariadb).whereJsonSupersetOf('data', { a: 1 }))).to.contain(
        'JSON_CONTAINS(`data`, JSON_COMPACT(\'{\\"a\\":1}\'))',
      );
      expect(
        sql(Person.query(mariadb).select(fn.jsonContains(ref('tags'), ['a']).as('v'))),
      ).to.equal('select JSON_CONTAINS(`tags`, JSON_COMPACT(\'[\\"a\\"]\')) as `v` from `persons`');
      expect(sql(Person.query(mysql).select(fn.jsonContains(ref('tags'), ['a']).as('v')))).to.equal(
        'select JSON_CONTAINS(`tags`, CAST(\'[\\"a\\"]\' AS JSON)) as `v` from `persons`',
      );
    });
  });

  describe('whereJsonHasAny and whereJsonOverlaps', () => {
    it('whereJsonHasAny should not need JSON_OVERLAPS()', () => {
      const mariaDbSql = sql(Person.query(mariadb).whereJsonHasAny('tags', ['a', 'b']));

      expect(mariaDbSql).to.contain(
        "WHEN 'ARRAY' THEN (JSON_CONTAINS(`tags`, '\\\"a\\\"') OR JSON_CONTAINS(`tags`, '\\\"b\\\"'))",
      );
      expect(mariaDbSql).not.to.contain('JSON_OVERLAPS');
      expect(sql(Person.query(mysql).whereJsonHasAny('tags', ['a', 'b']))).to.contain(
        'JSON_OVERLAPS',
      );
    });

    it('whereJsonOverlaps should throw on MariaDB before 10.9', () => {
      expect(() =>
        Person.query(mariadb106).whereJsonOverlaps('tags', ['a']).toKnexQuery(),
      ).to.throwException(/whereJsonOverlaps needs MariaDB 10.9 or newer/);
      // Without a version the database decides.
      expect(sql(Person.query(mariadb).whereJsonOverlaps('tags', ['a']))).to.contain(
        'JSON_OVERLAPS',
      );
    });
  });

  describe('fn helpers', () => {
    it("should throw for the functions MariaDB doesn't have", () => {
      expect(() =>
        sql(Person.query(mariadb).select(fn.regexpLike(ref('a'), 'x'))),
      ).to.throwException(/fn.regexpLike\(\) doesn't exist on MariaDB/);
      expect(() =>
        sql(Person.query(mariadb).select(fn.memberOf('a', ref('tags')))),
      ).to.throwException(/fn.memberOf\(\) doesn't exist on MariaDB/);
      expect(() =>
        sql(Person.query(mariadb).select(fn.regexpInstr(ref('a'), 'x', 2))),
      ).to.throwException(/fn.regexpInstr\(\) takes at most 2 arguments on MariaDB/);
      expect(() =>
        sql(Person.query(mariadb).select(fn.jsonValue(ref('a'), '$.b', { returning: 'unsigned' }))),
      ).to.throwException(/fn.jsonValue\(\) can't use the returning option on MariaDB/);
    });

    it('should work as on MySQL otherwise', () => {
      expect(sql(Person.query(mariadb).select(fn.regexpInstr(ref('a'), 'x').as('v')))).to.equal(
        "select REGEXP_INSTR(`a`, 'x') as `v` from `persons`",
      );
      expect(sql(Person.query(mysql).select(fn.regexpLike(ref('a'), 'x').as('v')))).to.equal(
        "select REGEXP_LIKE(`a`, 'x') as `v` from `persons`",
      );
    });
  });
});
