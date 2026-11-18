// Compares the hand-written public types in typings/ with the implementation in
// src/, so that neither can gain or lose a member without the other. src/ is
// typed loosely on purpose (no generics, `unknown` arguments), so only the
// names are compared, and that both sides are functions where the typings say
// so, not the signatures.
//
// A failure names the members, like:
//   Type '"newMethod"' does not satisfy the constraint 'never'.
// Declare a new public member in typings/objection/index.d.ts, or, if it's
// internal, add it to the lists below.
import type * as Public from '../../';
import type * as Impl from '../../src/objection.js';

type PublicValues = typeof Public;
type ImplValues = typeof Impl;

// Members that only exist in the types, for the type-level machinery.
type TypeOnly = `~${string}` | 'QueryBuilderType' | 'ModelType' | 'ResultType';

// Internal members by their naming convention.
type Internal = `_${string}` | `$$${string}` | 'constructor';

// The implementation's `Model` has `[property: string]: any` for the data of
// the models, which would make every name a member.
type RemoveIndex<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

type Missing<A, B, Allowed = never> = Exclude<keyof A, keyof B | Allowed | TypeOnly | Internal>;

// The names of the members that are functions in `A` but not in `B`.
type NotFunctions<A, B> = {
  [K in keyof A & keyof B]: A[K] extends (...args: any[]) => any
    ? B[K] extends (...args: any[]) => any
      ? never
      : K
    : never;
}[keyof A & keyof B];

// Fails with the names when `T` isn't `never`.
function none<_T extends never>() {}

// Undocumented members of the implementation, which the typings leave out.

type InternalModelMembers =
  | '$hasId'
  | '$hasProps'
  | '$idKey'
  | '$isObjectionModel'
  | '$objectionModelClass'
  | '$propKey'
  | '$ref'
  | '$values';

type InternalModelStatics =
  | 'JoinEagerAlgorithm'
  | 'ModifierNotFoundError'
  | 'NaiveEagerAlgorithm'
  | 'WhereInEagerAlgorithm'
  | 'defaultFindOptions'
  | 'ensureModel'
  | 'ensureModelArray'
  | 'getColumnNameMappers'
  | 'getConcurrency'
  | 'getDefaultGraphOptions'
  | 'getIdColumn'
  | 'getIdColumnArray'
  | 'getIdProperty'
  | 'getIdPropertyArray'
  | 'getIdRelationProperty'
  | 'getJsonAttributes'
  | 'getJsonSchema'
  | 'getModifiers'
  | 'getReadOnlyAttributes'
  | 'getRelatedFindQueryMutates'
  | 'getRelatedInsertQueryMutates'
  | 'getRelationMappings'
  | 'getRelationNames'
  | 'getRelationUnsafe'
  | 'getTableName'
  | 'getValidator'
  | 'getVirtualAttributes'
  | 'isObjectionModelClass'
  | 'joinTableAlias'
  | 'objectionModelClass'
  | 'omitImpl'
  | 'onCreateQuery'
  | 'uniqueTag';

type InternalQueryBuilderMembers =
  // Documented as not in the types (doc/api/query-builder/other-methods.md).
  | 'off'
  | 'toString'
  | 'addOperation'
  | 'addOperationToFront'
  | 'addOperationUsingMethod'
  | 'allowedGraphExpression'
  | 'baseCloneInto'
  | 'callAsyncOperationMethod'
  | 'callMaybeAsyncOperationMethod'
  | 'callOperationMethod'
  | 'childQueryOf'
  | 'clearModifiers'
  | 'clearReject'
  | 'clearResolve'
  | 'clearWithGraphFetched'
  | 'copyFrom'
  | 'createOperationsSummary'
  | 'deleteOperationFactory'
  | 'emptyInstance'
  | 'everyOperation'
  | 'executeOnBuild'
  | 'executeOnBuildKnex'
  | 'executeOnBuildOf'
  | 'findAllSelections'
  | 'findLastOperation'
  | 'findOperation'
  | 'findOperationFactory'
  | 'findOptions'
  | 'findSelection'
  | 'forEachOperation'
  | 'fromJS'
  | 'fullIdColumn'
  | 'fullIdColumnFor'
  | 'graphModifiersAtPath'
  | 'hasSelection'
  | 'hasSelectionAs'
  | 'insertOperationFactory'
  | 'internalContext'
  | 'internalOptions'
  | 'isExplicitlyResolvedOrRejected'
  | 'isObjectionQueryBuilderBase'
  | 'isPartial'
  | 'isSelectAll'
  | 'needsWhereGrouping'
  | 'operationsSummary'
  | 'parentQuery'
  | 'patchOperationFactory'
  | 'relateOperationFactory'
  | 'removeChildOperationsByHookName'
  | 'removeOperation'
  | 'replaceOperation'
  | 'resultModelClass'
  | 'subqueryOf'
  | 'summarizeOperation'
  | 'summarizeOperations'
  | 'tableName'
  | 'tableRef'
  | 'toFindQuery'
  | 'toSql'
  | 'traverse'
  | 'unrelateOperationFactory'
  | 'unsafeKnex'
  | 'updateOperationFactory';

// The exports of the package.
none<Missing<PublicValues, ImplValues>>();
none<Missing<ImplValues, PublicValues>>();
none<NotFunctions<PublicValues, ImplValues>>();

// Model instances.
type PublicModel = Public.Model;
type ImplModel = RemoveIndex<InstanceType<ImplValues['Model']>>;

none<Missing<PublicModel, ImplModel>>();
none<Missing<ImplModel, PublicModel, InternalModelMembers>>();
none<NotFunctions<PublicModel, ImplModel>>();

// Model classes.
type PublicModelClass = PublicValues['Model'];
type ImplModelClass = ImplValues['Model'];

none<Missing<PublicModelClass, ImplModelClass>>();
none<Missing<ImplModelClass, PublicModelClass, InternalModelStatics>>();
none<NotFunctions<PublicModelClass, ImplModelClass>>();

// Query builders.
type PublicQueryBuilder = Public.QueryBuilder<Public.Model>;
type ImplQueryBuilder = InstanceType<ImplValues['QueryBuilder']>;

none<Missing<PublicQueryBuilder, ImplQueryBuilder>>();
none<Missing<ImplQueryBuilder, PublicQueryBuilder, InternalQueryBuilderMembers>>();
none<NotFunctions<PublicQueryBuilder, ImplQueryBuilder>>();
