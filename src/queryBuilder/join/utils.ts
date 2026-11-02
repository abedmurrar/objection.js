import type { ModelClassWithRelations, RelationExpression } from '../RelationExpression';
import { ValidationErrorType } from '../../model/ValidationError';

const ID_LENGTH_LIMIT = 63;
const RELATION_RECURSION_LIMIT = 64;

// Given a relation expression, goes through all first level children.
function forEachChildExpression<R>(
  expr: RelationExpression,
  modelClass: ModelClassWithRelations<R> & {
    createValidationError(error: { type: string; message: string }): Error;
  },
  callback: (childExpr: RelationExpression, relation: R | null) => void,
): void {
  if (expr.node.$allRecursive || expr.maxRecursionDepth > RELATION_RECURSION_LIMIT) {
    throw modelClass.createValidationError({
      type: ValidationErrorType.RelationExpression,
      message: `recursion depth of eager expression ${expr.toString()} too big for JoinEagerAlgorithm`,
    });
  }

  expr.forEachChildExpression(modelClass, callback);
}

export { ID_LENGTH_LIMIT, RELATION_RECURSION_LIMIT, forEachChildExpression };
