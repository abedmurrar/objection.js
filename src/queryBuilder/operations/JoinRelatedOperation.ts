import { QueryBuilderOperation } from './QueryBuilderOperation';
import { RelationExpression } from '../RelationExpression';
import { RelationJoiner } from '../join/RelationJoiner';
import { isString } from '../../utils/objectUtils';
import type { ModelClass, OperationOptions, QueryBuilder } from './types';

// The options of a `joinRelated` call.
interface JoinRelatedOptions {
  alias?: string | boolean;
  aliases?: Record<string, string>;
}

interface JoinRelatedCall {
  expression: unknown;
  options?: JoinRelatedOptions;
}

// A node of a relation expression as a plain object (`toPojo()`). The child
// expressions are under their names.
interface RelationExpressionPojo {
  $name: string;
  $relation: string;
  $childNames: string[];
  [childName: string]: unknown;
}

class JoinRelatedOperation extends QueryBuilderOperation {
  declare calls: JoinRelatedCall[];

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);
    this.calls = [];
  }

  get joinOperation(): string | undefined {
    return this.opt.joinOperation;
  }

  addCall(call: JoinRelatedCall): void {
    this.calls.push(call);
  }

  onBuild(builder: QueryBuilder): void {
    const modelClass = builder.modelClass();
    const joinOperation = this.joinOperation;
    let mergedExpr = RelationExpression.create();

    for (const call of this.calls) {
      const expr: RelationExpressionPojo = RelationExpression.create(call.expression).toPojo();
      const childNames = expr.$childNames;
      const options = call.options || {};

      if (childNames.length === 1) {
        applyAlias(expr, modelClass, builder, options);
      }

      if (options.aliases) {
        applyAliases(expr, modelClass, options);
      }

      mergedExpr = mergedExpr.merge(expr);
    }

    const joiner = new RelationJoiner({
      modelClass,
    });

    joiner.setOptions({ joinOperation });
    joiner.setExpression(mergedExpr);
    joiner.setModifiers(builder.modifiers());
    joiner.build(builder, false);
  }

  clone(): this {
    const clone = super.clone();
    clone.calls = this.calls.slice();
    return clone;
  }
}

function applyAlias(
  expr: RelationExpressionPojo,
  modelClass: ModelClass,
  builder: QueryBuilder,
  options: JoinRelatedOptions,
): void {
  const childNames = expr.$childNames;
  const childName = childNames[0];
  const childExpr = expr[childName] as RelationExpressionPojo;
  const relation = modelClass.getRelation(childExpr.$relation);

  let alias = childName;

  if (options.alias === false) {
    alias = builder.tableRefFor(relation.relatedModelClass);
  } else if (isString(options.alias)) {
    alias = options.alias;
  }

  if (childName !== alias) {
    renameRelationExpressionNode(expr, childName, alias);
  }
}

function applyAliases(
  expr: RelationExpressionPojo,
  modelClass: ModelClass,
  options: JoinRelatedOptions,
): void {
  for (const childName of expr.$childNames) {
    const childExpr = expr[childName] as RelationExpressionPojo;
    const relation = modelClass.getRelation(childExpr.$relation);
    const alias = (options.aliases as Record<string, string>)[childExpr.$relation];

    if (alias && alias !== childName) {
      renameRelationExpressionNode(expr, childName, alias);
    }

    applyAliases(childExpr, relation.relatedModelClass as ModelClass, options);
  }
}

function renameRelationExpressionNode(
  expr: RelationExpressionPojo,
  oldName: string,
  newName: string,
): void {
  const childExpr = expr[oldName] as RelationExpressionPojo;
  delete expr[oldName];
  expr[newName] = childExpr;
  childExpr.$name = newName;
  expr.$childNames = expr.$childNames.map((it) => (it === oldName ? newName : it));
}

export { JoinRelatedOperation };
