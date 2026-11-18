import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import { isKnexQueryBuilder } from '../../../utils/knexUtils';
import { asSingle } from '../../../utils/objectUtils';
import { buildCompositeSubqueryArgs } from './WhereInCompositeOperation';
import type { KnexBuilder, OperationOptions, QueryBuilder } from '../types';

interface WhereArgs {
  method: 'where' | 'whereIn';
  args: unknown[];
}

class WhereInCompositeSqliteOperation extends ObjectionToKnexConvertingOperation {
  declare prefix: string | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.prefix = this.opt.prefix || null;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const [columns, values] = this.getKnexArgs(builder) as [unknown, unknown];

    // A subquery of several columns uses row values, `(a, b) in (select ...)`,
    // like on the other databases. SQLite has them since 3.15.
    if (isCompositeKey(columns) && !Array.isArray(values)) {
      const args = buildCompositeSubqueryArgs(builder.knex(), columns as unknown[], values);

      return this.prefix === 'not' ? knexBuilder.whereNotIn(...args) : knexBuilder.whereIn(...args);
    }

    const { method, args } = buildWhereArgs(columns, values);

    if (method === 'where') {
      if (this.prefix === 'not') {
        return knexBuilder.whereNot(...args);
      } else {
        return knexBuilder.where(...args);
      }
    } else {
      if (this.prefix === 'not') {
        return knexBuilder.whereNotIn(...args);
      } else {
        return knexBuilder.whereIn(...args);
      }
    }
  }
}

function buildWhereArgs(columns: unknown, values: unknown): WhereArgs {
  if (isCompositeKey(columns)) {
    return buildCompositeArgs(columns as unknown[], values as unknown[]);
  } else {
    return buildNonCompositeArgs(columns, values);
  }
}

function isCompositeKey(columns: unknown): boolean {
  return Array.isArray(columns) && columns.length > 1;
}

function buildCompositeArgs(columns: unknown[], values: unknown[]): WhereArgs {
  if (values.length === 0) {
    // knex turns an empty `whereIn` into `1 = 0` and an empty `whereNotIn`
    // into `1 = 1` (#1914).
    return {
      method: 'whereIn',
      args: [columns, []],
    };
  }

  // Sqlite doesn't support the `where in` syntax for multiple columns but
  // we can emulate it using grouped `or` clauses.
  return {
    method: 'where',
    args: [
      (builder: KnexBuilder) => {
        values.forEach((val) => {
          builder.orWhere((builder: KnexBuilder) => {
            columns.forEach((col, idx) => {
              builder.andWhere(col, (val as unknown[])[idx]);
            });
          });
        });
      },
    ],
  };
}

function buildNonCompositeArgs(columns: unknown, values: unknown): WhereArgs {
  if (Array.isArray(values)) {
    values = pickNonNull(values, []);
  } else if (!isKnexQueryBuilder(values)) {
    values = [values];
  }

  return {
    method: 'whereIn',
    args: [asSingle(columns), values],
  };
}

function pickNonNull(values: unknown[], output: unknown[]): unknown[] {
  for (let i = 0, l = values.length; i < l; ++i) {
    const val = values[i];

    if (Array.isArray(val)) {
      pickNonNull(val, output);
    } else if (val !== null && val !== undefined) {
      output.push(val);
    }
  }

  return output;
}

export { WhereInCompositeSqliteOperation };
