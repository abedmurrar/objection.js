import { ModelGraphBuilder } from './ModelGraphBuilder';
import type { Model, ModelClass } from '../Model';
import type { ModelGraphEdge } from './ModelGraphEdge';
import type { ModelGraphNode } from './ModelGraphNode';

// The marker of the lazily calculated map before it is calculated.
// The type is a brand so that it isn't confused with the map.
const NOT_CALCULATED = {} as { readonly notCalculated: true };
type NotCalculated = typeof NOT_CALCULATED;

class ModelGraph {
  declare nodes: ModelGraphNode[];
  declare edges: ModelGraphEdge[];

  declare _nodesByIdPathKeys: Map<string, ModelGraphNode> | NotCalculated;

  constructor(nodes: ModelGraphNode[], edges: ModelGraphEdge[]) {
    this.nodes = nodes;
    this.edges = edges;

    // This is calculated lazily.
    this._nodesByIdPathKeys = NOT_CALCULATED;
  }

  static create(rootModelClass: ModelClass, roots: Model | Model[] | null | undefined): ModelGraph {
    const builder = ModelGraphBuilder.buildGraph(rootModelClass, roots);
    return new ModelGraph(builder.nodes, builder.edges);
  }

  static createEmpty(): ModelGraph {
    return new ModelGraph([], []);
  }

  get rootObjects(): Model[] {
    return this.nodes.filter((node) => !node.parentEdge).map((node) => node.obj);
  }

  nodeForNode(node: ModelGraphNode | null | undefined): ModelGraphNode | null {
    if (!node) {
      return null;
    }

    if (this._nodesByIdPathKeys === NOT_CALCULATED) {
      this._nodesByIdPathKeys = createNodesByIdPathKeysMap(this.nodes);
    }

    return (
      (this._nodesByIdPathKeys as Map<string | null, ModelGraphNode>).get(node.idPathKey) || null
    );
  }
}

function createNodesByIdPathKeysMap(nodes: ModelGraphNode[]): Map<string, ModelGraphNode> {
  const nodesByIdPathKeys = new Map<string, ModelGraphNode>();

  for (const node of nodes) {
    const idPathKey = node.idPathKey;

    if (idPathKey !== null) {
      nodesByIdPathKeys.set(idPathKey, node);
    }
  }

  return nodesByIdPathKeys;
}

export { ModelGraph };
