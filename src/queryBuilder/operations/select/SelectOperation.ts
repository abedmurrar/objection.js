import { flatten, isString, isPlainObject } from '../../../utils/objectUtils';
import { Selection } from './Selection';
import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import type { KnexBuilder, OperationOptions, QueryBuilder } from '../types';

const COUNT_REGEX = /count/i;
const ALIAS_REGEX = /\s+as\s+/i;

const AGGREGATE_METHODS = new Set([
  'count',
  'countDistinct',
  'min',
  'max',
  'sum',
  'sumDistinct',
  'avg',
  'avgDistinct',
]);

class SelectOperation extends ObjectionToKnexConvertingOperation {
  declare selections: Selection[];
  // The columns that an aggregate selects: its aliases, which `withGraphJoined()`
  // selects from the joined subqueries. `null` for other select operations.
  declare aggregateSelections: Selection[] | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.selections = [];
    this.aggregateSelections = AGGREGATE_METHODS.has(name as string) ? [] : null;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    const selections: unknown[] = flatten(args);

    // Don't add an empty selection. Empty list is accepted for `count`, `countDistinct`
    // etc. because knex apparently supports it.
    if (selections.length === 0 && !COUNT_REGEX.test(this.name as string)) {
      return false;
    }

    const ret = super.onAdd(builder, selections);

    for (const selection of selections) {
      const selectionInstance = Selection.create(selection);

      if (selectionInstance) {
        this.selections.push(selectionInstance);
      }
    }

    if (this.aggregateSelections !== null) {
      this.aggregateSelections = getAggregateAliases(selections).map(
        (alias) => new Selection(null, null, alias),
      );
    }

    return ret;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    return knexBuilder[this.name as string].apply(knexBuilder, this.getKnexArgs(builder));
  }

  findSelection(builder: QueryBuilder, selectionToFind: unknown): Selection | null {
    const selectionInstanceToFind = Selection.create(selectionToFind);

    if (!selectionInstanceToFind) {
      return null;
    }

    for (const selection of this.selections) {
      if (Selection.doesSelect(builder, selection, selectionInstanceToFind)) {
        return selection;
      }
    }

    return null;
  }

  clone(): this {
    const clone = super.clone();
    clone.selections = this.selections.slice();
    clone.aggregateSelections = this.aggregateSelections && this.aggregateSelections.slice();
    return clone;
  }
}

// The aliases of the columns that an aggregate selects, in knex's forms:
// `count('col as alias')`, `count('col', { as: 'alias' })` and
// `count({ alias: 'col' })`. Aggregates without an alias are left out, as the
// name of their column differs between databases.
function getAggregateAliases([column, options]: unknown[]): string[] {
  if (isString(column) && ALIAS_REGEX.test(column)) {
    return [column.split(ALIAS_REGEX)[1].trim()];
  } else if (isPlainObject(options) && isString((options as { as?: unknown }).as)) {
    return [(options as { as: string }).as];
  } else if (isPlainObject(column)) {
    return Object.keys(column as object);
  } else {
    return [];
  }
}

export { SelectOperation };
