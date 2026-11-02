import { ModelGraph } from '../../model/graph/ModelGraph';
import { ModelGraphEdge } from '../../model/graph/ModelGraphEdge';
import { createNotModelError } from '../../model/graph/ModelGraphBuilder';
import { GraphFetcher } from '../graph/GraphFetcher';
import { GraphInsert } from './insert/GraphInsert';
import { GraphPatch } from './patch/GraphPatch';
import { GraphDelete } from './delete/GraphDelete';
import { GraphRecursiveUpsert } from './recursiveUpsert/GraphRecursiveUpsert';
import { GraphOptions } from './GraphOptions';
import { ValidationErrorType } from '../../model/ValidationError';
import { RelationExpression } from '../RelationExpression';
import { GraphNodeDbExistence } from './GraphNodeDbExistence';
import { GraphData } from './GraphData';
import { uniqBy, asArray, isObject } from '../../utils/objectUtils';
import type { Graph, GraphEdge, GraphModel, GraphNode } from './GraphData';
import type { GraphAction } from './GraphAction';
import type { GraphOptionsInput } from './GraphOptions';
import type { QueryBuilder } from '../QueryBuilder';
import type { ModelClass } from '../QueryBuilderOperationSupport';

class GraphUpsert {
  declare objects: GraphModel[];
  declare isArray: boolean;
  declare upsertOpt: GraphOptionsInput;

  constructor({
    rootModelClass,
    objects,
    upsertOptions,
  }: {
    rootModelClass: ModelClass;
    objects: unknown;
    upsertOptions: GraphOptionsInput;
  }) {
    checkCanBeConvertedToModels(rootModelClass, objects);

    this.objects = rootModelClass.ensureModelArray(objects, GraphUpsert.modelOptions);
    this.isArray = Array.isArray(objects);
    this.upsertOpt = upsertOptions;
  }

  static get modelOptions(): { skipValidation: boolean } {
    return { skipValidation: true };
  }

  run(builder: QueryBuilder): Promise<GraphModel | GraphModel[]> {
    const modelClass = builder.modelClass();
    const graphOptions = new GraphOptions(this.upsertOpt);

    const graph = ModelGraph.create(modelClass, this.objects);
    assignDbRefsAsRelateProps(graph);

    return createGraphData(builder, graphOptions, graph)
      .then(checkForErrors(builder))
      .then(pruneGraphs())
      .then(executeOperations(builder))
      .then(returnResult(this.objects, this.isArray));
  }
}

function checkCanBeConvertedToModels(modelClass: ModelClass, objects: unknown): void {
  asArray(objects).forEach((obj: unknown) => {
    if (!isObject(obj)) {
      throw createNotModelError(modelClass, obj);
    }
  });
}

function assignDbRefsAsRelateProps(graph: Graph): void {
  for (const node of graph.nodes) {
    if (!node.parentEdge || !node.parentEdge.relation || !node.isDbReference) {
      continue;
    }

    node.parentEdge.relation.setRelateProp(node.obj, asArray(node.dbReference));
  }
}

async function createGraphData(
  builder: QueryBuilder,
  graphOptions: GraphOptions,
  graph: Graph,
): Promise<GraphData> {
  const currentGraph = await fetchCurrentGraph(builder, graphOptions, graph);

  const nodeDbExistence = await GraphNodeDbExistence.create({
    builder,
    graph,
    graphOptions,
    currentGraph,
  });

  return new GraphData({ graph, currentGraph, graphOptions, nodeDbExistence });
}

function fetchCurrentGraph(
  builder: QueryBuilder,
  graphOptions: GraphOptions,
  graph: Graph,
): Promise<Graph> {
  if (graphOptions.isInsertOnly()) {
    return Promise.resolve(ModelGraph.createEmpty());
  } else {
    return GraphFetcher.fetchCurrentGraph({ builder, graph, graphOptions });
  }
}

// Remove branches from the graph that require no operations. For example
// we never want to do anything for descendant nodes of a node that is
// deleted or unrelated. We never delete recursively.
function pruneGraphs(): (graphData: GraphData) => GraphData {
  return (graphData) => {
    pruneRelatedBranches(graphData);

    if (!graphData.graphOptions.isInsertOnly()) {
      pruneDeletedBranches(graphData);
    }

    return graphData;
  };
}

function pruneRelatedBranches(graphData: GraphData): void {
  const relateNodes = graphData.graph.nodes.filter((node) => {
    return (
      !graphData.currentGraph.nodeForNode(node) &&
      !graphData.graphOptions.shouldInsertIgnoreDisable(node, graphData)
    );
  });

  removeBranchesFromGraph(findRoots(relateNodes), graphData.graph);
}

function pruneDeletedBranches(graphData: GraphData): void {
  const { graph, currentGraph } = graphData;

  const deleteNodes = currentGraph.nodes.filter((currentNode) => !graph.nodeForNode(currentNode));
  const roots = findRoots(deleteNodes);

  // Don't delete relations the current graph doesn't even mention.
  // So if the parent node doesn't even have the relation, it's not
  // supposed to be deleted.
  const rootsNotInRelation = roots.filter((deleteRoot) => {
    if (!deleteRoot.parentNode) {
      return false;
    }

    const { relation } = deleteRoot.parentEdge!;
    const parentNode = graph.nodeForNode(deleteRoot.parentNode);

    if (!parentNode) {
      return false;
    }

    return parentNode.obj[relation.name] === undefined;
  });

  removeBranchesFromGraph(roots, currentGraph);
  removeNodesFromGraph(new Set(rootsNotInRelation), currentGraph);
}

function findRoots(nodes: GraphNode[]): GraphNode[] {
  const nodeSet = new Set(nodes);

  return uniqBy(
    nodes.filter((node) => {
      let parentNode = node.parentNode;

      while (parentNode) {
        if (nodeSet.has(parentNode)) {
          return false;
        }

        parentNode = parentNode.parentNode;
      }

      return true;
    }),
  );
}

function removeBranchesFromGraph(branchRoots: GraphNode[], graph: Graph): void {
  const nodesToRemove = new Set(
    branchRoots.reduce<GraphNode[]>(
      (nodesToRemove, node) => [...nodesToRemove, ...node.descendantRelationNodes],
      [],
    ),
  );

  removeNodesFromGraph(nodesToRemove, graph);
}

function removeNodesFromGraph(nodesToRemove: Set<GraphNode>, graph: Graph): Graph {
  const edgesToRemove = new Set<GraphEdge>();

  for (const node of nodesToRemove) {
    for (const edge of node.edges) {
      const otherNode = edge.getOtherNode(node);

      if (!nodesToRemove.has(otherNode)) {
        otherNode.removeEdge(edge);
        edgesToRemove.add(edge);
      }
    }
  }

  graph.nodes = graph.nodes.filter((node) => !nodesToRemove.has(node));
  graph.edges = graph.edges.filter((edge) => !edgesToRemove.has(edge));

  return graph;
}

function checkForErrors(builder: QueryBuilder): (graphData: GraphData) => GraphData {
  return (graphData) => {
    checkForNotFoundErrors(graphData, builder);
    checkForUnallowedRelationErrors(graphData, builder);
    checkForUnallowedReferenceErrors(graphData, builder);

    if (graphData.graphOptions.isInsertOnly()) {
      checkForHasManyRelateErrors(graphData);
    }

    return graphData;
  };
}

function checkForNotFoundErrors(graphData: GraphData, builder: QueryBuilder): void {
  const { graphOptions, currentGraph, graph } = graphData;

  for (const node of graph.nodes) {
    if (
      node.obj.$hasId() &&
      !graphOptions.shouldInsertIgnoreDisable(node, graphData) &&
      !graphOptions.shouldRelateIgnoreDisable(node, graphData) &&
      !currentGraph.nodeForNode(node)
    ) {
      if (!node.parentNode) {
        throw node.modelClass.createNotFoundError(builder.context(), {
          message: `root model (id=${node.obj.$id()}) does not exist. If you want to insert it with an id, use the insertMissing option`,
          dataPath: node.dataPath,
        });
      } else {
        throw node.modelClass.createNotFoundError(builder.context(), {
          message: `model (id=${node.obj.$id()}) is not a child of model (id=${node.parentNode.obj.$id()}). If you want to relate it, use the relate option. If you want to insert it with an id, use the insertMissing option`,
          dataPath: node.dataPath,
        });
      }
    }
  }
}

function checkForUnallowedRelationErrors(graphData: GraphData, builder: QueryBuilder): void {
  const { graph } = graphData;
  const allowedExpression = builder.allowedGraphExpression();

  if (allowedExpression) {
    const rootsObjs = graph.nodes.filter((node) => !node.parentEdge).map((node) => node.obj);
    const expression = RelationExpression.fromModelGraph(rootsObjs);

    if (!allowedExpression.isSubExpression(expression)) {
      throw builder.modelClass().createValidationError({
        type: ValidationErrorType.UnallowedRelation,
        message: 'trying to upsert an unallowed relation',
      });
    }
  }
}

function checkForUnallowedReferenceErrors(graphData: GraphData, builder: QueryBuilder): void {
  const { graph, graphOptions } = graphData;

  if (graphOptions.allowRefs()) {
    return;
  }

  if (graph.edges.some((edge) => edge.type === ModelGraphEdge.Type.Reference)) {
    throw builder.modelClass().createValidationError({
      type: ValidationErrorType.InvalidGraph,
      message:
        '#ref references are not allowed in a graph by default. see the allowRefs insert/upsert graph option',
    });
  }
}

function checkForHasManyRelateErrors(graphData: GraphData): void {
  const { graph, graphOptions } = graphData;

  for (const node of graph.nodes) {
    if (
      graphOptions.shouldRelate(node, graphData) &&
      node.parentEdge!.relation.isObjectionHasManyRelation
    ) {
      throw new Error(
        'You cannot relate HasManyRelation or HasOneRelation using insertGraph, because those require update operations. Consider using upsertGraph instead.',
      );
    }
  }
}

function executeOperations(builder: QueryBuilder): (graphData: GraphData) => Promise<unknown> {
  return (graphData) => {
    const operations = graphData.graphOptions.isInsertOnly()
      ? [GraphInsert]
      : [GraphDelete, GraphInsert, GraphPatch, GraphRecursiveUpsert];

    return operations.reduce<Promise<unknown>>((promise, Operation) => {
      const operation = new Operation(graphData);
      const actions = operation.createActions();

      return promise.then(() => executeActions(builder, actions));
    }, Promise.resolve());
  };
}

function executeActions(builder: QueryBuilder, actions: GraphAction[]): Promise<unknown> {
  return actions.reduce<Promise<unknown>>(
    (promise, action) => promise.then(() => action.run(builder)),
    Promise.resolve(),
  );
}

function returnResult(objects: GraphModel[], isArray: boolean): () => GraphModel | GraphModel[] {
  return () => (isArray ? objects : objects[0]);
}

export { GraphUpsert };
