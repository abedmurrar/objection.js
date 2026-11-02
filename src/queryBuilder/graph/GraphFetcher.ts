import { asArray, groupBy } from '../../utils/objectUtils';
import { ModelGraph } from '../../model/graph/ModelGraph';
import { FetchStrategy } from './GraphOptions';
import { RelationExpression } from '../RelationExpression';
import type { Graph, GraphModel, GraphNode } from './GraphData';
import type { GraphOptions } from './GraphOptions';
import type { QueryBuilder } from '../QueryBuilder';
import type { ManyToManyRelation } from '../../relations/manyToMany/ManyToManyRelation';

type BuilderCallback = (builder: QueryBuilder) => void;

class GraphFetcher {
  /**
   * Given a graph and options, fetches the current state of that graph
   * from the database and returns it as a ModelGraph instance.
   */
  static async fetchCurrentGraph({
    builder,
    graph,
    graphOptions,
  }: {
    builder: QueryBuilder;
    graph: Graph;
    graphOptions: GraphOptions;
  }): Promise<Graph> {
    const { rootObjects } = graph;

    const rootIds = getRootIds(rootObjects);
    const modelClass = builder.modelClass();

    if (rootIds.length === 0) {
      return Promise.resolve(ModelGraph.create(modelClass, []) as Graph);
    }

    const eagerExpr = RelationExpression.fromModelGraph(rootObjects);
    const models = await modelClass
      .query()
      .childQueryOf(builder, childQueryOptions())
      .modify(propagateMethodCallsFromQuery(builder))
      .modify(buildFetchQuerySelects(graph, graphOptions, eagerExpr))
      .findByIds(rootIds)
      .withGraphFetched(eagerExpr)
      .internalOptions(fetchQueryInternalOptions());

    return ModelGraph.create(modelClass, models) as Graph;
  }
}

function getRootIds(rootObjects: GraphModel | GraphModel[]): unknown[] {
  return asArray(rootObjects)
    .filter((it: GraphModel) => it.$hasId())
    .map((root: GraphModel) => root.$id());
}

function propagateMethodCallsFromQuery(builder: QueryBuilder): BuilderCallback {
  return (fetchBuilder) => {
    // Propagate some method calls from the root query.
    for (const method of ['forUpdate', 'forShare', 'forNoKeyUpdate', 'forKeyShare'] as const) {
      if (builder.has(method)) {
        fetchBuilder[method]();
      }
    }
  };
}

function buildFetchQuerySelects(
  graph: Graph,
  graphOptions: GraphOptions,
  eagerExpr: RelationExpression,
): BuilderCallback {
  return (builder) => {
    const nodesByRelationPath = groupNodesByRelationPath(graph, eagerExpr);

    for (const [relationPath, nodes] of nodesByRelationPath.entries()) {
      const selectModifier = createFetchSelectModifier(nodes, graphOptions);

      if (!relationPath) {
        builder.modify(selectModifier);
      } else {
        builder.modifyGraph(relationPath, selectModifier);
      }
    }
  };
}

function groupNodesByRelationPath(
  graph: Graph,
  eagerExpr: RelationExpression,
): Map<string, GraphNode[]> {
  const nodesByRelationPath = groupBy(graph.nodes, (node: GraphNode) => node.relationPathKey);

  // Not all relation paths have nodes. Relations with nulls or empty arrays
  // don't have nodes, but will still need to be fetched. Add these to the
  // map as empty arrays.
  forEachPath(eagerExpr.node, (relationPath: string) => {
    if (!nodesByRelationPath.has(relationPath)) {
      nodesByRelationPath.set(relationPath, []);
    }
  });

  return nodesByRelationPath;
}

function createFetchSelectModifier(
  nodes: GraphNode[],
  graphOptions: GraphOptions,
): BuilderCallback {
  if (graphOptions.isFetchStrategy(FetchStrategy.OnlyIdentifiers)) {
    return createIdentifierSelector();
  } else if (graphOptions.isFetchStrategy(FetchStrategy.OnlyNeeded)) {
    return createInputColumnSelector(nodes);
  } else {
    return () => {};
  }
}

// Returns a function that only selects the id column.
function createIdentifierSelector(): BuilderCallback {
  return (builder) => {
    builder.select(builder.fullIdColumn());
  };
}

// Returns a function that only selects the columns that exist in the input.
function createInputColumnSelector(nodes: GraphNode[]): BuilderCallback {
  return (builder) => {
    const selects = new Map<string, string>();

    for (const node of nodes) {
      const databaseJson = node.obj.$toDatabaseJson(builder);

      for (const column of Object.keys(databaseJson)) {
        if (!shouldSelectColumn(column, selects, node)) {
          continue;
        }

        const selection =
          createManyToManyExtraSelectionIfNeeded(builder, column, node) ||
          createSelection(builder, column, node);

        selects.set(column, selection);
      }
    }

    const selectArr = Array.from(selects.values());
    const idColumns: string[] = asArray(builder.fullIdColumn());

    for (const idColumn of idColumns) {
      if (!selectArr.includes(idColumn)) {
        // Always select the identifers.
        selectArr.push(idColumn);
      }
    }

    builder.select(selectArr);
  };
}

function shouldSelectColumn(
  column: string,
  selects: Map<string, string>,
  node: GraphNode,
): boolean {
  const modelClass = node.modelClass;

  return (
    !selects.has(column) &&
    column !== modelClass.propertyNameToColumnName(modelClass.dbRefProp) &&
    column !== modelClass.propertyNameToColumnName(modelClass.uidRefProp) &&
    column !== modelClass.propertyNameToColumnName(modelClass.uidProp)
  );
}

function createManyToManyExtraSelectionIfNeeded(
  builder: QueryBuilder,
  column: string,
  node: GraphNode,
): string | null {
  if (node.parentEdge && node.parentEdge.relation.isObjectionManyToManyRelation) {
    const relation = node.parentEdge.relation as ManyToManyRelation;
    const extra = relation.joinTableExtras.find((extra) => extra.aliasCol === column);

    if (extra) {
      return `${builder.tableRefFor(relation.joinModelClass!)}.${extra.joinTableCol} as ${
        extra.aliasCol
      }`;
    }
  }

  return null;
}

function createSelection(builder: QueryBuilder, column: string, node: GraphNode): string {
  return `${builder.tableRefFor(node.modelClass)}.${column}`;
}

function childQueryOptions(): { fork: boolean; isInternalQuery: boolean } {
  return {
    fork: true,
    isInternalQuery: true,
  };
}

function fetchQueryInternalOptions(): { keepImplicitJoinProps: boolean } {
  return {
    keepImplicitJoinProps: true,
  };
}

// `eagerExprNode` is a relation expression node: `$childNames` and a property per child.
function forEachPath(
  eagerExprNode: any,
  cb: (relationPath: string) => void,
  path: string[] = [],
): void {
  for (const relation of eagerExprNode.$childNames) {
    path.push(relation);
    cb(path.join('.'));
    forEachPath(eagerExprNode[relation], cb, path);
    path.pop();
  }
}

export { GraphFetcher };
