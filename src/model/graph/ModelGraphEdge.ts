import type {} from '../Model';
import type { Relation } from '../../relations/Relation';
import type { ModelGraphNode } from './ModelGraphNode';

const Type = {
  Relation: 'Relation',
  Reference: 'Reference',
};

const ReferenceType = {
  Object: 'Object',
  Property: 'Property',
};

class ModelGraphEdge {
  declare type: string;

  declare ownerNode: ModelGraphNode;
  declare relatedNode: ModelGraphNode;
  declare relation: Relation | null;
  declare relationIndex: number | null;

  declare refType: string | null;
  declare refMatch: string | null;

  declare refOwnerDataPath: (string | number)[] | null;
  declare refRelatedDataPath: string[] | null;

  constructor(
    type: string,
    ownerNode: ModelGraphNode,
    relatedNode: ModelGraphNode,
    relation: Relation | null = null,
    relationIndex: number | null = null,
  ) {
    this.type = type;

    this.ownerNode = ownerNode;
    this.relatedNode = relatedNode;
    this.relation = relation;
    this.relationIndex = relationIndex;

    this.refType = null;
    this.refMatch = null;

    this.refOwnerDataPath = null;
    this.refRelatedDataPath = null;
  }

  static get Type(): typeof Type {
    return Type;
  }

  static get ReferenceType(): typeof ReferenceType {
    return ReferenceType;
  }

  getOtherNode(node: ModelGraphNode): ModelGraphNode {
    return this.isOwnerNode(node) ? this.relatedNode : this.ownerNode;
  }

  isOwnerNode(node: ModelGraphNode): boolean {
    return node === this.ownerNode;
  }

  isRelatedNode(node: ModelGraphNode): boolean {
    return node === this.relatedNode;
  }
}

export { ModelGraphEdge };
