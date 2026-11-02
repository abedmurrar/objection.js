'use strict';

const {
  DBError,
  UniqueViolationError,
  NotNullViolationError,
  ForeignKeyViolationError,
  ConstraintViolationError,
  CheckViolationError,
  DataError,
} = require('db-errors');
const { Model } = require('./model/Model');
const { QueryBuilder } = require('./queryBuilder/QueryBuilder');
const { QueryBuilderBase } = require('./queryBuilder/QueryBuilderBase');
const { QueryBuilderOperation } = require('./queryBuilder/operations/QueryBuilderOperation');
const { RelationExpression } = require('./queryBuilder/RelationExpression');
const { ValidationError } = require('./model/ValidationError');
const { NotFoundError } = require('./model/NotFoundError');
const { AjvValidator } = require('./model/AjvValidator');
const { Validator } = require('./model/Validator');
const { Relation } = require('./relations/Relation');
const { HasOneRelation } = require('./relations/hasOne/HasOneRelation');
const { HasManyRelation } = require('./relations/hasMany/HasManyRelation');
const { BelongsToOneRelation } = require('./relations/belongsToOne/BelongsToOneRelation');
const { HasOneThroughRelation } = require('./relations/hasOneThrough/HasOneThroughRelation');
const { ManyToManyRelation } = require('./relations/manyToMany/ManyToManyRelation');
const { transaction } = require('./transaction');
const { initialize } = require('./initialize');

const {
  snakeCaseMappers,
  knexSnakeCaseMappers,
  knexIdentifierMapping,
} = require('./utils/identifierMapping');
const { compose, mixin } = require('./utils/mixin');
const { ref } = require('./queryBuilder/ReferenceBuilder');
const { val } = require('./queryBuilder/ValueBuilder');
const { raw } = require('./queryBuilder/RawBuilder');
const { fn } = require('./queryBuilder/FunctionBuilder');

// Returns the relation mappings as is. This only exists for typescript: it
// preserves the exact types of the mappings (like the names of `extra`
// columns) so that the relation types can be inferred from them.
function defineRelations(relationMappings) {
  return relationMappings;
}

module.exports = {
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
};
