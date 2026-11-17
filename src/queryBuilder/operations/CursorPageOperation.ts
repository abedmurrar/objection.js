import { QueryBuilderOperation } from './QueryBuilderOperation';
import { withWhereScope } from '../whereScopes';
import { JoinEagerOperation } from './eager/JoinEagerOperation';
import { isObject } from '../../utils/objectUtils';
import { ValidationErrorType } from '../../model/ValidationError';
import type { Model, OperationOptions, QueryBuilder } from './types';

// The longest cursor that `cursorPage()` decodes. A cursor holds one value per
// sort column, so a longer one isn't a cursor that `cursorPage()` made.
const MAX_CURSOR_LENGTH = 4096;

interface CursorKey {
  // The column as the query sorts by it, maybe with the table.
  column: string;
  // The property of the models that holds its value.
  property: string;
  desc: boolean;
}

interface CursorPage {
  results: unknown;
  next: string | null;
}

// `cursorPage(limit, after)`: the rows after the cursor, in the order of the
// query's `orderBy()` columns and then the id columns, and a cursor for the
// next page. No count query, and as fast on the last page as on the first.
class CursorPageOperation extends QueryBuilderOperation {
  declare limit: number;
  declare after: string | null;
  declare keys: CursorKey[];
  declare next: string | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.limit = 0;
    this.after = null;
    this.keys = [];
    this.next = null;
  }

  onAdd(_: QueryBuilder, args: unknown[]): boolean {
    const [limit, after] = args;

    if (!Number.isSafeInteger(limit) || (limit as number) < 1) {
      throw new Error(`cursorPage(): the limit must be a positive integer, got ${String(limit)}.`);
    }

    if (after !== undefined && after !== null && typeof after !== 'string') {
      throw new Error('cursorPage(): the cursor must be a string, null or undefined.');
    }

    this.limit = limit as number;
    this.after = (after as string | null | undefined) ?? null;
    return true;
  }

  // Fails before the other hooks run, like the one of `withGraphJoined()` that
  // reads the columns of the tables.
  onBefore1(builder: QueryBuilder, result: unknown): unknown {
    assertCursorPageable(builder);
    return result;
  }

  // Checks the operations that `onBuild()` added, too.
  onBuild(builder: QueryBuilder): void {
    assertCursorPageable(builder);

    const keys = cursorKeys(builder);
    this.keys = keys;

    if (this.after !== null) {
      const values = decodeCursor(builder, this.after, keys.length);
      withWhereScope(builder, () =>
        builder.where((qb: QueryBuilder) => whereAfter(qb, keys, values)),
      );
    }

    // One row more than the page tells if there's a next page.
    builder.limit(this.limit + 1);
  }

  // Before the relations are loaded and the `afterFind()` hooks run, so that
  // they only see the models of the page.
  onAfter1(builder: QueryBuilder, result: unknown): unknown {
    this.next = null;

    if (Array.isArray(result) && result.length > this.limit) {
      result.length = this.limit;
      this.next = encodeCursor(builder, this.keys, result[result.length - 1] as Model);
    }

    return result;
  }

  onAfter3(_: QueryBuilder, results: unknown): CursorPage {
    return { results, next: this.next };
  }

  clone(): this {
    const clone = super.clone();
    clone.limit = this.limit;
    clone.after = this.after;
    clone.keys = this.keys;
    clone.next = this.next;
    return clone;
  }
}

function assertCursorPageable(builder: QueryBuilder): void {
  let reason: string | null = null;

  if (!builder.isFind()) {
    reason = 'only queries that find rows can be paged';
  } else if (builder.has(/^(limit|offset|range|first)$/)) {
    reason =
      "it sets the limit itself, and can't be used with limit(), offset(), page(), range() or first()";
  } else if (
    builder.hasWithGraph() &&
    builder.operationsSummary().eagerOperation instanceof JoinEagerOperation
  ) {
    reason =
      "it can't be used with withGraphJoined(), whose rows aren't one per model. Use withGraphFetched()";
  }

  if (reason !== null) {
    throw new Error(`cursorPage(): ${reason}.`);
  }
}

// The sort columns of the query, then the id columns that aren't among them,
// so that every row has its own place in the order.
function cursorKeys(builder: QueryBuilder): CursorKey[] {
  const modelClass = builder.resultModelClass();
  const tableRef = builder.tableRef();
  const keys: CursorKey[] = [];

  builder.forEachOperation(/^orderBy/, (op) => {
    if (op.name !== 'orderBy') {
      throw new Error(
        `cursorPage(): it can't be used with ${op.name}(), only with orderBy() columns.`,
      );
    }

    const args = (op as unknown as { args: unknown[] }).args;

    if (Array.isArray(args[0])) {
      for (const item of args[0]) {
        if (typeof item === 'string') {
          keys.push(createKey(modelClass, item, undefined));
        } else if (isObject(item) && typeof (item as { column?: unknown }).column === 'string') {
          const { column, order } = item as { column: string; order?: unknown };
          keys.push(createKey(modelClass, column, order));
        } else {
          throw orderByError();
        }
      }
    } else if (typeof args[0] === 'string') {
      keys.push(createKey(modelClass, args[0], args[1]));
    } else {
      throw orderByError();
    }
  });

  for (const idColumn of modelClass.getIdColumnArray()) {
    const sorted = keys.some(
      (key) => key.column === idColumn || key.column === `${tableRef}.${idColumn}`,
    );

    if (!sorted) {
      const column = `${tableRef}.${idColumn}`;
      builder.orderBy(column, 'asc');
      keys.push(createKey(modelClass, column, 'asc'));
    }
  }

  return keys;
}

function createKey(
  modelClass: ReturnType<QueryBuilder['resultModelClass']>,
  column: string,
  order: unknown,
): CursorKey {
  if (order !== undefined && order !== null && !/^(asc|desc)$/i.test(String(order))) {
    throw new Error(`cursorPage(): the order of ${column} must be 'asc' or 'desc'.`);
  }

  const dot = column.lastIndexOf('.');
  const columnName = dot === -1 ? column : column.slice(dot + 1);

  return {
    column,
    property: modelClass.columnNameToPropertyName(columnName),
    desc: typeof order === 'string' && order.toLowerCase() === 'desc',
  };
}

function orderByError(): Error {
  return new Error(
    'cursorPage(): the orderBy() arguments must be column names, optionally with an order.',
  );
}

// `a > ? or (a = ? and b > ?) or ...`, with `<` for descending columns, which
// works on every database and with mixed directions. The first column also gets
// `a >= ?`, so that the database can use an index on it for the range.
function whereAfter(qb: QueryBuilder, keys: CursorKey[], values: unknown[]): void {
  const first = keys[0];
  qb.where(first.column, first.desc ? '<=' : '>=', values[0]);

  qb.where((or: QueryBuilder) => {
    for (let i = 0; i < keys.length; ++i) {
      or.orWhere((and: QueryBuilder) => {
        for (let j = 0; j < i; ++j) {
          and.where(keys[j].column, values[j]);
        }

        and.where(keys[i].column, keys[i].desc ? '<' : '>', values[i]);
      });
    }
  });
}

// A cursor is the values of the sort columns of the last row of a page, as
// base64url-encoded JSON. Dates are kept as `{ "$date": iso string }`.
function encodeCursor(builder: QueryBuilder, keys: CursorKey[], model: Model): string {
  const values = keys.map((key) => {
    const value = (model as Record<string, unknown>)[key.property];

    if (value === undefined) {
      throw new Error(
        `cursorPage(): the rows have no ${key.property} property for the sort column ${key.column}. Select the column.`,
      );
    }

    if (value === null) {
      throw new Error(
        `cursorPage(): the sort column ${key.column} is null in a row. Sort by columns that can't be null.`,
      );
    }

    if (value instanceof Date) {
      return { $date: value.toISOString() };
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (!isCursorScalar(value)) {
      throw new Error(
        `cursorPage(): the sort column ${key.column} has a value that isn't a string, number, boolean or date.`,
      );
    }

    return value;
  });

  return Buffer.from(JSON.stringify(values)).toString('base64url');
}

function decodeCursor(builder: QueryBuilder, cursor: string, keyCount: number): unknown[] {
  let values: unknown = null;

  if (cursor.length <= MAX_CURSOR_LENGTH && /^[A-Za-z0-9_-]+$/.test(cursor)) {
    try {
      values = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      values = null;
    }
  }

  if (!Array.isArray(values) || values.length !== keyCount) {
    throw invalidCursor(builder);
  }

  return values.map((value) => {
    if (isCursorScalar(value)) {
      return value;
    }

    if (isObject(value)) {
      const keys = Object.keys(value as object);
      const date = (value as { $date?: unknown }).$date;

      if (keys.length === 1 && typeof date === 'string') {
        const parsed = new Date(date);

        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
    }

    throw invalidCursor(builder);
  });
}

function isCursorScalar(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function invalidCursor(builder: QueryBuilder): Error {
  return builder.modelClass().createValidationError({
    type: ValidationErrorType.InvalidCursor,
    message: 'cursorPage(): invalid cursor.',
    data: {},
  });
}

export { CursorPageOperation };
