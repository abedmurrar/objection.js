import { JoinResultColumn } from './JoinResultColumn';
import { groupBy } from '../../utils/objectUtils';
import type { FlatRow, JoinModel } from './RelationJoiner';
import type { TableNode } from './TableNode';
import type { TableTree } from './TableTree';

// A model that was created, and the models of its child nodes that were
// created under it, by id. One map for each child node.
interface ModelEntry {
  model: JoinModel;
  childModelsById: Map<string, ModelEntry>[];
}

interface JoinResultParserArgs {
  tableTree: TableTree;
  omitColumnAliases?: (string | null)[];
}

class JoinResultParser {
  declare tableTree: TableTree;
  declare omitColumnAliases: Set<string | null>;
  declare columnsByTableNode: Map<TableNode, JoinResultColumn[]> | null;
  declare rootModelsById: Map<string, ModelEntry> | null;
  declare rootModels: JoinModel[] | null;

  constructor({ tableTree, omitColumnAliases = [] }: JoinResultParserArgs) {
    this.tableTree = tableTree;
    this.omitColumnAliases = new Set(omitColumnAliases);

    this.columnsByTableNode = null;
    this.rootModelsById = null;
    this.rootModels = null;
  }

  static create(args: JoinResultParserArgs) {
    return new JoinResultParser(args);
  }

  parse(flatRows: unknown): unknown {
    if (!Array.isArray(flatRows) || flatRows.length === 0) {
      return flatRows;
    }

    this.columnsByTableNode = this._createColumns(flatRows[0]);
    this.rootModelsById = new Map();
    this.rootModels = [];

    for (const flatRow of flatRows as FlatRow[]) {
      this._parseNode(this.tableTree.rootNode, flatRow, null, this.rootModelsById);
    }

    return this.rootModels;
  }

  // `modelsById` holds the models of `tableNode` that were already created
  // under `parentModel`. Every created model gets a map like it for each of
  // its child nodes.
  _parseNode(
    tableNode: TableNode,
    flatRow: FlatRow,
    parentModel: JoinModel | null,
    modelsById: Map<string, ModelEntry>,
  ): void {
    const id = tableNode.getIdFromFlatRow(flatRow);

    if (id === null) {
      return;
    }

    let entry = modelsById.get(id);

    if (entry === undefined) {
      const model = this._createModel(tableNode, flatRow);
      this._addToParent(tableNode, model, parentModel);

      entry = { model, childModelsById: createChildMaps(tableNode) };
      modelsById.set(id, entry);
    }

    const childNodes = tableNode.childNodes;

    for (let i = 0, l = childNodes.length; i < l; ++i) {
      this._parseNode(childNodes[i], flatRow, entry.model, entry.childModelsById[i]);
    }
  }

  _createModel(tableNode: TableNode, flatRow: FlatRow): JoinModel {
    const row: FlatRow = {};
    const columns = this.columnsByTableNode!.get(tableNode);

    if (columns) {
      for (let i = 0, l = columns.length; i < l; ++i) {
        const column = columns[i];
        row[column.name] = flatRow[column.columnAlias];
      }
    }

    const model = tableNode.modelClass.fromDatabaseJson(row);

    // The child nodes and the node of a parent model always have a relation
    // and a relation property.
    for (const childNode of tableNode.childNodes) {
      if (childNode.relation!.isOneToOne()) {
        model[childNode.relationProperty!] = null;
      } else {
        model[childNode.relationProperty!] = [];
      }
    }

    return model;
  }

  _addToParent(tableNode: TableNode, model: JoinModel, parentModel: JoinModel | null): void {
    if (tableNode.parentNode) {
      if (tableNode.relation!.isOneToOne()) {
        parentModel![tableNode.relationProperty!] = model;
      } else {
        parentModel![tableNode.relationProperty!].push(model);
      }
    } else {
      // Root model. Add to root list.
      this.rootModels!.push(model);
    }
  }

  _createColumns(row: FlatRow): Map<TableNode, JoinResultColumn[]> {
    const columns = Object.keys(row)
      .map((columnAlias) => JoinResultColumn.create({ tableTree: this.tableTree, columnAlias }))
      // The omitted columns are filtered here once instead of for every model.
      .filter((column) => !this.omitColumnAliases.has(column.columnAlias));

    return groupBy(columns, getTableNode);
  }
}

function getTableNode(column: JoinResultColumn): TableNode {
  return column.tableNode;
}

const NO_CHILD_MAPS: Map<string, ModelEntry>[] = [];

function createChildMaps(tableNode: TableNode): Map<string, ModelEntry>[] {
  const childNodes = tableNode.childNodes;

  if (childNodes.length === 0) {
    return NO_CHILD_MAPS;
  }

  const maps: Map<string, ModelEntry>[] = new Array(childNodes.length);

  for (let i = 0, l = childNodes.length; i < l; ++i) {
    maps[i] = new Map();
  }

  return maps;
}

export { JoinResultParser };
