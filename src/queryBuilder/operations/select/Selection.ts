import { isString, isObject } from '../../../utils/objectUtils';
import type { QueryBuilder } from '../types';

const ALIAS_REGEX = /\s+as\s+/i;

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
}

class Selection {
  declare table: string | null;
  declare column: string | null;
  // Undefined when a selection is created without an alias: `new Selection(table, '*')`.
  declare alias: string | null | undefined;
  declare readonly isObjectionSelection: true;

  constructor(table: string | null, column: string | null, alias?: string | null) {
    this.table = table;
    this.column = column;
    this.alias = alias;
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
    return null;
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
