import type { RelationExpression } from '../RelationExpression';
import { forEachChildExpression } from './utils';
import { TableNode } from './TableNode';
import type { JoinOptions } from './RelationJoiner';
import type { ModelClass } from '../operations/types';

interface TableTreeArgs {
  expression: RelationExpression;
  rootModelClass: ModelClass;
  rootTableAlias: string;
  options: JoinOptions;
}

// The arguments of `_createNodes()` and the methods it calls.
interface NodesArgs {
  expression: RelationExpression;
  modelClass: ModelClass;
}

class TableTree {
  declare options: JoinOptions;
  declare rootModelClass: ModelClass;
  declare rootTableAlias: string;
  declare nodes: TableNode[];
  declare nodesByAlias: Map<string, TableNode>;
  declare uidCounter: number;

  constructor({ expression, rootModelClass, rootTableAlias, options }: TableTreeArgs) {
    this.options = options;
    this.rootModelClass = rootModelClass;
    this.rootTableAlias = rootTableAlias;
    this.nodes = [];
    this.nodesByAlias = new Map();
    this.uidCounter = 0;

    this._createNodes({ expression, modelClass: rootModelClass });
  }

  static create(args: TableTreeArgs) {
    return new TableTree(args);
  }

  get rootNode() {
    return this.nodes[0];
  }

  getNodeForColumnAlias(columnAlias: string): TableNode | undefined {
    const lastSepIndex = columnAlias.lastIndexOf(this.options.separator);

    if (lastSepIndex === -1) {
      return this.rootNode;
    } else {
      const tableAlias = columnAlias.slice(0, lastSepIndex);
      return this.nodesByAlias.get(tableAlias);
    }
  }

  createNextUid() {
    return this.uidCounter++;
  }

  _createNodes({ expression, modelClass }: NodesArgs) {
    const rootNode = this._createRootNode({ expression, modelClass });
    this._createChildNodes({ expression, modelClass, parentNode: rootNode });

    for (const node of this.nodes) {
      this.nodesByAlias.set(node.alias, node);
    }
  }

  _createRootNode({ expression, modelClass }: NodesArgs) {
    const node = TableNode.create({
      tableTree: this,
      modelClass,
      expression,
    });

    this.nodes.push(node);
    return node;
  }

  _createChildNodes({ expression, modelClass, parentNode }: NodesArgs & { parentNode: TableNode }) {
    forEachChildExpression(expression, modelClass, (childExpr, relation) => {
      // `relation` is only null for a recursive relation that doesn't exist.
      // Reading its `relatedModelClass` then throws a TypeError.
      // `Relation` types its model classes as `RelationModelClass`. They are
      // full model classes.
      const node = TableNode.create({
        tableTree: this,
        modelClass: relation!.relatedModelClass!,
        expression: childExpr,

        parentNode,
        relation,
      });

      this.nodes.push(node);

      this._createChildNodes({
        expression: childExpr,
        modelClass: relation!.relatedModelClass!,
        parentNode: node,
      });
    });
  }
}

export { TableTree };
