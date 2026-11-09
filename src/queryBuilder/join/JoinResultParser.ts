import { JoinResultColumn } from './JoinResultColumn';
import { groupBy } from '../../utils/objectUtils';
import {
  hasDefaultFromDatabaseJson,
  cachedDatabaseRowWriter,
  findDatabaseRowWriter,
  columnProperty,
  isJsonProperty,
  parseJsonValue,
} from '../../model/modelDatabaseRows';
import type { DatabaseRowWriter } from '../../model/modelDatabaseRows';
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
  omitColumnAliases?: (string | null | undefined)[];
}

class JoinResultParser {
  declare tableTree: TableTree;
  declare omitColumnAliases: Set<string | null | undefined>;
  declare columnsByTableNode: Map<TableNode, JoinResultColumn[]> | null;
  declare rootModelsById: Map<string, ModelEntry> | null;
  declare rootModels: JoinModel[] | null;
  declare columnWriters: Map<TableNode, ColumnWriter | null> | null;

  constructor({ tableTree, omitColumnAliases = [] }: JoinResultParserArgs) {
    this.tableTree = tableTree;
    this.omitColumnAliases = new Set(omitColumnAliases);

    this.columnsByTableNode = null;
    this.rootModelsById = null;
    this.rootModels = null;
    this.columnWriters = null;
  }

  static create(args: JoinResultParserArgs) {
    return new JoinResultParser(args);
  }

  parse(flatRows: unknown): unknown {
    if (!Array.isArray(flatRows) || flatRows.length === 0) {
      return flatRows;
    }

    this._checkIdColumns(flatRows[0] as FlatRow);

    this.columnsByTableNode = this._createColumns(flatRows[0]);
    this.rootModelsById = new Map();
    this.rootModels = [];
    this.columnWriters = new Map();

    for (const flatRow of flatRows as FlatRow[]) {
      this._parseNode(this.tableTree.rootNode, flatRow, null, this.rootModelsById);
    }

    return this.rootModels;
  }

  // The flat rows are grouped into models by their ids. Without them, the rows
  // can't be told apart and would be merged into the wrong models (#2748).
  _checkIdColumns(row: FlatRow): void {
    for (const tableNode of this.tableTree.nodes) {
      const idColumns = tableNode.modelClass.getIdColumnArray();
      const hasIdColumns =
        idColumns.length > 0 &&
        idColumns.every((column) => Object.hasOwn(row, tableNode.getColumnAliasForColumn(column)));

      if (!hasIdColumns) {
        throw new Error(
          `withGraphJoined: the id column(s) [${idColumns.join(', ')}] of model ${tableNode.modelClass.name} ` +
            `are missing from the result, so the joined rows can't be grouped into models. ` +
            `withGraphJoined requires all models in the relation expression to have a primary key ` +
            `(idColumn) that exists in the table. Use withGraphFetched for models without one.`,
        );
      }
    }
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
    const modelClass = tableNode.modelClass;
    const columns = this.columnsByTableNode!.get(tableNode);
    let writer = this.columnWriters!.get(tableNode);
    let model: JoinModel | null = null;

    if (writer === undefined) {
      let rowWriter = cachedDatabaseRowWriter(modelClass);

      if (rowWriter === undefined) {
        if (hasDefaultFromDatabaseJson(modelClass)) {
          model = new modelClass();
          rowWriter = findDatabaseRowWriter(modelClass, model);
        } else {
          rowWriter = findDatabaseRowWriter(modelClass, null);
        }
      }

      writer = rowWriter === null ? null : createColumnWriter(rowWriter, columns);
      this.columnWriters!.set(tableNode, writer);
    }

    if (writer !== null) {
      model = writeColumns(writer, model ?? new modelClass(), flatRow);
    } else if (model !== null) {
      // What `fromDatabaseJson()` does with the model it creates.
      model.$setDatabaseJson(collectColumns(columns, flatRow));
    } else {
      model = modelClass.fromDatabaseJson(collectColumns(columns, flatRow));
    }

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

// The columns of a node written to its models directly, for model classes
// that keep the default database JSON methods, see `modelDatabaseRows`.
interface ColumnWriter {
  aliases: string[];
  props: string[];
  isJson: boolean[];
}

function createColumnWriter(
  rowWriter: DatabaseRowWriter,
  columns: JoinResultColumn[] | undefined,
): ColumnWriter {
  const aliases: string[] = [];
  const props: string[] = [];
  const isJson: boolean[] = [];

  for (const column of columns ?? []) {
    const prop = columnProperty(rowWriter, column.name);

    aliases.push(column.columnAlias);
    props.push(prop);
    isJson.push(isJsonProperty(rowWriter, prop));
  }

  return { aliases, props, isJson };
}

function writeColumns(writer: ColumnWriter, model: JoinModel, flatRow: FlatRow): JoinModel {
  const { aliases, props, isJson } = writer;

  for (let i = 0, l = props.length; i < l; ++i) {
    const value = flatRow[aliases[i]];
    model[props[i]] = isJson[i] ? parseJsonValue(value) : value;
  }

  return model;
}

function collectColumns(columns: JoinResultColumn[] | undefined, flatRow: FlatRow): FlatRow {
  const row: FlatRow = {};

  if (columns) {
    for (let i = 0, l = columns.length; i < l; ++i) {
      const column = columns[i];
      row[column.name] = flatRow[column.columnAlias];
    }
  }

  return row;
}

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
