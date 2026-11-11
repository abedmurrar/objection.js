// A named import: `import * as` of a JavaScript module wraps it in an object
// of getters (tsc's __importStar), which is slow to call through.
import { parse as parseRelationExpression } from './parsers/relationExpressionParser';
import { isObject, isNumber, isString, union } from '../utils/objectUtils';
import { RelationDoesNotExistError } from '../model/RelationDoesNotExistError';

// A node of a relation expression. The properties that don't start with `$` are
// the child nodes. `$childNames` is only null while `mergeNodes()` builds a node.
interface RelationNode<ChildNames extends string[] | null = string[]> {
  $name: string | null;
  $relation: string | null;
  // The names of the modifiers.
  $modify: string[];
  $recursive: boolean | number;
  $allRecursive: boolean;
  $childNames: ChildNames;
  [childName: string]: unknown;
}

// What `normalizeNode()` takes: a node, the result of the parser, or a pojo like
// `{ a: { b: true }, c: true }`.
interface RelationNodeInput {
  $name?: string | null;
  $relation?: string | null;
  $modify?: string | string[];
  $recursive?: boolean | number;
  $allRecursive?: boolean;
  $childNames?: string[] | null;
  [childName: string]: unknown;
}

// What `merge()` and the other methods take: a string, a pojo or another
// RelationExpression instance.
type RelationExpressionInput = string | RelationExpression | RelationNodeInput | null | undefined;

// The parts of a model class that `forEachChildExpression()` uses. `R` is the
// type of its relations.
interface ModelClassWithRelations<R> {
  getRelationNames(): string[];
  getRelationUnsafe(relationName: string | null): R | null;
}

// A model of the graph `fromModelGraph()` takes.
interface GraphModel {
  constructor: Function;
  [property: string]: unknown;
}

// The part of a `GraphModel`'s class that `modelToNode()` uses.
interface GraphModelClass extends Function {
  getRelationNames(): string[];
}

// An error of the parser.
interface ParserError {
  message: string;
  duplicateRelationName?: string;
}

class RelationExpressionParseError extends Error {}
class DuplicateRelationError extends RelationExpressionParseError {
  declare relationName: string;

  constructor(relationName: string) {
    super();
    this.relationName = relationName;
  }
}

class RelationExpression {
  declare node: RelationNode;
  declare recursionDepth: number;
  declare readonly isObjectionRelationExpression: true;

  constructor(node: RelationNode = newNode(), recursionDepth = 0) {
    this.node = node;
    this.recursionDepth = recursionDepth;
  }

  // Create a relation expression from a string, a pojo or another
  // RelationExpression instance.
  static create(expr?: unknown): RelationExpression {
    if (isObject(expr)) {
      if ((expr as RelationExpression).isObjectionRelationExpression) {
        return expr as RelationExpression;
      } else {
        return new RelationExpression(normalizeNode(expr as RelationNodeInput));
      }
    } else if (isString(expr)) {
      if (expr.trim().length === 0) {
        return new RelationExpression();
      } else {
        try {
          return new RelationExpression(parse(expr));
        } catch (err) {
          if ((err as ParserError).duplicateRelationName) {
            throw new DuplicateRelationError((err as ParserError).duplicateRelationName!);
          } else {
            throw new RelationExpressionParseError((err as ParserError).message);
          }
        }
      }
    } else {
      return new RelationExpression();
    }
  }

  // Create a relation expression from a model graph.
  static fromModelGraph(graph: GraphModel | GraphModel[] | null | undefined): RelationExpression {
    if (!graph) {
      return new RelationExpression();
    } else {
      return new RelationExpression(modelGraphToNode(graph, newNode()));
    }
  }

  get maxRecursionDepth() {
    if (isNumber(this.node.$recursive)) {
      return this.node.$recursive;
    } else {
      return this.node.$recursive ? Number.MAX_SAFE_INTEGER : 0;
    }
  }

  get numChildren() {
    return this.node.$childNames.length;
  }

  get isEmpty() {
    return this.numChildren === 0;
  }

  // Merges this relation expression with another. `expr` can be a string,
  // a pojo, or a RelationExpression instance.
  merge(expr: RelationExpressionInput): RelationExpression {
    expr = RelationExpression.create(expr);

    if (this.isEmpty) {
      // Nothing to merge.
      return expr;
    }

    return new RelationExpression(mergeNodes(this.node, expr.node));
  }

  // Returns true if `expr` is contained by this expression. For example
  // `a.b` is contained by `a.[b, c]`.
  isSubExpression(expr: RelationExpressionInput): boolean {
    expr = RelationExpression.create(expr);

    if (this.node.$allRecursive) {
      return true;
    }

    if (expr.node.$allRecursive) {
      return this.node.$allRecursive;
    }

    if (this.node.$relation !== expr.node.$relation) {
      return false;
    }

    const maxRecursionDepth = expr.maxRecursionDepth;

    if (maxRecursionDepth > 0) {
      return this.node.$allRecursive || this.maxRecursionDepth >= maxRecursionDepth;
    }

    for (const childName of expr.node.$childNames) {
      const ownSubExpression = this.childExpression(childName);
      const subExpression = expr.childExpression(childName);

      if (!ownSubExpression || !ownSubExpression.isSubExpression(subExpression)) {
        return false;
      }
    }

    return true;
  }

  // Returns a RelationExpression for a child node or null if there
  // is no child with the given name `childName`.
  childExpression(childName: string): RelationExpression | null {
    if (
      this.node.$allRecursive ||
      (childName === this.node.$name && this.recursionDepth < this.maxRecursionDepth - 1)
    ) {
      return new RelationExpression(this.node, this.recursionDepth + 1);
    }

    const child = this.node[childName] as RelationNode | undefined;

    if (child) {
      return new RelationExpression(child);
    } else {
      return null;
    }
  }

  // Loops throught all first level children.
  forEachChildExpression<R>(
    modelClass: ModelClassWithRelations<R>,
    cb: (childExpr: RelationExpression, relation: R | null) => void,
  ): void {
    const maxRecursionDepth = this.maxRecursionDepth;

    if (this.node.$allRecursive) {
      for (const relationName of modelClass.getRelationNames()) {
        const node = newNode(relationName, true);
        const relation = modelClass.getRelationUnsafe(relationName);
        const childExpr = new RelationExpression(node);

        cb(childExpr, relation);
      }
    } else if (this.recursionDepth < maxRecursionDepth - 1) {
      const relation = modelClass.getRelationUnsafe(this.node.$relation) || null;
      const childExpr = new RelationExpression(this.node, this.recursionDepth + 1);

      cb(childExpr, relation);
    } else if (maxRecursionDepth === 0) {
      for (const childName of this.node.$childNames) {
        const node = this.node[childName] as RelationNode;
        const relation = modelClass.getRelationUnsafe(node.$relation);

        if (!relation) {
          throw new RelationDoesNotExistError(node.$relation);
        }

        const childExpr = new RelationExpression(node);

        cb(childExpr, relation);
      }
    }
  }

  expressionsAtPath(path: unknown): RelationExpression[] {
    return findExpressionsAtPath(this, RelationExpression.create(path), []);
  }

  clone() {
    return new RelationExpression(cloneNode(this.node), this.recursionDepth);
  }

  // `null` for an empty expression.
  toString(): string | null {
    return toString(this.node);
  }

  toPojo() {
    return cloneNode(this.node);
  }

  toJSON() {
    return this.toPojo();
  }
}

const parseCache = new Map<string, RelationNode>();
function parse(str: string): RelationNode {
  const cachedNode = parseCache.get(str);

  if (cachedNode) {
    return cloneNode(cachedNode);
  } else {
    const node: RelationNode = parseRelationExpression(str);
    parseCache.set(str, cloneNode(node));
    return node;
  }
}

// All enumerable properties of a node that don't start with `$`
// are child nodes.
function getChildNames(node: RelationNodeInput | null): string[] {
  if (!node) {
    return [];
  }

  const childNames: string[] = [];

  for (const key of Object.keys(node)) {
    if (key[0] !== '$') {
      childNames.push(key);
    }
  }

  return childNames;
}

function toString(node: RelationNode): string | null {
  const childNames = node.$childNames;

  let childExpr: (string | null)[] | string | null = childNames
    .map((childName) => node[childName] as RelationNode)
    .map(toString);
  let str = node.$relation;

  if (node.$recursive) {
    if (isNumber(node.$recursive)) {
      str += '.^' + node.$recursive;
    } else {
      str += '.^';
    }
  } else if (node.$allRecursive) {
    str += '.*';
  }

  if (childExpr.length > 1) {
    childExpr = `[${childExpr.join(', ')}]`;
  } else {
    childExpr = childExpr[0];
  }

  if (node.$modify.length) {
    str += `(${node.$modify.join(', ')})`;
  }

  if (node.$name !== node.$relation) {
    str += ` as ${node.$name}`;
  }

  if (childExpr) {
    if (str) {
      return `${str}.${childExpr}`;
    } else {
      return childExpr;
    }
  } else {
    return str;
  }
}

function cloneNode(node: RelationNode): RelationNode {
  return normalizeNode(node);
}

function modelGraphToNode(
  models: GraphModel | GraphModel[] | null | undefined,
  node: RelationNode,
): RelationNode | undefined {
  if (!models) {
    return;
  }

  if (Array.isArray(models)) {
    for (let i = 0, l = models.length; i < l; ++i) {
      modelToNode(models[i], node);
    }
  } else {
    modelToNode(models, node);
  }

  return node;
}

function modelToNode(model: GraphModel, node: RelationNode): void {
  const modelClass = model.constructor as GraphModelClass;
  const relationNames = modelClass.getRelationNames();

  for (let r = 0, lr = relationNames.length; r < lr; ++r) {
    const relName = relationNames[r];

    if (model[relName] !== undefined) {
      let childNode = node[relName] as RelationNode | undefined;

      if (!childNode) {
        childNode = newNode(relName);
        node[relName] = childNode;
        node.$childNames.push(relName);
      }

      modelGraphToNode(model[relName] as GraphModel | GraphModel[] | null, childNode);
    }
  }
}

function newNode(name: string | null = null, allRecusive = false): RelationNode {
  return normalizeNode(null, name, allRecusive);
}

function normalizeNode(
  node: RelationNodeInput | null = null,
  name: string | null = null,
  allRecusive = false,
): RelationNode {
  const normalized: RelationNode = {
    $name: normalizeName(node, name),
    $relation: normalizeRelation(node, name),
    $modify: normalizeModify(node),
    $recursive: normalizeRecursive(node),
    $allRecursive: normalizeAllRecursive(node, allRecusive),
    $childNames: normalizeChildNames(node),
  };

  for (const childName of normalized.$childNames) {
    // `node` isn't null here, since a null node has no child names.
    const childNode = node![childName];

    if (isObject(childNode) || childNode === true) {
      // `true` is a node without any properties, like `{}`.
      normalized[childName] = normalizeNode(childNode as RelationNodeInput, childName);
    }
  }

  return normalized;
}

function normalizeName(node: RelationNodeInput | null, name: string | null): string | null {
  return (node && node.$name) || name || null;
}

function normalizeRelation(node: RelationNodeInput | null, name: string | null): string | null {
  return (node && node.$relation) || name || null;
}

function normalizeModify(node: RelationNodeInput | null): string[] {
  if (!node || !node.$modify) {
    return [];
  }

  return Array.isArray(node.$modify) ? node.$modify.slice() : [node.$modify];
}

function normalizeRecursive(node: RelationNodeInput | null): boolean | number {
  return (node && node.$recursive) || false;
}

function normalizeAllRecursive(node: RelationNodeInput | null, allRecusive: boolean): boolean {
  return (node && node.$allRecursive) || allRecusive || false;
}

function normalizeChildNames(node: RelationNodeInput | null): string[] {
  return (node && node.$childNames && node.$childNames.slice()) || getChildNames(node);
}

function findExpressionsAtPath(
  target: RelationExpression,
  path: RelationExpression,
  results: RelationExpression[],
): RelationExpression[] {
  if (path.node.$childNames.length == 0) {
    // Path leaf reached, add target node to result set.
    results.push(target);
  } else {
    for (const childName of path.node.$childNames) {
      // Not null, since `childName` is a child of `path`.
      const pathChild = path.childExpression(childName)!;
      const targetChild = target.childExpression(childName);

      if (targetChild) {
        findExpressionsAtPath(targetChild, pathChild, results);
      }
    }
  }

  return results;
}

function mergeNodes(node1: RelationNode, node2: RelationNode): RelationNode {
  const node: RelationNode<string[] | null> = {
    $name: node1.$name,
    $relation: node1.$relation,
    $modify: union(node1.$modify, node2.$modify),
    $recursive: mergeRecursion(node1.$recursive, node2.$recursive),
    $allRecursive: node1.$allRecursive || node2.$allRecursive,
    $childNames: null,
  };

  if (!node.$recursive && !node.$allRecursive) {
    node.$childNames = union(node1.$childNames, node2.$childNames);

    for (const childName of node.$childNames!) {
      const child1 = node1[childName] as RelationNode | undefined;
      const child2 = node2[childName] as RelationNode | undefined;

      if (child1 && child2) {
        node[childName] = mergeNodes(child1, child2);
      } else {
        node[childName] = child1 || child2;
      }
    }
  } else {
    node.$childNames = [];
  }

  // `$childNames` was set above.
  return node as RelationNode;
}

function mergeRecursion(rec1: boolean | number, rec2: boolean | number): boolean | number {
  if (rec1 === true || rec2 === true) {
    return true;
  } else if (isNumber(rec1) && isNumber(rec2)) {
    return Math.max(rec1, rec2);
  } else {
    return rec1 || rec2;
  }
}

Object.defineProperties(RelationExpression.prototype, {
  isObjectionRelationExpression: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

export {
  RelationExpression,
  RelationExpressionParseError,
  DuplicateRelationError,
  type RelationNode,
  type ModelClassWithRelations,
};
