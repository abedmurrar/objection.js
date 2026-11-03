import type { GraphData, GraphNode } from './GraphData';

// The options of insertGraph and upsertGraph: booleans or arrays of relation paths.
type GraphOptionsInput = Record<string, unknown>;

const NO_RELATE = 'noRelate';
const NO_UNRELATE = 'noUnrelate';
const NO_INSERT = 'noInsert';
const NO_UPDATE = 'noUpdate';
const NO_DELETE = 'noDelete';

const UPDATE = 'update';
const RELATE = 'relate';
const UNRELATE = 'unrelate';
const INSERT_MISSING = 'insertMissing';
const FETCH_STRATEGY = 'fetchStrategy';
const ALLOW_REFS = 'allowRefs';

const FetchStrategy = {
  OnlyIdentifiers: 'OnlyIdentifiers',
  Everything: 'Everything',
  OnlyNeeded: 'OnlyNeeded',
};

class GraphOptions {
  declare options: GraphOptionsInput;
  // Only `insertGraph()` sets it: it never fetches, updates or removes existing rows.
  declare insertOnly: boolean;

  constructor(options: GraphOptionsInput | GraphOptions, insertOnly = false) {
    if (options instanceof GraphOptions) {
      this.options = options.options;
      this.insertOnly = options.insertOnly;
    } else {
      this.options = options;
      this.insertOnly = insertOnly;
    }
  }

  isFetchStrategy(strategy: string): boolean {
    if (!(FetchStrategy as Record<string, string>)[strategy]) {
      throw new Error(`unknown strategy "${strategy}"`);
    }

    if (!this.options[FETCH_STRATEGY]) {
      return strategy === FetchStrategy.OnlyNeeded;
    } else {
      return this.options[FETCH_STRATEGY] === strategy;
    }
  }

  // An `upsertGraph()` with noUpdate, noDelete, noUnrelate and insertMissing
  // is still an upsert: it must find the existing rows.
  isInsertOnly(): boolean {
    return this.insertOnly;
  }

  // Like `shouldRelate` but ignores settings that explicitly disable relate operations.
  shouldRelateIgnoreDisable(node: GraphNode, graphData: GraphData): boolean {
    if (node.isReference || node.isDbReference) {
      return true;
    }

    return (
      this._hasOption(node, RELATE) &&
      !getCurrentNode(node, graphData) &&
      !!node.parentEdge &&
      !!node.parentEdge.relation &&
      hasRelateProp(node) &&
      graphData.nodeDbExistence.doesNodeExistInDb(node)
    );
  }

  shouldRelate(node: GraphNode, graphData: GraphData): boolean {
    return !this._hasOption(node, NO_RELATE) && this.shouldRelateIgnoreDisable(node, graphData);
  }

  // Like `shouldInsert` but ignores settings that explicitly disable insert operations.
  shouldInsertIgnoreDisable(node: GraphNode, graphData: GraphData): boolean {
    return (
      !getCurrentNode(node, graphData) &&
      !this.shouldRelateIgnoreDisable(node, graphData) &&
      (!node.hasId || this.shouldInsertMissing(node))
    );
  }

  shouldInsert(node: GraphNode, graphData: GraphData): boolean {
    return !this._hasOption(node, NO_INSERT) && this.shouldInsertIgnoreDisable(node, graphData);
  }

  shouldInsertMissing(node: GraphNode): boolean {
    return this._hasOption(node, INSERT_MISSING);
  }

  // Like `shouldPatch() || shouldUpdate()` but ignores settings that explicitly disable
  // update or patch operations.
  shouldPatchOrUpdateIgnoreDisable(node: GraphNode, graphData: GraphData): boolean {
    if (this.shouldRelate(node, graphData)) {
      // We should update all nodes that are going to be related. Note that
      // we don't actually update anything unless there is something to update
      // so this is just a preliminary test.
      return true;
    }

    return !!getCurrentNode(node, graphData);
  }

  shouldPatch(node: GraphNode, graphData: GraphData): boolean {
    return (
      this.shouldPatchOrUpdateIgnoreDisable(node, graphData) &&
      !this._hasOption(node, NO_UPDATE) &&
      !this._hasOption(node, UPDATE)
    );
  }

  shouldUpdate(node: GraphNode, graphData: GraphData): boolean {
    return (
      this.shouldPatchOrUpdateIgnoreDisable(node, graphData) &&
      !this._hasOption(node, NO_UPDATE) &&
      this._hasOption(node, UPDATE)
    );
  }

  // Like `shouldUnrelate` but ignores settings that explicitly disable unrelate operations.
  shouldUnrelateIgnoreDisable(currentNode: GraphNode): boolean {
    return this._hasOption(currentNode, UNRELATE);
  }

  shouldUnrelate(currentNode: GraphNode, graphData: GraphData): boolean {
    return (
      !getNode(currentNode, graphData.graph) &&
      !this._hasOption(currentNode, NO_UNRELATE) &&
      this.shouldUnrelateIgnoreDisable(currentNode)
    );
  }

  shouldDelete(currentNode: GraphNode, graphData: GraphData): boolean {
    return (
      !getNode(currentNode, graphData.graph) &&
      !this._hasOption(currentNode, NO_DELETE) &&
      !this.shouldUnrelateIgnoreDisable(currentNode)
    );
  }

  shouldInsertOrRelate(node: GraphNode, graphData: GraphData): boolean {
    return this.shouldInsert(node, graphData) || this.shouldRelate(node, graphData);
  }

  shouldDeleteOrUnrelate(currentNode: GraphNode, graphData: GraphData): boolean {
    return this.shouldDelete(currentNode, graphData) || this.shouldUnrelate(currentNode, graphData);
  }

  allowRefs(): boolean {
    return !!this.options[ALLOW_REFS];
  }

  rebasedOptions(newRoot: GraphNode): GraphOptions {
    const newOpt: GraphOptionsInput = {};
    const newRootRelationPath = newRoot.relationPathKey;

    for (const name of Object.keys(this.options)) {
      const value = this.options[name];

      if (Array.isArray(value)) {
        newOpt[name] = value
          .filter((it: string) => it.startsWith(newRootRelationPath))
          .map((it: string) => it.slice(newRootRelationPath.length + 1))
          .filter((it: string) => !!it);
      } else {
        newOpt[name] = value;
      }
    }

    return new GraphOptions(newOpt, this.insertOnly);
  }

  _hasOption(node: GraphNode, optionName: string): boolean {
    const option = this.options[optionName];

    if (Array.isArray(option)) {
      return option.indexOf(node.relationPathKey) !== -1;
    } else if (typeof option === 'boolean') {
      return option;
    } else if (option === undefined) {
      return false;
    } else {
      throw new Error(
        `expected ${optionName} option value "${option}" to be an instance of boolean or array of strings`,
      );
    }
  }
}

// For `HasMany` and `HasOne` relations, the relate prop is the id of the
// related model. Use the id state of the input graph, since the parent's
// insert copies the foreign key into the related model, which can complete
// a composite id that contains it and would turn an insert into a relate (#2544).
function hasRelateProp(node: GraphNode): boolean {
  const relation = node.parentEdge!.relation;

  if (relation.isObjectionHasManyRelation) {
    return node.hasId;
  } else {
    return relation.hasRelateProp(node.obj);
  }
}

function getCurrentNode(
  node: GraphNode | null | undefined,
  graphData: GraphData | null | undefined,
): GraphNode | null {
  if (!graphData || !node) {
    return null;
  }

  return graphData.currentGraph.nodeForNode(node);
}

function getNode(
  currentNode: GraphNode | null | undefined,
  graph: GraphData['graph'] | null | undefined,
): GraphNode | null {
  if (!graph || !currentNode) {
    return null;
  }

  return graph.nodeForNode(currentNode);
}

export { GraphOptions, FetchStrategy };
export type { GraphOptionsInput };
