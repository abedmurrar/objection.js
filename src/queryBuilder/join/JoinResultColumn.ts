import type { TableNode } from './TableNode';
import type { TableTree } from './TableTree';

class JoinResultColumn {
  declare columnAlias: string;
  declare tableNode: TableNode;
  declare name: string;

  // The arguments are the properties of the column.
  constructor({ columnAlias, tableNode, name }: JoinResultColumn) {
    this.columnAlias = columnAlias;
    this.tableNode = tableNode;
    this.name = name;
  }

  static create({ tableTree, columnAlias }: { tableTree: TableTree; columnAlias: string }) {
    // The column aliases of the joined query are those of the table tree.
    const tableNode = tableTree.getNodeForColumnAlias(columnAlias)!;

    return new JoinResultColumn({
      columnAlias,
      tableNode,
      name: tableNode.getColumnForColumnAlias(columnAlias),
    });
  }
}

export { JoinResultColumn };
