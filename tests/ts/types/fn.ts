import { Model, fn, ref, FunctionBuilder } from '../../../';
import { expectType } from '../_utils/expect';

class Event extends Model {
  static tableName = 'events';

  id!: number;
  startsAt!: Date;
  tags!: string[];
}

expectType<FunctionBuilder<string | null>>()(fn.dateFormat(Event.ref('startsAt'), '%Y-%m'));
expectType<FunctionBuilder<number | null>>()(
  fn.timestampDiff('day', Event.ref('startsAt'), fn.now()),
);
expectType<FunctionBuilder<number | null>>()(fn.timestampDiff('DAY', ref('a'), ref('b')));
expectType<FunctionBuilder<Date | string | null>>()(fn.dateSub(fn.curDate(), 7, 'day'));
expectType<FunctionBuilder<0 | 1 | null>>()(fn.jsonContains(Event.ref('tags'), ['a']));
expectType<FunctionBuilder<0 | 1 | null>>()(fn.memberOf('a', Event.ref('tags')));
expectType<FunctionBuilder<unknown[] | null>>()(fn.jsonArrayAgg(Event.ref('id')));
expectType<FunctionBuilder<Record<string, unknown>>>()(fn.jsonObject({ id: Event.ref('id') }));
expectType<FunctionBuilder<string | null>>()(
  fn.groupConcat(Event.ref('id'), {
    distinct: true,
    orderBy: [Event.ref('id'), 'desc'],
    separator: ',',
  }),
);
expectType<FunctionBuilder<number | null>>()(fn.length(Event.ref('id')));
expectType<FunctionBuilder<number>>()(fn.countDistinct(Event.ref('id')));
expectType<FunctionBuilder<string | number>>()(fn.count(Event.ref('id')));

async () => {
  await Event.query()
    .select(fn.dateFormat(Event.ref('startsAt'), '%Y').as('year'))
    .where(fn.jsonOverlaps(Event.ref('tags'), ['a', 'b']), 1)
    .orderBy(fn.ifNull(Event.ref('startsAt'), fn.now()));
};

// @ts-expect-error
fn.timestampDiff('days', ref('a'), ref('b'));
// @ts-expect-error
fn.dateAdd(ref('a'), 1);
// @ts-expect-error
fn.jsonContainsPath(ref('a'), 'some', '$.a');
