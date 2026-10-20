'use strict';

const { ObjectionToKnexConvertingOperation } = require('./ObjectionToKnexConvertingOperation');
const { isKnexRaw } = require('../../utils/knexUtils');

// `whereIn`, `whereNotIn`, `onIn` etc. knex compiles the values before the column,
// so the bindings of a raw column (like `ref('data:a').castInt()` on MySQL or
// `fn.lower(ref('a'))`) end up after the values and the query uses the wrong
// bindings. In that case the condition is built as raw sql with the bindings in
// the right order.
class WhereInOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    const args = this.getKnexArgs(builder);
    const [column, values] = args;

    if (args.length !== 2 || !hasBindings(column) || isEmptyArray(values)) {
      return knexBuilder[this.name].apply(knexBuilder, args);
    }

    const knex = builder.knex();
    const not = this.opt.not ? 'not ' : '';
    let sql;
    let bindings;

    if (Array.isArray(values)) {
      sql = `? ${not}in (${values.map(() => '?').join(', ')})`;
      bindings = [column, ...values];
    } else {
      // A subquery.
      sql = `? ${not}in ?`;
      bindings = [column, values];
    }

    return knexBuilder[this.opt.rawMethod](knex.raw(sql, bindings));
  }
}

function hasBindings(column) {
  return isKnexRaw(column) && Array.isArray(column.bindings) && column.bindings.length > 0;
}

function isEmptyArray(values) {
  return Array.isArray(values) && values.length === 0;
}

module.exports = {
  WhereInOperation,
};
