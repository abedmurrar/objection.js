import { flatten } from '../../../utils/objectUtils';
import { Selection } from './Selection';
import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import type { KnexBuilder, OperationOptions, QueryBuilder } from '../types';

const COUNT_REGEX = /count/i;

class SelectOperation extends ObjectionToKnexConvertingOperation {
  declare selections: Selection[];

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);
    this.selections = [];
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
    return clone;
  }
}

export { SelectOperation };
