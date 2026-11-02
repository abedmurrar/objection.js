import { ModelGraphEdge } from './ModelGraphEdge';
import { isNumber } from '../../utils/objectUtils';
import type { Model, ModelClass } from '../Model';

// The marker of the lazily calculated properties that haven't been calculated
// yet. The type is a brand so that it isn't confused with the calculated values.
const NOT_CALCULATED = {} as { readonly notCalculated: true };
type NotCalculated = typeof NOT_CALCULATED;

type DataPath = (string | number)[];

class ModelGraphNode {
  declare modelClass: ModelClass;
  declare obj: Model;
  declare edges: ModelGraphEdge[];
  declare userData: Record<string, unknown>;
  declare hasId: boolean;
  declare uid: unknown;

  declare refEdges: ModelGraphEdge[];
  declare parentEdge: ModelGraphEdge | null;

  declare _relationPath: string[] | NotCalculated;
  declare _relationPathKey: string | NotCalculated;

  declare _dataPath: DataPath | NotCalculated;
  declare _dataPathKey: string | NotCalculated;

  declare _idPath: string[] | null | NotCalculated;
  declare _idPathKey: string | null | NotCalculated;

  constructor(modelClass: ModelClass, obj: Model) {
    this.modelClass = modelClass;
    this.obj = obj;
    this.edges = [];
    this.userData = {};
    this.hasId = obj.$hasId();
    this.uid = obj[modelClass.uidProp];

    // These are also included in `edges`. These are simply
    // shortcuts for commonly used edges.
    this.refEdges = [];
    this.parentEdge = null;

    // These are calculated lazily.
    this._relationPath = NOT_CALCULATED;
    this._relationPathKey = NOT_CALCULATED;

    this._dataPath = NOT_CALCULATED;
    this._dataPathKey = NOT_CALCULATED;

    this._idPath = NOT_CALCULATED;
    this._idPathKey = NOT_CALCULATED;
  }

  get isReference(): boolean {
    return this.reference !== undefined;
  }

  get isDbReference(): boolean {
    return this.dbReference !== undefined;
  }

  get reference(): unknown {
    return this.obj[this.modelClass.uidRefProp];
  }

  get dbReference(): unknown {
    return this.obj[this.modelClass.dbRefProp];
  }

  get parentNode(): ModelGraphNode | null {
    if (this.parentEdge) {
      return this.parentEdge.ownerNode;
    } else {
      return null;
    }
  }

  get indexInRelation(): number | null {
    if (this.parentEdge) {
      return this.parentEdge.relationIndex;
    } else {
      return null;
    }
  }

  get relationName(): string | null {
    if (this.parentEdge) {
      return this.parentEdge.relation!.name;
    } else {
      return null;
    }
  }

  get relationPath(): string[] {
    if (this._relationPath === NOT_CALCULATED) {
      this._relationPath = this._createRelationPath();
    }

    return this._relationPath as string[];
  }

  get relationPathKey(): string {
    if (this._relationPathKey === NOT_CALCULATED) {
      this._relationPathKey = this._createRelationPathKey();
    }

    return this._relationPathKey as string;
  }

  get dataPath(): DataPath {
    if (this._dataPath === NOT_CALCULATED) {
      this._dataPath = this._createDataPath();
    }

    return this._dataPath as DataPath;
  }

  get dataPathKey(): string {
    if (this._dataPathKey === NOT_CALCULATED) {
      this._dataPathKey = this._createDataPathKey();
    }

    return this._dataPathKey as string;
  }

  get idPath(): string[] | null {
    if (this._idPath === NOT_CALCULATED) {
      this._idPath = this._createIdPath();
    }

    return this._idPath as string[] | null;
  }

  get idPathKey(): string | null {
    if (this._idPathKey === NOT_CALCULATED) {
      this._idPathKey = this._createIdPathKey();
    }

    return this._idPathKey as string | null;
  }

  /**
   * If this node is a reference, returns the referred node.
   */
  get referencedNode(): ModelGraphNode | null {
    for (const edge of this.refEdges) {
      if (edge.refType === ModelGraphEdge.ReferenceType.Object && edge.isOwnerNode(this)) {
        return edge.relatedNode;
      }
    }

    return null;
  }

  /**
   * Returns all nodes that are references to this node.
   */
  get referencingNodes(): ModelGraphNode[] {
    const nodes = [];

    for (const edge of this.refEdges) {
      if (edge.refType === ModelGraphEdge.ReferenceType.Object && edge.isRelatedNode(this)) {
        nodes.push(edge.ownerNode);
      }
    }

    return nodes;
  }

  get descendantRelationNodes(): ModelGraphNode[] {
    return this._collectDescendantRelationNodes([]);
  }

  removeEdge(edge: ModelGraphEdge): void {
    // Don't allow removing parent edges for now. It would
    // cause all kinds of cache invalidation.
    if (edge === this.parentEdge) {
      throw new Error('cannot remove parent edge');
    }

    this.edges = this.edges.filter((it) => it !== edge);
    this.refEdges = this.refEdges.filter((it) => it !== edge);
  }

  _collectDescendantRelationNodes(nodes: ModelGraphNode[]): ModelGraphNode[] {
    for (const edge of this.edges) {
      if (edge.type === ModelGraphEdge.Type.Relation && edge.isOwnerNode(this)) {
        nodes.push(edge.relatedNode);
        edge.relatedNode._collectDescendantRelationNodes(nodes);
      }
    }

    return nodes;
  }

  _createRelationPath(): string[] {
    if (this.parentNode === null) {
      return [];
    } else {
      return [...this.parentNode.relationPath, this.relationName as string];
    }
  }

  _createRelationPathKey(): string {
    return this.relationPath.join('.');
  }

  _createDataPath(): DataPath {
    if (this.parentEdge === null) {
      return [];
    } else if (this.parentEdge.relation!.isOneToOne()) {
      return [...this.parentNode!.dataPath, this.relationName as string];
    } else {
      return [
        ...this.parentNode!.dataPath,
        this.relationName as string,
        this.indexInRelation as number,
      ];
    }
  }

  _createDataPathKey(): string {
    const dataPathKey = this.dataPath.reduce<string>((key, it) => {
      if (isNumber(it)) {
        return `${key}[${it}]`;
      } else {
        return key ? `${key}.${it}` : (it as string);
      }
    }, '');

    return dataPathKey ? '.' + dataPathKey : dataPathKey;
  }

  _createIdPath(): string[] | null {
    if (!this.obj.$hasId()) {
      return null;
    }

    if (this.parentEdge === null) {
      return [this.obj.$idKey()];
    } else {
      const path = this.parentNode!.idPath;

      if (path === null) {
        return null;
      }

      return [...path, this.relationName as string, this.obj.$idKey()];
    }
  }

  _createIdPathKey(): string | null {
    const idPath = this.idPath;

    if (idPath) {
      return this.idPath!.join('.');
    } else {
      return null;
    }
  }
}

export { ModelGraphNode };
