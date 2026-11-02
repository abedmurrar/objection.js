import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import { isObject, asSingle } from '../../../utils/objectUtils';
import { isKnexQueryBuilder } from '../../../utils/knexUtils';
import type {
  KnexBuilder,
  KnexInstance,
  OperationOptions,
  QueryBuilder,
  RawBinding,
} from '../types';

class WhereInCompositeOperation extends ObjectionToKnexConvertingOperation {
  declare prefix: string | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.prefix = this.opt.prefix || null;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const whereInArgs = buildWhereInArgs(
      builder.knex(),
      ...(this.getKnexArgs(builder) as [unknown, unknown]),
    );

    if (this.prefix === 'not') {
      return knexBuilder.whereNotIn(...whereInArgs);
    } else {
      return knexBuilder.whereIn(...whereInArgs);
    }
  }

  clone(): this {
    const clone = super.clone();
    clone.prefix = this.prefix;
    return clone;
  }
}

function buildWhereInArgs(knex: KnexInstance, columns: unknown, values: unknown): unknown[] {
  if (isCompositeKey(columns)) {
    return buildCompositeArgs(knex, columns as unknown[], values);
  } else {
    return buildNonCompositeArgs(columns, values);
  }
}

function isCompositeKey(columns: unknown): boolean {
  return Array.isArray(columns) && columns.length > 1;
}

function buildCompositeArgs(knex: KnexInstance, columns: unknown[], values: unknown): unknown[] {
  if (Array.isArray(values)) {
    return buildCompositeValueArgs(columns, values);
  } else {
    return buildCompositeSubqueryArgs(knex, columns, values);
  }
}

function buildCompositeValueArgs(columns: unknown[], values: unknown[]): unknown[] {
  if (!Array.isArray(values[0])) {
    return [columns, [values]];
  } else {
    return [columns, values];
  }
}

function buildCompositeSubqueryArgs(
  knex: KnexInstance,
  columns: unknown[],
  subquery: unknown,
): unknown[] {
  const sql = `(${columns
    .map((col) => {
      // On older versions of knex, raw doesn't work
      // with `??`. We use `?` for those.
      if (isObject(col)) {
        return '?';
      } else {
        return '??';
      }
    })
    .join(',')})`;

  return [knex.raw(sql, columns as RawBinding[]), subquery];
}

function buildNonCompositeArgs(columns: unknown, values: unknown): unknown[] {
  if (Array.isArray(values)) {
    values = pickNonNull(values, []);
  } else if (!isKnexQueryBuilder(values)) {
    values = [values];
  }

  return [asSingle(columns), values];
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

export { WhereInCompositeOperation };
