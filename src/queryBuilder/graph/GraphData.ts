import type { GraphNodeDbExistence } from './GraphNodeDbExistence';
import type { GraphOptions } from './GraphOptions';
import type { ModelClass } from '../QueryBuilderOperationSupport';
import type { Model } from '../operations/types';
import type { Relation } from '../../relations/Relation';

// What the graph operations use of the graph classes in model/graph/. An edge
// of a `ModelGraph` has a `relation` of `Relation | null`: it's null on the
// reference edges. The graph operations read it only on the relation edges, so
// they cast the graphs they create to `Graph`.

// A model instance.
type GraphModel = Model;

// The relation of an edge. The flags are defined by the relation subclasses.
type GraphRelation = Relation & {
  isObjectionHasManyRelation?: boolean;
  isObjectionBelongsToOneRelation?: boolean;
  isObjectionManyToManyRelation?: boolean;
};

interface GraphNode {
  modelClass: ModelClass;
  obj: GraphModel;
  edges: GraphEdge[];
  refEdges: GraphEdge[];
  userData: Record<string, unknown>;
  hasId: boolean;
  uid: unknown;
  parentEdge: GraphEdge | null;
  readonly parentNode: GraphNode | null;
  readonly isReference: boolean;
  readonly isDbReference: boolean;
  readonly dbReference: unknown;
  readonly relationPathKey: string;
  readonly dataPath: unknown[];
  readonly dataPathKey: string;
  readonly referencedNode: GraphNode | null;
  readonly referencingNodes: GraphNode[];
  readonly descendantRelationNodes: GraphNode[];
  removeEdge(edge: GraphEdge): void;
}

interface GraphEdge {
  type: string;
  ownerNode: GraphNode;
  relatedNode: GraphNode;
  relation: GraphRelation;
  refType: string | null;
  // Set for property reference edges, null for the others.
  refMatch: string | null;
  refOwnerDataPath: PropertyKey[] | null;
  refRelatedDataPath: PropertyKey[] | null;
  getOtherNode(node: GraphNode): GraphNode;
  isOwnerNode(node: GraphNode): boolean;
  isRelatedNode(node: GraphNode): boolean;
}

interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  readonly rootObjects: GraphModel[];
  nodeForNode(node: GraphNode): GraphNode | null;
}

interface GraphDataOptions {
  graph: Graph;
  currentGraph: Graph;
  graphOptions: GraphOptions;
  nodeDbExistence: GraphNodeDbExistence;
}

class GraphData {
  declare graph: Graph;
  declare currentGraph: Graph;
  declare graphOptions: GraphOptions;
  declare nodeDbExistence: GraphNodeDbExistence;

  constructor({ graph, currentGraph, graphOptions, nodeDbExistence }: GraphDataOptions) {
    this.graph = graph;
    this.currentGraph = currentGraph;
    this.graphOptions = graphOptions;
    this.nodeDbExistence = nodeDbExistence;
  }
}

export { GraphData };
export type { Graph, GraphEdge, GraphModel, GraphNode, GraphRelation };
