import { GraphOperation } from '../GraphOperation';
import { GraphRecursiveUpsertAction } from './GraphRecursiveUpsertAction';
import type { GraphModel } from '../GraphData';

class GraphRecursiveUpsert extends GraphOperation {
  createActions(): GraphRecursiveUpsertAction[] {
    return [
      new GraphRecursiveUpsertAction(this.graphData, {
        nodes: this.graph.nodes.filter((node) => {
          const shouldRelate = this.graphOptions.shouldRelate(node, this.graphData);
          return shouldRelate && hasRelations(node.obj);
        }),
      }),
    ];
  }
}

function hasRelations(obj: GraphModel): boolean {
  for (const relationName of obj.constructor.getRelationNames()) {
    if (obj[relationName] !== undefined) {
      return true;
    }
  }

  return false;
}

export { GraphRecursiveUpsert };
