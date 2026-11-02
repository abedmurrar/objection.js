import { GraphAction } from '../GraphAction';
import { groupBy } from '../../../utils/objectUtils';
import * as promiseUtils from '../../../utils/promiseUtils';
import type { GraphData, GraphNode, GraphRelation } from '../GraphData';
import type { QueryBuilder } from '../../QueryBuilder';

class GraphDeleteAction extends GraphAction {
  declare nodes: GraphNode[];

  constructor(graphData: GraphData, { nodes }: { nodes: GraphNode[] }) {
    super(graphData);
    // Nodes to delete.
    this.nodes = nodes;
  }

  run(builder: QueryBuilder): PromiseLike<unknown> {
    const nodesTodelete = this._filterOutBelongsToOneRelationUnrelates(this.nodes);
    const builders = this._createDeleteBuilders(builder, nodesTodelete);

    return promiseUtils.map(builders, (builder: QueryBuilder) => builder.execute(), {
      concurrency: this._getConcurrency(builder, nodesTodelete),
    });
  }

  _filterOutBelongsToOneRelationUnrelates(nodes: GraphNode[]): GraphNode[] {
    // `BelongsToOneRelation` unrelate is handled by `GraphPatch` because
    // unrelating a `BelongsToOneRelation` is just a matter of updating
    // one field of the parent node.
    return nodes.filter((node) => {
      return !(
        this.graphOptions.shouldUnrelate(node, this.graphData) &&
        node.parentEdge!.relation.isObjectionBelongsToOneRelation
      );
    });
  }

  _createDeleteBuilders(parentBuilder: QueryBuilder, nodesTodelete: GraphNode[]): QueryBuilder[] {
    const nodesByRelation = groupBy(nodesTodelete, getRelation);
    const builders: QueryBuilder[] = [];

    nodesByRelation.forEach((nodes, relation) => {
      const nodesByParent = groupBy(nodes, getParent);

      nodesByParent.forEach((nodes, parentNode) => {
        const shouldUnrelate = this.graphOptions.shouldUnrelate(nodes[0], this.graphData);

        const builder: QueryBuilder = parentNode!.obj
          .$relatedQuery(relation.name)
          .childQueryOf(parentBuilder);

        if (!relation.isObjectionBelongsToOneRelation) {
          // This is useless in case of BelongsToOneRelation.
          builder.findByIds(nodes.map((node) => node.obj.$id()));
        }

        for (const node of nodes) {
          node.userData.deleted = true;
        }

        builders.push(shouldUnrelate ? builder.unrelate() : builder.delete());
      });
    });

    return builders;
  }
}

function getRelation(node: GraphNode): GraphRelation {
  return node.parentEdge!.relation;
}

function getParent(node: GraphNode): GraphNode | null {
  return node.parentNode;
}

export { GraphDeleteAction };
