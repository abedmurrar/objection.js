import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import { flatten, zipObject, isString } from '../../../utils/objectUtils';
import { getTempColumn } from '../../../utils/tmpColumnUtils';
import type {
  KnexBuilder,
  KnexInstance,
  OperationOptions,
  QueryBuilder,
  RawBinding,
} from '../types';

class WhereInCompositeMsSqlOperation extends ObjectionToKnexConvertingOperation {
  declare prefix: string | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.prefix = this.opt.prefix || null;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const args = this.getKnexArgs(builder);
    return this.build(builder.knex(), knexBuilder, args[0], args[1]);
  }

  build(
    knex: KnexInstance,
    knexBuilder: KnexBuilder,
    columns: string | string[],
    values: unknown,
  ): KnexBuilder {
    const isCompositeKey = Array.isArray(columns) && columns.length > 1;

    if (isCompositeKey) {
      return this.buildComposite(knex, knexBuilder, columns as string[], values);
    } else {
      return this.buildNonComposite(knexBuilder, columns, values);
    }
  }

  buildComposite(
    knex: KnexInstance,
    knexBuilder: KnexBuilder,
    columns: string[],
    values: unknown,
  ): KnexBuilder {
    if (Array.isArray(values) && values.length === 0) {
      // knex turns an empty `whereIn` into `1 = 0` and an empty `whereNotIn`
      // into `1 = 1` (#1914). The columns don't matter then.
      return this.whereIn(knexBuilder, columns[0], []);
    }

    const helperColumns = columns.map((_, index) => getTempColumn(index));

    if (Array.isArray(values)) {
      return this.buildCompositeValue(knex, knexBuilder, columns, helperColumns, values);
    } else {
      // A subquery.
      return this.buildCompositeSubquery(
        knex,
        knexBuilder,
        columns,
        helperColumns,
        (values as KnexBuilder).as(knex.raw(`V(${helperColumns.map((_) => '??')})`, helperColumns)),
      );
    }
  }

  buildCompositeValue(
    knex: KnexInstance,
    knexBuilder: KnexBuilder,
    columns: string[],
    helperColumns: string[],
    values: unknown[][],
  ): KnexBuilder {
    return this.buildCompositeSubquery(
      knex,
      knexBuilder,
      columns,
      helperColumns,
      knex.raw(
        `(VALUES ${values
          .map((value) => `(${value.map((_) => '?').join(',')})`)
          .join(',')}) AS V(${helperColumns.map((_) => '??').join(',')})`,
        flatten(values).concat(helperColumns) as RawBinding[],
      ),
    );
  }

  buildCompositeSubquery(
    knex: KnexInstance,
    knexBuilder: KnexBuilder,
    columns: string[],
    helperColumns: string[],
    subQuery: KnexBuilder,
  ): KnexBuilder {
    const wrapperQuery = knex.from(subQuery).where(
      zipObject(
        helperColumns,
        columns.map((column) => knex.raw('??', column)),
      ),
    );

    if (this.prefix === 'not') {
      return knexBuilder.whereNotExists(wrapperQuery);
    } else {
      return knexBuilder.whereExists(wrapperQuery);
    }
  }

  buildNonComposite(
    knexBuilder: KnexBuilder,
    columns: string | string[],
    values: unknown,
  ): KnexBuilder {
    const col = isString(columns) ? columns : columns[0];

    if (Array.isArray(values)) {
      values = pickNonNull(values, []);
    } else {
      values = [values];
    }

    return this.whereIn(knexBuilder, col, values);
  }

  whereIn(knexBuilder: KnexBuilder, col: string, val: unknown): KnexBuilder {
    if (this.prefix === 'not') {
      return knexBuilder.whereNotIn(col, val);
    } else {
      return knexBuilder.whereIn(col, val);
    }
  }
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

export { WhereInCompositeMsSqlOperation };
