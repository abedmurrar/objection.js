import { GraphOperation } from '../GraphOperation';
import { GraphPatchAction } from './GraphPatchAction';

class GraphPatch extends GraphOperation {
  createActions(): GraphPatchAction[] {
    return [
      new GraphPatchAction(this.graphData, {
        nodes: this.graph.nodes.filter((node) =>
          this.graphOptions.shouldPatchOrUpdateIgnoreDisable(node, this.graphData),
        ),
      }),
    ];
  }
}

export { GraphPatch };
