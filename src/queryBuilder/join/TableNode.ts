import type { RelationExpression } from '../RelationExpression';
import type { FlatRow, JoinModelClass, JoinQueryBuilder, JoinRelation } from './RelationJoiner';
import type { TableTree } from './TableTree';

interface TableNodeArgs {
  tableTree: TableTree;
  modelClass: JoinModelClass;
  expression: RelationExpression;
  parentNode?: TableNode | null;
  relation?: JoinRelation | null;
}

type IdGetter = (flatRow: FlatRow) => string | null;

class TableNode {
  declare tableTree: TableTree;
  declare modelClass: JoinModelClass;
  declare parentNode: TableNode | null;
  // Null for the root node only.
  declare relation: JoinRelation | null;
  declare expression: RelationExpression;
  declare childNodes: TableNode[];
  declare alias: string;
  declare idGetter: IdGetter;

  constructor({
    tableTree,
    modelClass,
    expression,
    parentNode = null,
    relation = null,
  }: TableNodeArgs) {
    this.tableTree = tableTree;
    this.modelClass = modelClass;
    this.parentNode = parentNode;
    this.relation = relation;
    this.expression = expression;
    this.childNodes = [];

    this.alias = this._calculateAlias();
    this.idGetter = this._createIdGetter();
  }

  static create(args: TableNodeArgs) {
    const node = new TableNode(args);

    if (node.parentNode) {
      node.parentNode.childNodes.push(node);
    }

    return node;
  }

  get options() {
    return this.tableTree.options;
  }

  // Null for the root node only.
  get relationProperty() {
    return this.expression.node.$name;
  }

  getReferenceForColumn(column: string): string {
    return `${this.alias}.${column}`;
  }

  getColumnAliasForColumn(column: string): string {
    if (this.parentNode) {
      return `${this.alias}${this.options.separator}${column}`;
    } else {
      return column;
    }
  }

  getColumnForColumnAlias(columnAlias: string): string {
    const lastSepIndex = columnAlias.lastIndexOf(this.options.separator);

    if (lastSepIndex === -1) {
      return columnAlias;
    } else {
      return columnAlias.slice(lastSepIndex + this.options.separator.length);
    }
  }

  getIdFromFlatRow(flatRow: FlatRow): string | null {
    return this.idGetter(flatRow);
  }

  getJoinTableAlias(builder: JoinQueryBuilder): string | undefined {
    if (this.relation!.isObjectionManyToManyRelation) {
      return (
        builder.aliasFor(this.relation!.joinTableModelClass) ||
        this.modelClass.joinTableAlias(this.alias)
      );
    } else {
      return undefined;
    }
  }

  _calculateAlias() {
    if (this.parentNode) {
      // A child node always has a name.
      const relationName = this.expression.node.$name!;
      const alias = this.options.aliases[relationName] || relationName;

      if (this.options.minimize) {
        return `_t${this.tableTree.createNextUid()}`;
      } else if (this.parentNode.parentNode) {
        return `${this.parentNode.alias}${this.options.separator}${alias}`;
      } else {
        return alias;
      }
    } else {
      return this.tableTree.rootTableAlias;
    }
  }

  _createIdGetter() {
    const idColumns = this.modelClass.getIdColumnArray();
    const columnAliases = idColumns.map((column) => this.getColumnAliasForColumn(column));

    if (idColumns.length === 1) {
      return createIdGetter(columnAliases);
    } else {
      return createCompositeIdGetter(columnAliases);
    }
  }
}

function createIdGetter(columnAliases: string[]): IdGetter {
  const columnAlias = columnAliases[0];

  return (flatRow) => {
    const id = flatRow[columnAlias];

    if (id === null) {
      return null;
    }

    return `${id}`;
  };
}

function createCompositeIdGetter(columnAliases: string[]): IdGetter {
  if (columnAliases.length === 2) {
    return createTwoIdGetter(columnAliases);
  } else {
    return createMultiIdGetter(columnAliases);
  }
}

function createTwoIdGetter(columnAliases: string[]): IdGetter {
  const columnAlias1 = columnAliases[0];
  const columnAlias2 = columnAliases[1];

  return (flatRow) => {
    const id1 = flatRow[columnAlias1];
    const id2 = flatRow[columnAlias2];

    if (id1 === null || id2 === null) {
      return null;
    }

    return `${id1},${id2}`;
  };
}

function createMultiIdGetter(columnAliases: string[]): IdGetter {
  return (flatRow) => {
    let idStr = '';

    for (let i = 0, l = columnAliases.length; i < l; ++i) {
      const columnAlias = columnAliases[i];
      const id = flatRow[columnAlias];

      if (id === null) {
        return null;
      }

      idStr += id;

      if (i !== l - 1) {
        idStr += ',';
      }
    }

    return idStr;
  };
}

export { TableNode };
