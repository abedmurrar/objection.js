import { ObjectionToKnexConvertingOperation } from './ObjectionToKnexConvertingOperation';
import { asSingle } from '../../utils/objectUtils';
import type { KnexBuilder, QueryBuilder } from './types';

class WhereCompositeOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const args = this.getKnexArgs(builder);

    if (args.length === 2) {
      // Convert whereComposite('foo', 1) into whereComposite('foo', '=', 1)
      args.splice(1, 0, '=');
    } else if (args.length !== 3) {
      throw new Error(`invalid number of arguments ${args.length}`);
    }

    return knexBuilder.where(...buildWhereArgs(...(args as [unknown, string, unknown])));
  }
}

function buildWhereArgs(cols: unknown, op: string, values: unknown): unknown[] {
  if (isNormalWhere(cols, values)) {
    return buildNormalWhereArgs(cols, op, values);
  } else if (isCompositeWhere(cols, values)) {
    return buildCompositeWhereArgs(cols as unknown[], op, values as unknown[]);
  } else {
    throw new Error(`both cols and values must have same dimensions`);
  }
}

function isNormalWhere(cols: unknown, values: unknown): boolean {
  return (
    (!Array.isArray(cols) || cols.length === 1) && (!Array.isArray(values) || values.length === 1)
  );
}

function buildNormalWhereArgs(cols: unknown, op: string, values: unknown): unknown[] {
  return [asSingle(cols), op, asSingle(values)];
}

function isCompositeWhere(cols: unknown, values: unknown): boolean {
  return Array.isArray(cols) && Array.isArray(values) && cols.length === values.length;
}

function buildCompositeWhereArgs(cols: unknown[], op: string, values: unknown[]): unknown[] {
  return [
    (builder: KnexBuilder) => {
      for (let i = 0, l = cols.length; i < l; ++i) {
        builder.where(cols[i], op, values[i]);
      }
    },
  ];
}

export { WhereCompositeOperation };
