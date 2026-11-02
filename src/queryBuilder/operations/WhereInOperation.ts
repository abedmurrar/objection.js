import { ObjectionToKnexConvertingOperation } from './ObjectionToKnexConvertingOperation';
import { isKnexRaw } from '../../utils/knexUtils';
import type { KnexBuilder, QueryBuilder, RawBinding } from './types';

// `onIn`, `onNotIn` etc. of join callbacks. knex compiles the values before the
// column, so the bindings of a raw column (like `ref('data:a').castInt()` on
// MySQL or `fn.lower(ref('a'))`) end up after the values and the query uses the
// wrong bindings. In that case the condition is built as raw sql with the
// bindings in the right order. knex 3.2 fixed this for `whereIn` but not for
// `onIn`.
class WhereInOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const args = this.getKnexArgs(builder);
    const [column, values] = args;

    if (args.length !== 2 || !hasBindings(column) || isEmptyArray(values)) {
      return knexBuilder[this.name as string].apply(knexBuilder, args);
    }

    const knex = builder.knex();
    const not = this.opt.not ? 'not ' : '';
    let sql: string;
    let bindings: RawBinding[];

    if (Array.isArray(values)) {
      sql = `? ${not}in (${values.map(() => '?').join(', ')})`;
      bindings = [column, ...values];
    } else if (isKnexRaw(values)) {
      // knex doesn't wrap raw bindings in parentheses.
      sql = `? ${not}in (?)`;
      bindings = [column, values];
    } else {
      // A subquery, which knex wraps in parentheses.
      sql = `? ${not}in ?`;
      bindings = [column, values];
    }

    return knexBuilder[this.opt.rawMethod as string](knex.raw(sql, bindings));
  }
}

// A knex raw with bindings.
function hasBindings(column: unknown): boolean | undefined {
  const raw = column as { bindings?: unknown };
  return isKnexRaw(raw) && Array.isArray(raw.bindings) && raw.bindings.length > 0;
}

function isEmptyArray(values: unknown): boolean {
  return Array.isArray(values) && values.length === 0;
}

export { WhereInOperation };
