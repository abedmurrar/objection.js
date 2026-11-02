import type { GraphData } from './GraphData';
import type { GraphAction } from './GraphAction';

class GraphOperation {
  declare graphData: GraphData;

  constructor(graphData: GraphData) {
    this.graphData = graphData;
  }

  get graph(): GraphData['graph'] {
    return this.graphData.graph;
  }

  get currentGraph(): GraphData['currentGraph'] {
    return this.graphData.currentGraph;
  }

  get graphOptions(): GraphData['graphOptions'] {
    return this.graphData.graphOptions;
  }

  createActions(): GraphAction[] {
    return [];
  }
}

export { GraphOperation };
