import { isPostgres } from '../../utils/knexUtils';
import type { GraphData, GraphNode } from './GraphData';
import type { QueryBuilder } from '../QueryBuilder';
import type { Operation } from '../QueryBuilderOperationSupport';
import type { ObjectionToKnexConvertingOperation } from '../operations/ObjectionToKnexConvertingOperation';

const POSTGRES_MAX_INSERT_BATCH_SIZE = 100;
const MAX_CONCURRENCY = 100;

class GraphAction {
  declare graphData: GraphData;

  constructor(graphData: GraphData) {
    this.graphData = graphData;
  }

  static get ReturningAllSelector(): (op: Operation) => boolean {
    return (op) => {
      // Only select `returning('*')` operation.
      return (
        op.name === 'returning' && (op as ObjectionToKnexConvertingOperation).args!.includes('*')
      );
    };
  }

  static getConcurrency(builder: QueryBuilder, nodes: GraphNode[]): number {
    return nodes.reduce((minConcurrency, node) => {
      return Math.min(minConcurrency, node.modelClass.getConcurrency(builder.unsafeKnex()));
    }, MAX_CONCURRENCY);
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

  run(builder: QueryBuilder): PromiseLike<unknown> | null {
    return null;
  }

  _getConcurrency(builder: QueryBuilder, nodes: GraphNode[]): number {
    return GraphAction.getConcurrency(builder, nodes);
  }

  _getBatchSize(builder: QueryBuilder): number {
    return isPostgres(builder.unsafeKnex()) ? POSTGRES_MAX_INSERT_BATCH_SIZE : 1;
  }

  _resolveReferences(node: GraphNode): void {
    if (node.isReference) {
      this._resolveReference(node);
    }
  }

  _resolveReference(node: GraphNode): void {
    const refNode = node.referencedNode!;

    for (const prop of Object.keys(refNode.obj)) {
      if (!Object.hasOwn(node.obj, prop)) {
        node.obj[prop] = refNode.obj[prop];
      }
    }
  }
}

export { GraphAction };
