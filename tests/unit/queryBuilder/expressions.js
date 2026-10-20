const Knex = require('knex');
const expect = require('expect.js');
const { Model, fn, ref, val, raw } = require('../../../');

describe('expressions', () => {
  class Pet extends Model {
    static get tableName() {
      return 'pets';
    }
  }

  class Person extends Model {
    static get tableName() {
      return 'persons';
    }

    static get relationMappings() {
      return {
        pets: {
          relation: Model.HasManyRelation,
          modelClass: Pet,
          join: { from: 'persons.id', to: 'pets.ownerId' },
        },
      };
    }
  }

  const mysql = Knex({ client: 'mysql2' });
  const pg = Knex({ client: 'pg' });
  const sqlite = Knex({ client: 'sqlite3', useNullAsDefault: true });

  function sql(query) {
    return query.toKnexQuery().toString();
  }

  function expr(builder, knex = mysql) {
    return sql(Person.query(knex).select(builder.as('v')))
      .replace(/^select /, '')
      .replace(/ as [`"]v[`"] from [`"]persons[`"]$/, '');
  }

  it('comparisons', () => {
    const cases = [
      [ref('a').eq(1), '(`a` = 1)'],
      [ref('a').eq('x'), "(`a` = 'x')"],
      [ref('a').eq(null), '(`a` IS NULL)'],
      [ref('a').ne(null), '(`a` IS NOT NULL)'],
      [ref('a').ne(ref('b')), '(`a` <> `b`)'],
      [ref('a').gt(1), '(`a` > 1)'],
      [ref('a').gte(1), '(`a` >= 1)'],
      [ref('a').lt(1), '(`a` < 1)'],
      [ref('a').lte(1), '(`a` <= 1)'],
      [ref('a').in([1, 2]), '(`a` IN (1, 2))'],
      [ref('a').notIn(['x']), "(`a` NOT IN ('x'))"],
      [ref('a').in([]), '(1 = 0)'],
      [ref('a').notIn([]), '(1 = 1)'],
      [
        ref('a').in(Pet.query().select('id').where('species', 'dog')),
        "(`a` IN (select `id` from `pets` where `species` = 'dog'))",
      ],
      [ref('a').like('%x%'), "(`a` LIKE '%x%')"],
      [ref('a').between(1, 5), '(`a` BETWEEN 1 AND 5)'],
      [ref('a').isNull(), '(`a` IS NULL)'],
      [ref('a').isNotNull(), '(`a` IS NOT NULL)'],
      [ref('a').isBlank(), "(COALESCE(TRIM(`a`), '') = '')"],
      [ref('a').isNotBlank(), "(COALESCE(TRIM(`a`), '') <> '')"],
      [Person.ref('age').gte(18), '(`persons`.`age` >= 18)'],
      [
        ref('data:a.b').castInt().gt(1),
        '(CAST(JSON_UNQUOTE(JSON_EXTRACT(`data`, \'$.\\"a\\".\\"b\\"\')) AS SIGNED) > 1)',
      ],
      [fn.count().gt(1), '(COUNT(*) > 1)'],
      [val(1).eq(1), '(1 = 1)'],
      [raw('??', ['a']).eq(1), '(`a` = 1)'],
    ];

    for (const [builder, expected] of cases) {
      expect(expr(builder)).to.equal(expected);
    }
  });

  it('logic and arithmetic', () => {
    const cases = [
      [ref('a').eq(1).and(ref('b').eq(2)), '((`a` = 1) AND (`b` = 2))'],
      [ref('a').eq(1).and(ref('b'), ref('c').isNull()), '((`a` = 1) AND `b` AND (`c` IS NULL))'],
      [ref('a').eq(1).or(ref('b').eq(2)).not(), '(NOT ((`a` = 1) OR (`b` = 2)))'],
      [ref('a').plus(1), '(`a` + 1)'],
      [ref('a').minus(ref('b')), '(`a` - `b`)'],
      [
        ref('a')
          .times(100)
          .plus(fn.coalesce(ref('b'), 1)),
        '((`a` * 100) + COALESCE(`b`, 1))',
      ],
      [ref('a').div(2).gt(1), '((`a` / 2) > 1)'],
      [fn.greatest(ref('a').minus(1), 0), 'GREATEST((`a` - 1), 0)'],
    ];

    for (const [builder, expected] of cases) {
      expect(expr(builder)).to.equal(expected);
    }
  });

  it('should work on postgres and SQLite', () => {
    expect(expr(ref('a').eq(1).or(ref('b').isBlank()), pg)).to.equal(
      `(("a" = 1) OR (COALESCE(TRIM("b"), '') = ''))`,
    );
    expect(expr(ref('a').in([1, 2]).not(), sqlite)).to.equal('(NOT (`a` IN (1, 2)))');
  });

  it('should be usable in where, orderBy, having, patch and join callbacks', () => {
    expect(
      sql(
        Person.query(mysql)
          .where(Person.ref('age').gte(18))
          .orderBy(Person.ref('id').eq(5), 'desc')
          .groupBy('id')
          .having(fn.count().gt(1)),
      ),
    ).to.equal(
      'select `persons`.* from `persons` where (`persons`.`age` >= 18) group by `id` having (COUNT(*) > 1) order by (`persons`.`id` = 5) desc',
    );

    expect(
      sql(
        Person.query(mysql)
          .patch({
            order: Person.ref('order').plus(1),
            count: fn.greatest(ref('count').minus(1), 0),
          })
          .where('id', 1),
      ),
    ).to.equal(
      'update `persons` set `order` = (`persons`.`order` + 1), `count` = GREATEST((`count` - 1), 0) where `id` = 1',
    );

    expect(
      sql(
        Person.query(mysql).join(Pet, (join) =>
          join
            .on(Pet.ref('ownerId'), Person.ref('id'))
            .andOn(
              Pet.ref('version').eq(
                Pet.query().alias('p2').max('version').where('p2.ownerId', Person.ref('id')),
              ),
            ),
        ),
      ),
    ).to.equal(
      'select `persons`.* from `persons` inner join `pets` on `pets`.`ownerId` = `persons`.`id` and (`pets`.`version` = (select max(`version`) from `pets` as `p2` where `p2`.`ownerId` = `persons`.`id`))',
    );
  });

  it('subqueries in join callbacks should work on MySQL', () => {
    expect(
      sql(
        Person.query(mysql).join(Pet, (join) =>
          join.on(Pet.ref('version'), Pet.query().alias('p2').max('version')),
        ),
      ),
    ).to.equal(
      'select `persons`.* from `persons` inner join `pets` on `pets`.`version` = (select max(`version`) from `pets` as `p2`)',
    );
  });

  it('expressions in a relation query should not need to be grouped', () => {
    const person = Person.fromJson({ id: 1 });

    expect(sql(person.$relatedQuery('pets', mysql).where(ref('a').eq(1)))).to.equal(
      'select `pets`.* from `pets` where `pets`.`ownerId` in (1) and (`a` = 1)',
    );

    expect(
      sql(person.$relatedQuery('pets', mysql).where(ref('a').eq(1)).orWhere(ref('b').eq(2))),
    ).to.equal(
      'select `pets`.* from `pets` where `pets`.`ownerId` in (1) and ((`a` = 1) or (`b` = 2))',
    );

    expect(sql(person.$relatedQuery('pets', mysql).where(ref('a').eq(raw('1 or 1'))))).to.equal(
      'select `pets`.* from `pets` where `pets`.`ownerId` in (1) and ((`a` = 1 or 1))',
    );
  });

  it('none()', () => {
    expect(sql(Person.query(mysql).none())).to.equal(
      'select `persons`.* from `persons` where (1 = 0)',
    );
    expect(sql(Person.fromJson({ id: 1 }).$relatedQuery('pets', mysql).none())).to.equal(
      'select `pets`.* from `pets` where `pets`.`ownerId` in (1) and (1 = 0)',
    );
  });

  it('fn.case()', () => {
    expect(
      expr(fn.case().when(ref('a').gt(2), 'high').when(ref('a').gt(1), 'mid').else('low')),
    ).to.equal("(CASE WHEN (`a` > 2) THEN 'high' WHEN (`a` > 1) THEN 'mid' ELSE 'low' END)");
    expect(expr(fn.case(ref('type')).when('a', 1).when('b', 2))).to.equal(
      "(CASE `type` WHEN 'a' THEN 1 WHEN 'b' THEN 2 END)",
    );
    expect(expr(fn.case(ref('type')).when('a', 1).eq(1))).to.equal(
      "((CASE `type` WHEN 'a' THEN 1 END) = 1)",
    );
    expect(() => expr(fn.case())).to.throwException(/fn.case\(\) needs at least one when\(\)/);
  });

  it('fn.exists()', () => {
    expect(expr(fn.exists(Person.relatedQuery('pets')), pg)).to.equal(
      '(EXISTS (select "pets".* from "pets" where "pets"."ownerId" = "persons"."id"))',
    );
    expect(expr(fn.exists(Pet.query()).not())).to.equal(
      '(NOT (EXISTS (select `pets`.* from `pets`)))',
    );
    expect(() => fn.exists('pets')).to.throwException(/fn.exists\(\) takes a query/);
  });

  it('fn.count()', () => {
    expect(expr(fn.count())).to.equal('COUNT(*)');
    expect(expr(fn.count('*'))).to.equal('COUNT(*)');
    expect(expr(fn.count(ref('id')))).to.equal('COUNT(`id`)');
  });

  it('filter()', () => {
    const cases = [
      [fn.count().filter(ref('dead')), 'COUNT(CASE WHEN `dead` THEN 1 END)'],
      [fn.count(ref('id')).filter(ref('a').eq(1)), 'COUNT(CASE WHEN (`a` = 1) THEN `id` END)'],
      [
        fn.sum(ref('amount')).filter(ref('a').eq(1)).filter(ref('b').eq(2)),
        'SUM(CASE WHEN ((`a` = 1) AND (`b` = 2)) THEN `amount` END)',
      ],
      [
        fn.avg(ref('score')).filter(ref('score').isNotNull()),
        'AVG(CASE WHEN (`score` IS NOT NULL) THEN `score` END)',
      ],
      [fn.min(ref('x')).filter(ref('a')), 'MIN(CASE WHEN `a` THEN `x` END)'],
      [fn.max(ref('x')).filter(ref('a')), 'MAX(CASE WHEN `a` THEN `x` END)'],
      [
        fn.countDistinct(ref('userId')).filter(ref('attended')),
        'COUNT(DISTINCT CASE WHEN `attended` THEN `userId` END)',
      ],
      [
        fn.countDistinct(ref('a'), ref('b')).filter(ref('c')),
        'COUNT(DISTINCT CASE WHEN `c` THEN `a` END, CASE WHEN `c` THEN `b` END)',
      ],
      [
        fn.groupConcat(ref('name'), { orderBy: 'name', separator: '|' }).filter(ref('a')),
        "GROUP_CONCAT(CASE WHEN `a` THEN `name` END ORDER BY `name` SEPARATOR '|')",
      ],
      [fn.jsonArrayAgg(ref('id')).filter(ref('a')), 'JSON_ARRAYAGG(CASE WHEN `a` THEN `id` END)'],
    ];

    for (const [builder, expected] of cases) {
      expect(expr(builder)).to.equal(expected);
    }

    expect(expr(fn.count().filter(ref('a').eq(1)), pg)).to.equal(
      'COUNT(CASE WHEN ("a" = 1) THEN 1 END)',
    );

    expect(() => fn.coalesce(ref('a')).filter(ref('b'))).to.throwException(
      /filter\(\) only works with the aggregate functions/,
    );
    expect(() => fn.jsonObjectAgg(ref('a'), ref('b')).filter(ref('c'))).to.throwException(
      /filter\(\) only works/,
    );
  });

  it('window functions', () => {
    const cases = [
      [fn.rowNumber().over(), 'ROW_NUMBER() OVER ()'],
      [
        fn.rowNumber().over({ partitionBy: 'ownerId', orderBy: ['createdAt', 'desc'] }),
        'ROW_NUMBER() OVER (PARTITION BY `ownerId` ORDER BY `createdAt` DESC)',
      ],
      [
        fn.rank().over({
          partitionBy: [Pet.ref('ownerId'), 'species'],
          orderBy: [[ref('a'), 'asc'], 'b'],
        }),
        'RANK() OVER (PARTITION BY `pets`.`ownerId`, `species` ORDER BY `a` ASC, `b`)',
      ],
      [fn.denseRank().over({ orderBy: 'a' }), 'DENSE_RANK() OVER (ORDER BY `a`)'],
      [fn.ntile(4).over({ orderBy: 'a' }), 'NTILE(4) OVER (ORDER BY `a`)'],
      [fn.lag(ref('a')).over({ orderBy: 'a' }), 'LAG(`a`) OVER (ORDER BY `a`)'],
      [fn.lead(ref('a'), 2).over({ orderBy: 'a' }), 'LEAD(`a`, 2) OVER (ORDER BY `a`)'],
      [fn.lag(ref('a'), undefined, 0).over({ orderBy: 'a' }), 'LAG(`a`, 1, 0) OVER (ORDER BY `a`)'],
      [fn.nthValue(ref('a'), 2).over({ orderBy: 'a' }), 'NTH_VALUE(`a`, 2) OVER (ORDER BY `a`)'],
      [
        fn.firstValue(ref('a')).over({ partitionBy: 'b' }),
        'FIRST_VALUE(`a`) OVER (PARTITION BY `b`)',
      ],
      [
        fn.sum(ref('amount')).over({ partitionBy: 'ownerId' }),
        'SUM(`amount`) OVER (PARTITION BY `ownerId`)',
      ],
      [
        fn.count().filter(ref('a')).over({ partitionBy: 'b' }),
        'COUNT(CASE WHEN `a` THEN 1 END) OVER (PARTITION BY `b`)',
      ],
      [fn.rowNumber().over({ orderBy: 'id' }).lte(3), '(ROW_NUMBER() OVER (ORDER BY `id`) <= 3)'],
    ];

    for (const [builder, expected] of cases) {
      expect(expr(builder)).to.equal(expected);
    }

    expect(expr(fn.rowNumber().over({ partitionBy: 'ownerId', orderBy: 'id' }), pg)).to.equal(
      'ROW_NUMBER() OVER (PARTITION BY "ownerId" ORDER BY "id")',
    );

    expect(() => expr(fn.rowNumber())).to.throwException(
      /fn.rowNumber\(\) is a window function and needs over\(\)/,
    );
    expect(() => fn.rowNumber().over({ partition: 'a' })).to.throwException(
      /over\(\): unknown option "partition"/,
    );
    expect(() => fn.ntile(0)).to.throwException(/fn.ntile\(\): buckets must be an integer >= 1/);
    expect(() => fn.lag(ref('a'), '1; drop')).to.throwException(/offset must be an integer/);
    expect(expr(fn.rowNumber().over({ orderBy: ['a', 'b'] }))).to.equal(
      'ROW_NUMBER() OVER (ORDER BY `a`, `b`)',
    );
    expect(() => expr(fn.rowNumber().over({ orderBy: [['a', 'sideways']] }))).to.throwException(
      /over\(\): invalid direction "sideways"/,
    );
  });

  it('fn.excluded()', () => {
    const merge = {
      type: fn.case().when(ref('type').eq('owner'), ref('type')).else(fn.excluded('type')),
    };

    expect(
      sql(Person.query(mysql).insert({ id: 1, type: 'x' }).onConflict('id').merge(merge)),
    ).to.equal(
      "insert into `persons` (`id`, `type`) values (1, 'x') on duplicate key update `type` = (CASE WHEN (`type` = 'owner') THEN `type` ELSE VALUES(`type`) END)",
    );

    expect(
      sql(
        Person.query(pg)
          .insert({ id: 1, type: 'x' })
          .onConflict('id')
          .merge({ type: fn.excluded(Person.ref('type')) }),
      ),
    ).to.equal(
      `insert into "persons" ("id", "type") values (1, 'x') on conflict ("id") do update set "type" = "excluded"."type" returning "id"`,
    );

    expect(() => fn.excluded(1)).to.throwException(/fn.excluded\(\) takes a column name/);
  });

  it('values and nulls as columns', () => {
    expect(
      sql(Person.query(mysql).select('id', val('lesson').as('type'), val(null).as('score'))),
    ).to.equal("select `id`, 'lesson' as `type`, NULL as `score` from `persons`");
  });
});
