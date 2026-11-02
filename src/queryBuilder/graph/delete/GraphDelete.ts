import { GraphOperation } from '../GraphOperation';
import { GraphDeleteAction } from './GraphDeleteAction';

class GraphDelete extends GraphOperation {
  createActions(): GraphDeleteAction[] {
    return [
      new GraphDeleteAction(this.graphData, {
        nodes: this.currentGraph.nodes.filter((currentNode) =>
          this.graphOptions.shouldDeleteOrUnrelate(currentNode, this.graphData),
        ),
      }),
    ];
  }
}

export { GraphDelete };
