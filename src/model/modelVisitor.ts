import type { Model, ModelClass } from './Model';
import type { Relation } from '../relations/Relation';

type Models = Model | Model[] | null | undefined;

// Called for every model of a graph with the model, its class, and the model
// and the relation it was found through.
type ModelVisitor = (
  model: Model,
  modelClass: ModelClass,
  parent: Model | null,
  rel: Relation | null,
) => void;

function visitModels(models: Models, modelClass: ModelClass, visitor: ModelVisitor): void {
  doVisit(models, modelClass, null, null, visitor);
}

function doVisit(
  models: Models,
  modelClass: ModelClass,
  parent: Model | null,
  rel: Relation | null,
  visitor: ModelVisitor,
): void {
  if (Array.isArray(models)) {
    visitMany(models, modelClass, parent, rel, visitor);
  } else if (models) {
    visitOne(models, modelClass, parent, rel, visitor);
  }
}

function visitMany(
  models: Model[],
  modelClass: ModelClass,
  parent: Model | null,
  rel: Relation | null,
  visitor: ModelVisitor,
): void {
  for (let i = 0, l = models.length; i < l; ++i) {
    visitOne(models[i], modelClass, parent, rel, visitor);
  }
}

function visitOne(
  model: Model,
  modelClass: ModelClass,
  parent: Model | null,
  rel: Relation | null,
  visitor: ModelVisitor,
): void {
  if (model) {
    visitor(model, modelClass, parent, rel);
  }

  const relationNames = modelClass.getRelationNames();

  for (let i = 0, l = relationNames.length; i < l; ++i) {
    const relationName = relationNames[i];
    const relatedObj = model[relationName] as Models;

    if (relatedObj) {
      const relation = modelClass.getRelation(relationName);
      doVisit(relatedObj, relation.relatedModelClass, model, relation, visitor);
    }
  }
}

export { visitModels };
export type { ModelVisitor };
