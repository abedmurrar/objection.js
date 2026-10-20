const fs = require('fs');
const path = require('path');
const Knex = require('knex');
const expect = require('expect.js');
const { Model, fn, ref, raw } = require('../../../');
const { FUNCTIONS } = require('../../../lib/queryBuilder/functions/mysql');

describe('MySQL fn helpers', () => {
  class Person extends Model {
    static get tableName() {
      return 'persons';
    }
  }

  const mysql = Knex({ client: 'mysql2' });
  const pg = Knex({ client: 'pg' });

  function sql(builder, knex = mysql) {
    return Person.query(knex).select(builder.as('v')).toKnexQuery().toString();
  }

  function expr(builder, knex = mysql) {
    return sql(builder, knex)
      .replace(/^select /, '')
      .replace(/ as `v` from `persons`$/, '');
  }

  it('should define every function in the list', () => {
    const typings = fs.readFileSync(
      path.join(__dirname, '../../../typings/objection/index.d.ts'),
      'utf8',
    );

    for (const [name] of FUNCTIONS) {
      expect(fn[name]).to.be.a('function');
      expect(typings).to.contain(`    ${name}(`);
    }

    expect(new Set(FUNCTIONS.map(([name]) => name)).size).to.equal(FUNCTIONS.length);
  });

  it('should not replace the existing helpers', () => {
    expect(expr(fn.now())).to.equal('CURRENT_TIMESTAMP(6)');
    expect(expr(fn.count(ref('id')))).to.equal('COUNT(`id`)');
  });

  it('plain functions should bind their arguments', () => {
    expect(fn.length).to.not.equal(1);
    expect(expr(fn.length(ref('name')))).to.equal('LENGTH(`name`)');
    expect(expr(fn.dateFormat(ref('createdAt'), '%Y-%m'))).to.equal(
      "DATE_FORMAT(`createdAt`, '%Y-%m')",
    );
    expect(expr(fn.concatWs(', ', ref('a'), ref('b'), 'c'))).to.equal(
      "CONCAT_WS(', ', `a`, `b`, 'c')",
    );
    expect(expr(fn.curDate())).to.equal('CURDATE()');
    expect(expr(fn.if(fn.isNull(ref('x')), 0, ref('x')))).to.equal('IF(ISNULL(`x`), 0, `x`)');
    expect(expr(fn.ifNull(Person.query().select('id').limit(1), 0))).to.equal(
      'IFNULL((select `id` from `persons` limit 1), 0)',
    );
    expect(expr(fn.greatest(ref('a'), raw('?', [1])))).to.equal('GREATEST(`a`, 1)');
  });

  it('should cast objects and arrays passed as JSON documents', () => {
    expect(expr(fn.jsonContains(ref('tags'), ['a'], '$.x'))).to.equal(
      "JSON_CONTAINS(`tags`, CAST('[\\\"a\\\"]' AS JSON), '$.x')",
    );
    expect(expr(fn.jsonSet(ref('p'), '$.a', { b: 1 }, '$.c', [2], '$.d', 'str'))).to.equal(
      "JSON_SET(`p`, '$.a', CAST('{\\\"b\\\":1}' AS JSON), '$.c', CAST('[2]' AS JSON), '$.d', 'str')",
    );
    expect(expr(fn.jsonSet({ a: 1 }, '$.b', 2))).to.equal(
      "JSON_SET(CAST('{\\\"a\\\":1}' AS JSON), '$.b', 2)",
    );
    expect(expr(fn.jsonArray(1, [2], { a: 3 }))).to.equal(
      "JSON_ARRAY(1, CAST('[2]' AS JSON), CAST('{\\\"a\\\":3}' AS JSON))",
    );
    expect(expr(fn.jsonMergePatch(ref('p'), { a: null }))).to.equal(
      'JSON_MERGE_PATCH(`p`, CAST(\'{\\"a\\":null}\' AS JSON))',
    );
    expect(expr(fn.jsonObject({ id: ref('id'), tags: ['a'], n: 1 }))).to.equal(
      "JSON_OBJECT('id', `id`, 'tags', CAST('[\\\"a\\\"]' AS JSON), 'n', 1)",
    );
    expect(expr(fn.jsonObject('id', ref('id'), 'o', { a: 1 }))).to.equal(
      "JSON_OBJECT('id', `id`, 'o', CAST('{\\\"a\\\":1}' AS JSON))",
    );
    expect(expr(fn.jsonObject())).to.equal('JSON_OBJECT()');
    expect(expr(fn.memberOf('a', ref('tags')))).to.equal("('a' MEMBER OF(`tags`))");
    expect(expr(fn.memberOf({ a: 1 }, ref('tags')))).to.equal(
      '(CAST(\'{\\"a\\":1}\' AS JSON) MEMBER OF(`tags`))',
    );
  });

  it('should build the functions with keywords', () => {
    const cases = [
      [fn.dateAdd(ref('d'), 7, 'day'), 'DATE_ADD(`d`, INTERVAL 7 DAY)'],
      [
        fn.dateSub(fn.curDate(), '1:30', 'hour_minute'),
        "DATE_SUB(CURDATE(), INTERVAL '1:30' HOUR_MINUTE)",
      ],
      [fn.addDate(ref('d'), 3), 'ADDDATE(`d`, 3)'],
      [fn.subDate(ref('d'), 3, 'MONTH'), 'SUBDATE(`d`, INTERVAL 3 MONTH)'],
      [
        fn.timestampDiff('day', ref('a'), fn.now()),
        'TIMESTAMPDIFF(DAY, `a`, CURRENT_TIMESTAMP(6))',
      ],
      [fn.timestampAdd('week', 2, ref('a')), 'TIMESTAMPADD(WEEK, 2, `a`)'],
      [fn.extract('year_month', ref('d')), 'EXTRACT(YEAR_MONTH FROM `d`)'],
      [fn.getFormat('date', 'EUR'), "GET_FORMAT(DATE, 'EUR')"],
      [fn.cast(ref('x'), 'decimal(10, 2)'), 'CAST(`x` AS DECIMAL(10, 2))'],
      [fn.cast(ref('x'), 'unsigned'), 'CAST(`x` AS UNSIGNED)'],
      [
        fn.cast(ref('x'), 'char(10) character set utf8mb4'),
        'CAST(`x` AS CHAR(10) CHARACTER SET UTF8MB4)',
      ],
      [fn.convert(ref('x'), 'signed'), 'CONVERT(`x`, SIGNED)'],
      [fn.convert(ref('x'), { using: 'utf8mb4' }), 'CONVERT(`x` USING utf8mb4)'],
      [fn.position('a', ref('s')), "POSITION('a' IN `s`)"],
      [fn.trim(ref('s')), 'TRIM(`s`)'],
      [fn.trim(ref('s'), { side: 'leading' }), 'TRIM(LEADING FROM `s`)'],
      [fn.trim(ref('s'), { remove: 'x' }), "TRIM(BOTH 'x' FROM `s`)"],
      [fn.char([77, 121]), 'CHAR(77, 121)'],
      [fn.char(77, { using: 'utf8mb4' }), 'CHAR(77 USING utf8mb4)'],
      [fn.match(ref('title'), 'x'), "MATCH(`title`) AGAINST('x')"],
      [
        fn.match([ref('title'), ref('body')], '+x -y', { mode: 'boolean' }),
        "MATCH(`title`, `body`) AGAINST('+x -y' IN BOOLEAN MODE)",
      ],
      [fn.countDistinct(ref('a'), ref('b')), 'COUNT(DISTINCT `a`, `b`)'],
      [fn.groupConcat(ref('name')), 'GROUP_CONCAT(`name`)'],
      [
        fn.groupConcat([ref('a'), ref('b')], {
          distinct: true,
          orderBy: [[ref('a'), 'desc'], ref('b')],
          separator: '; ',
        }),
        "GROUP_CONCAT(DISTINCT `a`, `b` ORDER BY `a` DESC, `b` SEPARATOR '; ')",
      ],
      [
        fn.groupConcat(ref('a'), { orderBy: [ref('a'), 'asc'] }),
        'GROUP_CONCAT(`a` ORDER BY `a` ASC)',
      ],
      [fn.jsonValue(ref('p'), '$.a'), "JSON_VALUE(`p`, '$.a')"],
      [
        fn.jsonValue(ref('p'), '$.a', { returning: 'decimal(4,2)' }),
        "JSON_VALUE(`p`, '$.a' RETURNING DECIMAL(4,2))",
      ],
    ];

    for (const [builder, expected] of cases) {
      expect(expr(builder)).to.equal(expected);
    }
  });

  it('should reject keywords that are not on the lists', () => {
    const cases = [
      [
        () => fn.timestampDiff('day) or (1', ref('a'), ref('b')),
        /fn.timestampDiff\(\): invalid unit/,
      ],
      [() => fn.dateAdd(ref('a'), 1, 'days'), /fn.dateAdd\(\): invalid unit "days"/],
      [() => fn.dateAdd(ref('a'), 1), /fn.dateAdd\(\): invalid unit undefined/],
      [() => fn.extract('epoch', ref('a')), /invalid unit/],
      [() => fn.getFormat('x', 'EUR'), /invalid type/],
      [() => fn.cast(ref('a'), 'int'), /fn.cast\(\): invalid type "int"/],
      [() => fn.cast(ref('a'), 'char) or 1=1 or (1'), /invalid type/],
      [() => fn.convert(ref('a'), { using: 'utf8; drop' }), /invalid character set/],
      [() => fn.char(1, { using: '1 or 1' }), /invalid character set/],
      [() => fn.match(ref('a'), 'x', { mode: 'fuzzy' }), /invalid mode/],
      [() => fn.trim(ref('a'), { side: 'middle' }), /invalid side/],
      [() => fn.groupConcat(ref('a'), { orderBy: [[ref('a'), 'sideways']] }), /invalid direction/],
      [() => fn.jsonValue(ref('a'), '$', { returning: 'x y' }), /invalid type/],
    ];

    for (const [build, error] of cases) {
      expect(build).to.throwException(error);
    }
  });

  it('MySQL functions should throw on other databases', () => {
    expect(() => sql(fn.dateFormat(ref('a'), '%Y'), pg)).to.throwException((err) => {
      expect(err.message).to.equal(
        "fn.dateFormat() is a MySQL function and can't be used with postgresql.",
      );
    });

    expect(() => sql(fn.timestampDiff('day', ref('a'), ref('b')), pg)).to.throwException(
      /fn.timestampDiff\(\) is a MySQL function/,
    );
  });

  it('portable functions should work on other databases', () => {
    expect(
      Person.query(pg)
        .select(fn.round(ref('a'), 2), fn.trim(ref('b'), { side: 'trailing', remove: 'x' }))
        .where(fn.length(ref('c')), '>', 3)
        .toKnexQuery()
        .toString(),
    ).to.equal(
      `select ROUND("a", 2), TRIM(TRAILING 'x' FROM "b") from "persons" where LENGTH("c") > 3`,
    );
  });
});
