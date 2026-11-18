import { isString, isObject, isPlainObject } from '../../../utils/objectUtils';
import { isKnexQueryBuilder, isKnexRaw } from '../../../utils/knexUtils';
import type { QueryBuilder } from '../types';

const ALIAS_REGEX = /\s+as\s+/i;

// An alias at the end of raw SQL: `as "alias"`, `as \`alias\``, `as [alias]`,
// `as ??`, `as :name:` or `as alias`.
const RAW_ALIAS_REGEX =
  /\s+as\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\?\?)|:(\w+):|([a-z_][\w$]*))\s*$/i;

// A `ReferenceBuilder`.
interface ReferenceLike {
  isObjectionReferenceBuilder: true;
  tableName: string | null;
  column: string | null;
  alias: string | null;
}

// A `RawBuilder`.
interface RawLike {
  isObjectionRawBuilder: true;
  alias: string | null;
  _sql: string;
  _args: unknown[];
}

// An objection query builder used as a selection, a subquery.
interface QueryBuilderLike {
  isObjectionQueryBuilderBase: true;
  findLastOperation(name: string): { args?: unknown[] } | null;
}

class Selection {
  declare table: string | null;
  declare column: string | null;
  // Undefined when a selection is created without an alias: `new Selection(table, '*')`.
  declare alias: string | null | undefined;
  // Subqueries with `as()` and raw SQL that ends with an alias, which weren't
  // recognized as selections before. They don't count when `withGraphJoined()`
  // decides whether all columns are selected, so that it selects the same other
  // columns as before (#2365).
  declare keepsSelectAll: boolean;
  declare readonly isObjectionSelection: true;

  constructor(table: string | null, column: string | null, alias?: string | null) {
    this.table = table;
    this.column = column;
    this.alias = alias;
    this.keepsSelectAll = false;
  }

  get name(): string | null {
    return this.alias || this.column;
  }

  static create(selection: unknown): Selection | null {
    if (isObject(selection)) {
      const obj = selection as Partial<Selection & ReferenceLike & RawLike>;

      if (obj.isObjectionSelection) {
        return selection as Selection;
      } else if (obj.isObjectionReferenceBuilder) {
        return createSelectionFromReference(selection as ReferenceLike);
      } else if (obj.isObjectionRawBuilder) {
        return createSelectionFromRaw(selection as RawLike);
      } else if ((selection as Partial<QueryBuilderLike>).isObjectionQueryBuilderBase) {
        return createSelectionFromQueryBuilder(selection as QueryBuilderLike);
      } else if (isKnexQueryBuilder(selection)) {
        const single = (selection as { _single?: { as?: unknown } })._single;
        return createSelectionFromAlias(single ? single.as : null);
      } else if (isKnexRaw(selection)) {
        const raw = selection as { sql?: unknown; bindings?: unknown };
        return createSelectionFromAlias(parseRawAlias(raw.sql, raw.bindings));
      } else {
        return null;
      }
    } else if (isString(selection)) {
      return createSelectionFromString(selection);
    } else {
      return null;
    }
  }

  /**
   * Returns true if `selectionInBuilder` causes `selectionToTest` to be selected.
   *
   * Examples that return true:
   *
   * doesSelect(Person.query(), '*', 'name')
   * doesSelect(Person.query(), 'Person.*', 'name')
   * doesSelect(Person.query(), 'name', 'name')
   * doesSelect(Person.query(), 'name', 'Person.name')
   */
  static doesSelect(
    builder: QueryBuilder,
    selectionInBuilder: unknown,
    selectionToTest: unknown,
  ): boolean {
    selectionInBuilder = Selection.create(selectionInBuilder);
    selectionToTest = Selection.create(selectionToTest);

    // Both must be selections. Others throw here.
    const inBuilder = selectionInBuilder as Selection;
    const toTest = selectionToTest as Selection;

    if (inBuilder.column === '*') {
      if (inBuilder.table) {
        if (toTest.column === '*') {
          return toTest.table === inBuilder.table;
        } else {
          return toTest.table === null || toTest.table === inBuilder.table;
        }
      } else {
        return true;
      }
    } else {
      const selectionInBuilderTable = inBuilder.table || builder.tableRef();

      if (toTest.column === '*') {
        return false;
      } else {
        return (
          toTest.column === inBuilder.column &&
          (toTest.table === null || toTest.table === selectionInBuilderTable)
        );
      }
    }
  }
}

Object.defineProperties(Selection.prototype, {
  isObjectionSelection: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

function createSelectionFromReference(ref: ReferenceLike): Selection {
  return new Selection(ref.tableName, ref.column, ref.alias);
}

function createSelectionFromRaw(raw: RawLike): Selection | null {
  if (raw.alias) {
    return new Selection(null, null, raw.alias);
  } else {
    return createSelectionFromAlias(parseRawAlias(raw._sql, raw._args));
  }
}

// A subquery aliased with `as()` selects a column named by the alias.
function createSelectionFromQueryBuilder(builder: QueryBuilderLike): Selection | null {
  const asOperation = builder.findLastOperation('as');
  return createSelectionFromAlias(asOperation && asOperation.args ? asOperation.args[0] : null);
}

function createSelectionFromAlias(alias: unknown): Selection | null {
  if (!isString(alias)) {
    return null;
  }

  const selection = new Selection(null, null, alias);
  selection.keepsSelectAll = true;
  return selection;
}

// The alias that raw SQL ends with, with the bindings of `as ??` and
// `as :name:`.
function parseRawAlias(sql: unknown, bindings: unknown): string | null {
  const match = isString(sql) ? RAW_ALIAS_REGEX.exec(sql) : null;

  if (!match) {
    return null;
  }

  const [, doubleQuoted, backQuoted, bracketQuoted, binding, namedBinding, unquoted] = match;

  if (binding) {
    const value = Array.isArray(bindings) ? bindings[bindings.length - 1] : null;
    return isString(value) ? value : null;
  } else if (namedBinding) {
    // `raw(sql, { name: value })` of objection keeps the object in an array.
    const named = Array.isArray(bindings) && bindings.length === 1 ? bindings[0] : bindings;
    const value = isPlainObject(named) ? (named as Record<string, unknown>)[namedBinding] : null;
    return isString(value) ? value : null;
  } else if (unquoted) {
    // Some databases, like postgres, fold unquoted identifiers to lower case and
    // others don't, so only lower case ones are the same on every database.
    return unquoted === unquoted.toLowerCase() ? unquoted : null;
  } else {
    return doubleQuoted || backQuoted || bracketQuoted || null;
  }
}

function createSelectionFromString(selection: string): Selection {
  let table: string | null = null;
  let column: string | null = null;
  let alias: string | null = null;

  if (ALIAS_REGEX.test(selection)) {
    const parts = selection.split(ALIAS_REGEX);

    selection = parts[0].trim();
    alias = parts[1].trim();
  }

  const dotIdx = selection.lastIndexOf('.');

  if (dotIdx !== -1) {
    table = selection.substr(0, dotIdx);
    column = selection.substr(dotIdx + 1);
  } else {
    column = selection;
  }

  return new Selection(table, column, alias);
}

export { Selection };
