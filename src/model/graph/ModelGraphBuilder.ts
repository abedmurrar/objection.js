import { isObject, isString, asArray, asSingle } from '../../utils/objectUtils';
import { ValidationErrorType } from '../../model/ValidationError';
import { ModelGraphNode } from './ModelGraphNode';
import { ModelGraphEdge } from './ModelGraphEdge';
import type { Model, ModelClass } from '../Model';
import type { Relation } from '../../relations/Relation';

type DataPath = (string | number)[];

interface PropertyReference {
  path: DataPath;
  refMatch: string;
  ref: string;
  refPath: string[];
}

class ModelGraphBuilder {
  declare nodes: ModelGraphNode[];
  declare edges: ModelGraphEdge[];

  constructor() {
    this.nodes = [];
    this.edges = [];
  }

  static buildGraph(
    rootModelClass: ModelClass,
    roots: Model | Model[] | null | undefined,
  ): ModelGraphBuilder {
    const builder = new this();
    builder._buildGraph(rootModelClass, roots);

    return builder;
  }

  _buildGraph(rootModelClass: ModelClass, roots: Model | Model[] | null | undefined): void {
    if (roots) {
      if (Array.isArray(roots)) {
        this._buildNodes(rootModelClass, roots);
      } else if (isObject(roots)) {
        this._buildNode(rootModelClass, roots);
      } else {
        throw createNotModelError(rootModelClass, roots);
      }
    }

    this._buildReferences();
  }

  _buildNodes(
    modelClass: ModelClass,
    objs: Model | Model[],
    parentNode: ModelGraphNode | null = null,
    relation: Relation | null = null,
  ): void {
    objs = asArray(objs) as Model[];

    objs.forEach((obj, index) => {
      this._buildNode(modelClass, obj, parentNode, relation, index);
    });
  }

  _buildNode(
    modelClass: ModelClass,
    obj: Model | Model[],
    parentNode: ModelGraphNode | null = null,
    relation: Relation | null = null,
    index: number | null = null,
  ): void {
    obj = asSingle(obj) as Model;

    if (!isObject(obj) || !obj.$isObjectionModel) {
      throw createNotModelError(modelClass, obj);
    }

    const node = new ModelGraphNode(modelClass, obj);
    this.nodes.push(node);

    if (parentNode) {
      const edge = new ModelGraphEdge(
        ModelGraphEdge.Type.Relation,
        parentNode,
        node,
        relation,
        index,
      );

      node.parentEdge = edge;
      this._addEdge(parentNode, node, edge);
    }

    this._buildRelationNodes(node);
  }

  _buildRelationNodes(node: ModelGraphNode): void {
    for (const relationName of node.modelClass.getRelationNames()) {
      const relatedObjects = node.obj[relationName] as Model | Model[] | null | undefined;

      if (!relatedObjects) {
        continue;
      }

      const relation = node.modelClass.getRelation(relationName);

      if (relation.isOneToOne()) {
        this._buildNode(relation.relatedModelClass, relatedObjects, node, relation);
      } else {
        this._buildNodes(relation.relatedModelClass, relatedObjects, node, relation);
      }
    }
  }

  _buildReferences(): void {
    const nodesByUid = this._nodesByUid();

    this._buildObjectReferences(nodesByUid);
    this._buildPropertyReferences(nodesByUid);
  }

  _nodesByUid(): Map<unknown, ModelGraphNode> {
    const nodesByUid = new Map<unknown, ModelGraphNode>();

    for (const node of this.nodes) {
      const uid = node.uid;

      if (uid === undefined) {
        continue;
      }

      nodesByUid.set(uid, node);
    }

    return nodesByUid;
  }

  _buildObjectReferences(nodesByUid: Map<unknown, ModelGraphNode>): void {
    for (const node of this.nodes) {
      const ref = node.reference;

      if (ref === undefined) {
        continue;
      }

      const refNode = nodesByUid.get(ref);

      if (!refNode) {
        throw createReferenceNotFoundError(ref);
      }

      const edge = new ModelGraphEdge(ModelGraphEdge.Type.Reference, node, refNode);
      edge.refType = ModelGraphEdge.ReferenceType.Object;

      this._addEdge(node, refNode, edge);
    }
  }

  _buildPropertyReferences(nodesByUid: Map<unknown, ModelGraphNode>): void {
    for (const node of this.nodes) {
      forEachPropertyReference(node.obj, ({ path, refMatch, ref, refPath }) => {
        const refNode = nodesByUid.get(ref);

        if (!refNode) {
          throw createReferenceNotFoundError(ref);
        }

        const edge = new ModelGraphEdge(ModelGraphEdge.Type.Reference, node, refNode);

        edge.refType = ModelGraphEdge.ReferenceType.Property;
        edge.refMatch = refMatch;
        edge.refOwnerDataPath = path.slice();
        edge.refRelatedDataPath = refPath;

        this._addEdge(node, refNode, edge);
      });
    }
  }

  _addEdge(ownerNode: ModelGraphNode, relatedNode: ModelGraphNode, edge: ModelGraphEdge): void {
    this.edges.push(edge);

    ownerNode.edges.push(edge);
    relatedNode.edges.push(edge);

    if (edge.type === ModelGraphEdge.Type.Reference) {
      ownerNode.refEdges.push(edge);
      relatedNode.refEdges.push(edge);
    }
  }
}

function forEachPropertyReference(
  obj: Model,
  callback: (reference: PropertyReference) => void,
): void {
  const modelClass = obj.constructor as ModelClass;
  const relationNames = modelClass.getRelationNames();

  for (const prop of Object.keys(obj)) {
    if (relationNames.includes(prop)) {
      continue;
    }

    visitStrings(obj[prop], [prop], (str, path) => {
      forEachMatch(modelClass.propRefRegex, str, (match) => {
        const [refMatch, ref, refPath] = match;
        callback({ path, refMatch, ref, refPath: refPath.trim().split('.') });
      });
    });
  }
}

type StringVisitor = (str: string, path: DataPath) => void;

function visitStrings(value: unknown, path: DataPath, visit: StringVisitor): void {
  if (Array.isArray(value)) {
    visitStringsInArray(value, path, visit);
  } else if (isObject(value) && !Buffer.isBuffer(value)) {
    visitStringsInObject(value as Record<string, unknown>, path, visit);
  } else if (isString(value)) {
    visit(value as string, path);
  }
}

function visitStringsInArray(value: unknown[], path: DataPath, visit: StringVisitor): void {
  for (let i = 0; i < value.length; ++i) {
    path.push(i);
    visitStrings(value[i], path, visit);
    path.pop();
  }
}

function visitStringsInObject(
  value: Record<string, unknown>,
  path: DataPath,
  visit: StringVisitor,
): void {
  for (const prop of Object.keys(value)) {
    path.push(prop);
    visitStrings(value[prop], path, visit);
    path.pop();
  }
}

// `propRefRegex` is a shared global regex, so its `lastIndex` is reset
// before and after the search, also when a callback throws. Otherwise the
// next string is searched from where this one stopped, which skips its
// references. Every string of every graph is searched, so this doesn't use
// `matchAll()`: it copies the regex and creates an iterator for each string.
function forEachMatch(regex: RegExp, str: string, cb: (match: RegExpExecArray) => void): void {
  regex.lastIndex = 0;

  try {
    let match = regex.exec(str);

    while (match !== null) {
      cb(match);
      match = regex.exec(str);
    }
  } finally {
    regex.lastIndex = 0;
  }
}

function createReferenceNotFoundError(ref: unknown): Error {
  return new Error(
    [
      `could not resolve reference ${ref} in a graph.`,
      `If you are sure the #id exist in the same graph,`,
      `this may be due to a limitation that a subgraph under a related item`,
      `cannot reference an item in a subgraph under another related item.`,
      `If you run into this limitation, please open an issue in objection github.`,
    ].join(' '),
  );
}

function createNotModelError(modelClass: ModelClass, value: unknown): Error {
  return modelClass.createValidationError({
    type: ValidationErrorType.InvalidGraph,
    message: `expected value "${value}" to be an instance of ${modelClass.name}`,
  });
}

export { ModelGraphBuilder, createNotModelError, forEachPropertyReference };
