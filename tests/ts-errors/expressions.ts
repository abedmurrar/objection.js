// Error message tests. See scripts/typings-errors.js.
import { Model, fn } from '../../';

class Lesson extends Model {
  order!: number;
  type!: 'video' | 'text';
}

// @error: Argument of type '"2"' is not assignable to parameter of type 'number | FnExpression | null'.
Lesson.ref('order').eq('2');

// @error: Argument of type '"audio"' is not assignable to parameter of type '"video" | "text" | FnExpression | null'.
Lesson.ref('type').eq('audio');

// @error: Property 'as' does not exist on type 'WindowFunctionBuilder<number>'.
fn.rowNumber().as('rn');

// @error: Property 'filter' does not exist on type 'FunctionBuilder<unknown>'.
fn.coalesce(Lesson.ref('order')).filter(Lesson.ref('type').eq('text'));
