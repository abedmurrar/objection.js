const expect = require('expect.js');
const { Model, fn, ref } = require('../../');
const { FUNCTIONS } = require('../../lib/queryBuilder/functions/mysql');

// Functions that can't be called with NULL arguments in a test.
const SKIP = new Set([
  'sleep',
  'getLock',
  'releaseLock',
  'waitForExecutedGtidSet',
  'sourcePosWait',
  'default',
]);

module.exports = (session) => {
  describe('MySQL fn helpers', () => {
    class Event extends Model {
      static get tableName() {
        return 'MysqlFunctionsEvent';
      }
    }

    let BoundEvent;

    before(async () => {
      BoundEvent = Event.bindKnex(session.knex);

      await session.knex.schema.dropTableIfExists('MysqlFunctionsEvent');
      await session.knex.schema.createTable('MysqlFunctionsEvent', (table) => {
        table.integer('id').primary();
        table.string('name');
        table.dateTime('startsAt');
        table.json('tags');
      });

      await session.knex('MysqlFunctionsEvent').insert([
        { id: 1, name: 'Alpha', startsAt: '2026-01-15 10:00:00', tags: JSON.stringify(['a', 'b']) },
        { id: 2, name: 'beta', startsAt: '2026-02-20 12:30:00', tags: JSON.stringify(['b']) },
        { id: 3, name: 'Gamma', startsAt: '2026-02-01 08:00:00', tags: JSON.stringify([]) },
      ]);
    });

    after(() => session.knex.schema.dropTableIfExists('MysqlFunctionsEvent'));

    async function value(builder) {
      const row = await BoundEvent.query().select(builder.as('v')).findById(1);
      return row.v;
    }

    it('every plain function should exist with the given number of parameters', async () => {
      const failures = [];

      for (const [name, sql, params, , options = {}] of FUNCTIONS) {
        if (options.build || SKIP.has(name)) {
          continue;
        }

        const list = params ? params.split(/,\s*(?![^{]*\})/) : [];
        const required = list.filter((it) => !it.includes('?') && !it.startsWith('...')).length;
        const hasRest = list.some((it) => it.startsWith('...'));
        let error = null;

        // Functions with a rest parameter need one or two arguments for it.
        for (const count of hasRest ? [required + 1, required + 2] : [required]) {
          try {
            const builder = fn[name](...new Array(count).fill(null));
            await value(options.window ? builder.over() : builder);
            error = null;
            break;
          } catch (err) {
            error = err;
          }
        }

        if (
          error &&
          !/Invalid JSON|Invalid data type|Incorrect arguments|cannot be null|NULL member names|user-level lock name|Invalid use of group function/i.test(
            error.message,
          )
        ) {
          failures.push(`${name} (${sql}): ${error.message.split(' - ').pop()}`);
        }
      }

      expect(failures).to.eql([]);
    });

    it('string, numeric and date functions', async () => {
      expect(await value(fn.length(ref('name')))).to.equal(5);
      expect(await value(fn.instr(ref('name'), 'ph'))).to.equal(3);
      expect(await value(fn.lpad(fn.concat(ref('id')), 3, '0'))).to.equal('001');
      expect(await value(fn.dateFormat(ref('startsAt'), '%Y-%m'))).to.equal('2026-01');
      expect(await value(fn.year(ref('startsAt')))).to.equal(2026);
      expect(await value(fn.quarter(ref('startsAt')))).to.equal(1);
      expect(await value(fn.greatest(1, 5, 3))).to.equal(5);
      expect(Number(await value(fn.round(1.256, 2)))).to.equal(1.26);
      expect(await value(fn.if(fn.isNull(null), 'yes', 'no'))).to.equal('yes');
    });

    it('functions with keywords', async () => {
      expect(await value(fn.timestampDiff('day', ref('startsAt'), '2026-01-20 10:00:00'))).to.equal(
        5,
      );
      expect(
        await value(fn.dateFormat(fn.dateAdd(ref('startsAt'), 1, 'month'), '%Y-%m-%d')),
      ).to.equal('2026-02-15');
      expect(
        await value(fn.dateFormat(fn.dateSub(ref('startsAt'), '1:30', 'hour_minute'), '%H:%i')),
      ).to.equal('08:30');
      expect(await value(fn.dateFormat(fn.addDate(ref('startsAt'), 2), '%d'))).to.equal('17');
      expect(await value(fn.extract('year_month', ref('startsAt')))).to.equal(202601);
      expect(await value(fn.getFormat('date', 'EUR'))).to.equal('%d.%m.%Y');
      expect(await value(fn.cast('12.5', 'decimal(4,1)'))).to.equal('12.5');
      expect(await value(fn.convert('12', 'unsigned'))).to.equal(12);
      expect(await value(fn.position('ph', ref('name')))).to.equal(3);
      expect(await value(fn.trim('xxaxx', { remove: 'x' }))).to.equal('a');
      expect(await value(fn.trim('  a ', { side: 'leading' }))).to.equal('a ');
      expect(await value(fn.convert(fn.char([77, 121]), { using: 'utf8mb4' }))).to.equal('My');
      expect(
        await value(fn.jsonValue(fn.jsonObject({ a: '5' }), '$.a', { returning: 'unsigned' })),
      ).to.equal(5);
      expect(await value(fn.memberOf('a', ref('tags')))).to.equal(1);
    });

    it('aggregates', async () => {
      const [row] = await BoundEvent.query().select(
        fn.groupConcat(ref('name'), { orderBy: [ref('name'), 'desc'], separator: '|' }).as('names'),
        fn
          .groupConcat(fn.month(ref('startsAt')), {
            distinct: true,
            orderBy: fn.month(ref('startsAt')),
          })
          .as('months'),
        fn.countDistinct(fn.month(ref('startsAt'))).as('monthCount'),
        fn.jsonArrayAgg(ref('id')).as('ids'),
        fn.jsonObjectAgg(ref('name'), ref('id')).as('byName'),
      );

      expect(row.names).to.equal('Gamma|beta|Alpha');
      expect(row.months).to.equal('1,2');
      expect(row.monthCount).to.equal(2);
      expect(row.ids.sort()).to.eql([1, 2, 3]);
      expect(row.byName).to.eql({ Alpha: 1, beta: 2, Gamma: 3 });
    });

    it('JSON functions should cast objects and arrays', async () => {
      expect(await value(fn.jsonContains(ref('tags'), ['a']))).to.equal(1);
      expect(await value(fn.jsonOverlaps(ref('tags'), ['x', 'b']))).to.equal(1);
      expect(await value(fn.jsonLength(ref('tags')))).to.equal(2);
      expect(await value(fn.jsonSet({ a: 1 }, '$.b', { c: [2] }))).to.eql({ a: 1, b: { c: [2] } });
      expect(await value(fn.jsonMergePatch({ a: 1, b: 2 }, { b: null }))).to.eql({ a: 1 });
      expect(await value(fn.jsonObject({ id: ref('id'), tags: ref('tags'), list: [1] }))).to.eql({
        id: 1,
        tags: ['a', 'b'],
        list: [1],
      });
      expect(await value(fn.jsonArray(ref('id'), { a: 1 }))).to.eql([1, { a: 1 }]);
      expect(await value(fn.jsonSearch(ref('tags'), 'one', 'b'))).to.equal('$[1]');

      expect(
        (
          await BoundEvent.query()
            .where(fn.jsonContains(ref('tags'), ['b']), 1)
            .orderBy('id')
        ).map((it) => it.id),
      ).to.eql([1, 2]);
    });
  });
};
