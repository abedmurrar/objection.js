import { QueryBuilderOperation } from '../QueryBuilderOperation';
import { RelationExpression } from '../../RelationExpression';
import type { GraphOptions, Modifiers, OperationOptions, QueryBuilder } from '../types';

// A modifier added with `modifyGraph(path, modifier)`.
interface ModifierAtPath {
  path: unknown;
  modifier: unknown;
}

class EagerOperation extends QueryBuilderOperation {
  declare expression: RelationExpression;
  declare modifiersAtPath: ModifierAtPath[];
  declare graphOptions: GraphOptions;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);

    this.expression = RelationExpression.create();
    this.modifiersAtPath = [];
    this.graphOptions = this.opt.defaultGraphOptions as GraphOptions;
  }

  buildFinalExpression(): RelationExpression {
    const expression = this.expression.clone();

    this.modifiersAtPath.forEach((modifier, i) => {
      const modifierName = getModifierName(i);

      expression
        .expressionsAtPath(modifier.path)
        .forEach((expr: { node: { $modify: string[] } }) => {
          expr.node.$modify.push(modifierName);
        });
    });

    return expression;
  }

  buildFinalModifiers(builder: QueryBuilder): Modifiers {
    // `modifiers()` returns a clone so we can modify it.
    const modifiers = builder.modifiers();

    this.modifiersAtPath.forEach((modifier, i) => {
      const modifierName = getModifierName(i);

      modifiers[modifierName] = modifier.modifier;
    });

    return modifiers;
  }

  cloneFrom(eagerOp: EagerOperation): void {
    this.expression = eagerOp.expression.clone();
    this.modifiersAtPath = eagerOp.modifiersAtPath.slice();
    this.graphOptions = Object.assign({}, eagerOp.graphOptions);
  }

  clone(): this {
    const clone = super.clone();
    clone.cloneFrom(this);
    return clone;
  }
}

function getModifierName(index: number): string {
  return `_f${index}_`;
}

export { EagerOperation };
