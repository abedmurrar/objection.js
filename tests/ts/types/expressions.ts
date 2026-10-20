import {
  Model,
  fn,
  ref,
  val,
  raw,
  FunctionBuilder,
  AggregateFunctionBuilder,
  CaseBuilder,
} from '../../../';
import { expectType, Expect, Equal } from '../_utils/expect';

type SqlBoolean = boolean | 0 | 1 | null;

class Lesson extends Model {
  static tableName = 'lessons';

  id!: number;
  moduleId!: number;
  order!: number;
  body!: string | null;
  type!: 'video' | 'text';
  publishedAt!: Date | null;
}

// Comparisons are checked against the type of the column.
expectType<FunctionBuilder<SqlBoolean>>()(Lesson.ref('order').gt(2));
expectType<FunctionBuilder<SqlBoolean>>()(Lesson.ref('type').eq('video'));
expectType<FunctionBuilder<SqlBoolean>>()(Lesson.ref('type').in(['video', 'text']));
expectType<FunctionBuilder<SqlBoolean>>()(Lesson.ref('body').eq(null));
expectType<FunctionBuilder<SqlBoolean>>()(Lesson.ref('order').eq(Lesson.ref('moduleId')));
expectType<FunctionBuilder<SqlBoolean>>()(Lesson.ref('publishedAt').gt('2026-01-01'));
expectType<FunctionBuilder<SqlBoolean>>()(Lesson.ref('publishedAt').lt(new Date()));
expectType<FunctionBuilder<SqlBoolean>>()(
  Lesson.ref('id').in(Lesson.query().select('id').where('moduleId', 1)),
);
expectType<FunctionBuilder<SqlBoolean>>()(Lesson.ref('order').between(1, 3));
expectType<FunctionBuilder<SqlBoolean>>()(Lesson.ref('body').isNotBlank());
expectType<FunctionBuilder<SqlBoolean>>()(
  Lesson.ref('body').isBlank().or(Lesson.ref('order').lt(0)).not(),
);

// Unknown types accept any value.
Lesson.ref('body').castInt().eq(1);
ref('anything').eq('x').and(ref('other').gt(1));
fn.count().gt(1);
val(1).eq(1);
raw('??', ['a']).eq(1);

// @ts-expect-error a number column isn't compared with a string
Lesson.ref('order').eq('2');
// @ts-expect-error the value isn't one of the literals
Lesson.ref('type').eq('audio');
// @ts-expect-error
Lesson.ref('type').in(['video', 'audio']);

// Arithmetic.
expectType<FunctionBuilder<number | string | null>>()(Lesson.ref('order').plus(1));
Lesson.ref('order')
  .times(100)
  .plus(fn.coalesce(Lesson.ref('moduleId'), 1));

// fn.case()
expectType<FunctionBuilder<'high' | 'low'>>()(
  fn.case().when(Lesson.ref('order').gt(2), 'high').else('low'),
);
// Without else() the result can be NULL.
const caseWithoutElse = fn.case(Lesson.ref('type')).when('video', 1).when('text', 2);
expectType<CaseBuilder<1 | 2>>()(caseWithoutElse);
type _CaseValue = Expect<
  Equal<NonNullable<typeof caseWithoutElse>['~type'], 1 | 2 | null | undefined>
>;
expectType<FunctionBuilder<number>>()(
  fn.case().when(Lesson.ref('order').gt(2), Lesson.ref('order')).else(-1),
);

// fn.exists(), filter(), over()
expectType<FunctionBuilder<SqlBoolean>>()(fn.exists(Lesson.query().where('moduleId', 1)));
expectType<AggregateFunctionBuilder<number | string>>()(
  fn.count().filter(Lesson.ref('body').isNull()),
);
expectType<AggregateFunctionBuilder<number>>()(
  fn.countDistinct(Lesson.ref('moduleId')).filter(Lesson.ref('type').eq('video')),
);
expectType<FunctionBuilder<number>>()(
  fn.rowNumber().over({ partitionBy: 'moduleId', orderBy: ['order', 'desc'] }),
);
fn.sum(Lesson.ref('order')).over({ partitionBy: [Lesson.ref('moduleId')] });
fn.lag(Lesson.ref('order'), 1, 0).over({ orderBy: [['order', 'asc'], 'id'] });

// @ts-expect-error a window function needs over()
Lesson.query().select(fn.rowNumber().as('rn'));
// @ts-expect-error only aggregates can be filtered
fn.coalesce(ref('a')).filter(ref('b'));

async () => {
  await Lesson.query()
    .select(
      'id',
      Lesson.ref('order').gt(2).as('late'),
      val('lesson').as('kind'),
      fn.count().filter(Lesson.ref('body').isNotBlank()).as('withBody'),
    )
    .where(Lesson.ref('type').eq('video').or(Lesson.ref('order').lte(1)))
    .orderBy(Lesson.ref('moduleId').eq(5), 'desc')
    .groupBy('id')
    .having(fn.count().gt(1));

  await Lesson.query().none();

  await Lesson.query()
    .patch({ order: Lesson.ref('order').plus(1), body: fn.case().when(ref('a'), 'x').else('y') })
    .where('moduleId', 1);

  await Lesson.query()
    .insert({ id: 1, moduleId: 1, order: 1, type: 'text' })
    .onConflict('id')
    .merge({ order: fn.excluded('order'), type: fn.excluded(Lesson.ref('type')) });

  await Lesson.query().join(Lesson, (join) =>
    join
      .on(Lesson.ref('id'), Lesson.ref('moduleId'))
      .andOn(Lesson.ref('order').eq(Lesson.query().max('order'))),
  );
};
