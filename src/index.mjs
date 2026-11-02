// The ES module entry of the package. It re-exports the CommonJS build, so
// `import { Model }` and `require(...).Model` are the same class and there is
// only one copy of objection in memory (no dual package hazard).

import objection from './objection.js';

export const {
  Model,
  QueryBuilder,
  QueryBuilderBase,
  QueryBuilderOperation,
  RelationExpression,
  ValidationError,
  NotFoundError,
  AjvValidator,
  Validator,
  Relation,
  HasOneRelation,
  HasManyRelation,
  BelongsToOneRelation,
  HasOneThroughRelation,
  ManyToManyRelation,
  transaction,
  initialize,
  compose,
  mixin,
  defineRelations,
  ref,
  val,
  raw,
  fn,
  snakeCaseMappers,
  knexSnakeCaseMappers,
  knexIdentifierMapping,
  DBError,
  UniqueViolationError,
  NotNullViolationError,
  ForeignKeyViolationError,
  ConstraintViolationError,
  CheckViolationError,
  DataError,
} = objection;

export default objection;
