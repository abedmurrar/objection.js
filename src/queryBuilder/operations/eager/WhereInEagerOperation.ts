import * as promiseUtils from '../../../utils/promiseUtils';

import { EagerOperation } from './EagerOperation';
import { isMsSql, isOracle, isSqlite } from '../../../utils/knexUtils';
import { isObject, asArray, flatten, chunk } from '../../../utils/objectUtils';
import { ValidationErrorType } from '../../../model/ValidationError';
import { createModifier } from '../../../utils/createModifier';
import { RelationDoesNotExistError } from '../../../model/RelationDoesNotExistError';
import { RelationOwner } from '../../../relations/RelationOwner';
import type {
  KnexInstance,
  Model,
  ModelClass,
  OperationOptions,
  QueryBuilder,
  Relation,
} from '../types';
import type { RelationFindOperation } from '../../../relations/RelationFindOperation';

// A `RelationExpression`, which is still JavaScript.
interface ChildExpression {
  node: { $name: string | null; $modify: string[] };
  forEachChildExpression(
    modelClass: ModelClass,
    // `relation` is only null for a recursive relation that doesn't exist.
    cb: (childExpression: ChildExpression, relation: Relation | null) => void,
  ): void;
}

interface RelationToFetch {
  childExpression: ChildExpression;
  relation: Relation;
}

class WhereInEagerOperation extends EagerOperation {
  declare relationsToFetch: RelationToFetch[];
  declare omitProps: string[];

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);

    this.relationsToFetch = [];
    this.omitProps = [];
  }

  batchSize(knex: KnexInstance): number {
    if (this.graphOptions.maxBatchSize) {
      return this.graphOptions.maxBatchSize;
    } else if (isMsSql(knex)) {
      // On MSSQL the parameter limit is actually 2100, but since I couldn't figure out
      // if the limit is for all parameters in a query or for individual clauses, we set
      // the limit to 2000 to leave 100 parameters for where clauses etc.
      return 2000;
    } else if (isOracle(knex)) {
      return 1000;
    } else if (isSqlite(knex)) {
      // SQLITE_MAX_VARIABLE_NUMBER is 999 by default
      return 999;
    } else {
      // I'm sure there is some kind of limit for other databases too, but let's lower
      // this if someone ever hits those limits.
      return 10000;
    }
  }

  onBuild(builder: QueryBuilder): void {
    const relationsToFetch = findRelationsToFetch(
      builder.modelClass(),
      this.buildFinalExpression(),
    );

    const { selectionsToAdd, selectedProps } = findRelationPropsToSelect(builder, relationsToFetch);

    if (selectionsToAdd.length) {
      builder.select(selectionsToAdd);
    }

    this.relationsToFetch = relationsToFetch;
    this.omitProps = selectedProps;
  }

  // `result` is whatever the query returned: models, a model, or something else
  // like a `count` result.
  async onAfter2(builder: QueryBuilder, result: any): Promise<unknown> {
    const modelClass = builder.resultModelClass();

    if (!result) {
      return result;
    }

    const models: Model[] = asArray(result);

    // Check models to be actual objects, to filter out `count` results (#2397).
    if (!models.length || !isObject(models[0])) {
      return result;
    }

    await promiseUtils.map(
      this.relationsToFetch,
      (it: RelationToFetch) => this.fetchRelation(builder, models, it.relation, it.childExpression),
      { concurrency: modelClass.getConcurrency(builder.unsafeKnex()) },
    );

    const intOpt = builder.internalOptions();

    if (!this.omitProps.length || intOpt.keepImplicitJoinProps) {
      return result;
    }

    // Now that relations have been fetched for `models` we can omit the
    // columns that were implicitly selected by this class.
    for (let i = 0, l = result.length; i < l; ++i) {
      const model = result[i];

      for (let c = 0, lc = this.omitProps.length; c < lc; ++c) {
        modelClass.omitImpl(model, this.omitProps[c]);
      }
    }

    return result;
  }

  async fetchRelation(
    builder: QueryBuilder,
    models: Model[],
    relation: Relation,
    expr: ChildExpression,
  ): Promise<unknown[]> {
    const modelClass = builder.resultModelClass();
    const batchSize = this.batchSize(builder.knex());
    const modelBatches = chunk(models, batchSize);

    const result = await promiseUtils.map(
      modelBatches,
      (batch: Model[]) => this.fetchRelationBatch(builder, batch, relation, expr),
      {
        concurrency: modelClass.getConcurrency(builder.unsafeKnex()),
      },
    );

    return flatten(result);
  }

  fetchRelationBatch(
    builder: QueryBuilder,
    models: Model[],
    relation: Relation,
    expr: ChildExpression,
  ): QueryBuilder | PromiseLike<unknown> {
    if (this.shouldSkipFetched(models, relation, expr)) {
      return this.createSkippedQuery(builder, models, relation, expr);
    }

    const queryBuilder = this.createRelationQuery(builder, relation, expr);
    // `Relation` types the operations it creates as `RelationOperation`.
    const findOperation = relation.find(
      queryBuilder,
      RelationOwner.create(models),
    ) as RelationFindOperation;

    findOperation.alwaysReturnArray = true;
    findOperation.assignResultToOwner = true;
    findOperation.relationProperty = expr.node.$name!;
    // The related models are assigned after the hooks of the query, so that
    // what `afterFind()` returns, e.g. filtered models, ends up in the graph.
    findOperation.assignAfterHooks = !!relation.relatedModelClass.useAfterFindInGraphs;

    queryBuilder.addOperation(findOperation, []);

    for (const modifierName of expr.node.$modify) {
      const modifier = createModifier({
        modifier: modifierName,
        modelClass: relation.relatedModelClass,
        modifiers: this.buildFinalModifiers(builder),
      });

      try {
        modifier(queryBuilder);
      } catch (err) {
        const modelClass = builder.modelClass();

        if (err instanceof modelClass.ModifierNotFoundError) {
          throw modelClass.createValidationError({
            type: ValidationErrorType.RelationExpression,
            message: `could not find modifier "${modifierName}" for relation "${relation.name}"`,
          });
        } else {
          throw err;
        }
      }
    }

    if (findOperation.assignAfterHooks) {
      return queryBuilder.then((result) => findOperation.assignResult(queryBuilder, result));
    } else {
      return queryBuilder;
    }
  }

  shouldSkipFetched(models: Model[], relation: Relation, expr: ChildExpression): boolean {
    if (!this.graphOptions.skipFetched) {
      return false;
    }

    if (models.some((it) => it[expr.node.$name!] === undefined)) {
      return false;
    }

    const relationsToFetch = findRelationsToFetch(relation.relatedModelClass as ModelClass, expr);
    const childModels = getRelatedModels(models, expr);

    // We can only skip fetching a relation if all already fetched models
    // have all needed relation properties so that we can fetch the next
    // level of relations.
    for (const { relation } of relationsToFetch) {
      const { ownerProp } = relation;

      for (let c = 0, lc = ownerProp.size; c < lc; ++c) {
        const prop = ownerProp.props[c];

        for (const model of childModels) {
          if (model[prop] === undefined) {
            return false;
          }
        }
      }
    }

    return true;
  }

  createSkippedQuery(
    builder: QueryBuilder,
    models: Model[],
    relation: Relation,
    expr: ChildExpression,
  ): QueryBuilder {
    const childModels = getRelatedModels(models, expr);

    return relation.relatedModelClass
      .query()
      .childQueryOf(builder)
      .findOptions({ dontCallFindHooks: true })
      .withGraphFetched(expr, this.graphOptions)
      .resolve(childModels);
  }

  createRelationQuery(
    builder: QueryBuilder,
    relation: Relation,
    expr: ChildExpression,
  ): QueryBuilder {
    return relation.relatedModelClass
      .query()
      .childQueryOf(builder)
      .withGraphFetched(expr, this.graphOptions)
      .modifiers(this.buildFinalModifiers(builder));
  }

  clone(): this {
    const clone = super.clone();

    clone.relationsToFetch = this.relationsToFetch.slice();
    clone.omitProps = this.omitProps.slice();

    return clone;
  }
}

function findRelationsToFetch(
  modelClass: ModelClass,
  eagerExpression: ChildExpression,
): RelationToFetch[] {
  const relationsToFetch: RelationToFetch[] = [];

  try {
    eagerExpression.forEachChildExpression(modelClass, (childExpression, relation) => {
      relationsToFetch.push({
        childExpression,
        relation,
      } as RelationToFetch);
    });
  } catch (err) {
    if (err instanceof RelationDoesNotExistError) {
      throw modelClass.createValidationError({
        type: ValidationErrorType.RelationExpression,
        message: `unknown relation "${err.relationName}" in an eager expression`,
      });
    }
    throw err;
  }

  return relationsToFetch;
}

function findRelationPropsToSelect(
  builder: QueryBuilder,
  relationsToFetch: RelationToFetch[],
): { selectionsToAdd: string[]; selectedProps: string[] } {
  const selectionsToAdd: string[] = [];
  const selectedProps: string[] = [];

  // Collect columns that need to be selected for the eager fetch
  // to work that are not currently selected.
  for (const { relation } of relationsToFetch) {
    const ownerProp = relation.ownerProp;

    for (let c = 0, lc = ownerProp.size; c < lc; ++c) {
      const fullCol = ownerProp.ref(builder, c).fullColumn(builder);
      const prop = ownerProp.props[c];
      const col = ownerProp.cols[c];

      if (!builder.hasSelectionAs(fullCol, col) && selectionsToAdd.indexOf(fullCol) === -1) {
        selectedProps.push(prop);
        selectionsToAdd.push(fullCol);
      }
    }
  }

  return {
    selectionsToAdd,
    selectedProps,
  };
}

function getRelatedModels(models: Model[], expr: ChildExpression): Model[] {
  const allRelated: Model[] = [];

  for (const model of models) {
    const related = model[expr.node.$name!] as Model | Model[] | undefined;

    if (related) {
      if (Array.isArray(related)) {
        for (const rel of related) {
          allRelated.push(rel);
        }
      } else {
        allRelated.push(related);
      }
    }
  }

  return allRelated;
}

export { WhereInEagerOperation };
