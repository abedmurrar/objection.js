import { JoinRowGraphInsertAction } from './JoinRowGraphInsertAction';
import { GraphInsertAction } from './GraphInsertAction';
import { GraphOperation } from '../GraphOperation';
import { ModelGraphEdge } from '../../../model/graph/ModelGraphEdge';
import type { GraphAction } from '../GraphAction';
import type { GraphData, GraphEdge, GraphNode } from '../GraphData';

// The edges each node depends on.
type Dependencies = Map<GraphNode, GraphEdge[]>;

class GraphInsert extends GraphOperation {
  declare dependencies: Dependencies;

  constructor(...args: [graphData: GraphData]) {
    super(...args);
    this.dependencies = this._createDependencyMap();
  }

  createActions(): GraphAction[] {
    return [...this._createNormalActions(), ...this._createJoinRowActions()];
  }

  _createDependencyMap(): Dependencies {
    const dependencies: Dependencies = new Map();

    for (const edge of this.graph.edges) {
      if (edge.type == ModelGraphEdge.Type.Relation) {
        this._createRelationDependency(edge, dependencies);
      } else {
        this._createReferenceDependency(edge, dependencies);
      }
    }

    return dependencies;
  }

  _createRelationDependency(edge: GraphEdge, dependencies: Dependencies): void {
    if (edge.relation.isObjectionHasManyRelation) {
      // In case of HasManyRelation the related node depends on the owner node
      // because the related node has the foreign key.
      this._addDependency(edge.relatedNode, edge, dependencies);
    } else if (edge.relation.isObjectionBelongsToOneRelation) {
      // In case of BelongsToOneRelation the owner node depends on the related
      // node because the owner node has the foreign key.
      this._addDependency(edge.ownerNode, edge, dependencies);
    }
  }

  _createReferenceDependency(edge: GraphEdge, dependencies: Dependencies): void {
    this._addDependency(edge.ownerNode, edge, dependencies);
  }

  _addDependency(node: GraphNode, edge: GraphEdge, dependencies: Dependencies): void {
    let edges = dependencies.get(node);

    if (!edges) {
      edges = [];
      dependencies.set(node, edges);
    }

    edges.push(edge);
  }

  _createNormalActions(): GraphInsertAction[] {
    const handledNodes = new Set<GraphNode>();
    const actions: GraphInsertAction[] = [];

    while (true) {
      // At this point, don't care if the nodes have already been inserted before
      // given to this class. `GraphInsertAction` will test that and only insert
      // new ones. We need to pass all nodes to `GraphInsertActions` so that we
      // can resolve all dependencies.
      const nodesToInsert = this.graph.nodes.filter((node) => {
        return !this._isHandled(node, handledNodes) && !this._hasDependencies(node, handledNodes);
      });

      if (nodesToInsert.length === 0) {
        break;
      }

      actions.push(
        new GraphInsertAction(this.graphData, {
          nodes: nodesToInsert,
          dependencies: this.dependencies,
        }),
      );

      for (const node of nodesToInsert) {
        this._markHandled(node, handledNodes);
      }
    }

    if (handledNodes.size !== this.graph.nodes.length) {
      throw new Error('the object graph contains cyclic references');
    }

    return actions;
  }

  _isHandled(node: GraphNode, handledNodes: Set<GraphNode>): boolean {
    return handledNodes.has(node);
  }

  _hasDependencies(node: GraphNode, handledNodes: Set<GraphNode>): boolean {
    if (!this.dependencies.has(node)) {
      return false;
    }

    for (const edge of this.dependencies.get(node)!) {
      const dependencyNode = edge.getOtherNode(node);

      if (!handledNodes.has(dependencyNode) && !this.currentGraph.nodeForNode(dependencyNode)) {
        return true;
      }
    }

    return false;
  }

  _markHandled(node: GraphNode, handledNodes: Set<GraphNode>): void {
    handledNodes.add(node);

    // The referencing nodes are all references that don't
    // represent any real entity. They are simply intermediate nodes
    // that depend on this node. Once this node is handled, we can
    // also mark those nodes as handled as there is nothing to actually
    // insert.
    for (const refNode of node.referencingNodes) {
      this._markHandled(refNode, handledNodes);
    }
  }

  _createJoinRowActions(): JoinRowGraphInsertAction[] {
    return [
      new JoinRowGraphInsertAction(this.graphData, {
        nodes: this.graph.nodes.filter((node) => {
          return (
            this.currentGraph.nodeForNode(node) === null &&
            node.parentEdge &&
            node.parentEdge.relation.isObjectionManyToManyRelation
          );
        }),
      }),
    ];
  }
}

export { GraphInsert };
