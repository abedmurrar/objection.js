import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import { isKnexQueryBuilder } from '../../../utils/knexUtils';
import { asSingle } from '../../../utils/objectUtils';
import type { KnexBuilder, OperationOptions, QueryBuilder } from '../types';

interface WhereArgs {
  method: 'where' | 'whereIn';
  args: unknown[];
}

class WhereInCompositeSqliteOperation extends ObjectionToKnexConvertingOperation {
  declare prefix: string | null;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);
    this.prefix = this.opt.prefix || null;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const { method, args } = buildWhereArgs(...(this.getKnexArgs(builder) as [unknown, unknown]));

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

  clone(): this {
    const clone = super.clone();
    clone.prefix = this.prefix;
    return clone;
  }
}

function buildWhereArgs(columns: unknown, values: unknown): WhereArgs {
  if (isCompositeKey(columns)) {
    return buildCompositeArgs(columns as unknown[], values);
  } else {
    return buildNonCompositeArgs(columns, values);
  }
}

function isCompositeKey(columns: unknown): boolean {
  return Array.isArray(columns) && columns.length > 1;
}

function buildCompositeArgs(columns: unknown[], values: unknown): WhereArgs {
  if (!Array.isArray(values)) {
    // If the `values` is not an array of values but a function or a subquery
    // we have no way to implement this method.
    throw new Error(`sqlite doesn't support multi-column where in clauses`);
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
              builder.andWhere(col, val[idx]);
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
