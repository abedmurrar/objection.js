import { EagerOperation } from './EagerOperation';
import { RelationJoiner } from '../../join/RelationJoiner';
import { JoinedStaticHookArguments, hasStaticHook } from '../../StaticHookArguments';
import { asArray } from '../../../utils/objectUtils';
import type { Model, OperationOptions, QueryBuilder } from '../types';

// `RelationJoiner` is still JavaScript, exported as a value only.
type RelationJoinerInstance = InstanceType<typeof RelationJoiner>;

class JoinEagerOperation extends EagerOperation {
  declare joiner: RelationJoinerInstance | null;
  // The root models that the joined rows were parsed into.
  declare models: unknown;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);
    this.joiner = null;
    this.models = null;
  }

  onAdd(builder: QueryBuilder): boolean {
    builder.findOptions({ callAfterFindDeeply: true });

    this.joiner = new RelationJoiner({
      modelClass: builder.modelClass(),
    });

    return true;
  }

  onBefore3(builder: QueryBuilder): unknown {
    return this.configureJoiner(builder).fetchColumnInfo(builder);
  }

  // Also configures the joiner, because a query can be built without being
  // executed, e.g. by `toKnexQuery()`.
  onBuild(builder: QueryBuilder): void {
    this.configureJoiner(builder).build(builder);
  }

  configureJoiner(builder: QueryBuilder) {
    return this.joiner!.setExpression(this.buildFinalExpression())
      .setModifiers(this.buildFinalModifiers(builder))
      .setOptions(this.graphOptions);
  }

  onRawResult(builder: QueryBuilder, rows: unknown): unknown {
    this.models = this.joiner!.parseResult(builder, rows);
    return this.models;
  }

  // Calls the static `afterFind()` hooks of the joined related model classes
  // with `useAfterFindInGraphs`, from the deepest relation up, after the
  // `$afterFind()` hooks of all models, and assigns the related models that they
  // return, as `withGraphFetched()` does with them (dito #1963).
  // Synchronous unless a joined class uses `afterFind()`, so that the other
  // queries don't pay for a promise.
  onAfter3(builder: QueryBuilder, result: unknown): unknown {
    if (!Array.isArray(this.models) || !this.hasJoinedAfterFindHooks()) {
      return result;
    }

    return this.callJoinedAfterFindHooks(builder, result);
  }

  hasJoinedAfterFindHooks(): boolean {
    const nodes = this.joiner!.tableTree!.nodes;

    // The first node is the root, whose hooks the find query calls.
    for (let i = 1; i < nodes.length; ++i) {
      if (usesAfterFind(nodes[i].modelClass)) {
        return true;
      }
    }

    return false;
  }

  async callJoinedAfterFindHooks(builder: QueryBuilder, result: unknown): Promise<unknown> {
    const [rootNode, ...nodes] = this.joiner!.tableTree!.nodes;

    const modelsByNode = new Map<unknown, Model[]>([[rootNode, this.models as Model[]]]);
    const ownerByModel = new Map<Model, Model>();

    // The nodes are ordered from the root down, so the owners come first.
    for (const node of nodes) {
      const models: Model[] = [];

      for (const owner of modelsByNode.get(node.parentNode)!) {
        for (const model of asArray(owner[node.relationProperty!] as Model | Model[])) {
          if (model) {
            models.push(model);
            ownerByModel.set(model, owner);
          }
        }
      }

      modelsByNode.set(node, models);
    }

    for (const node of nodes.reverse()) {
      const { modelClass, relation } = node;
      const relationProperty = node.relationProperty!;

      if (!usesAfterFind(modelClass)) {
        continue;
      }

      const owners = modelsByNode.get(node.parentNode)!;
      const args = JoinedStaticHookArguments.create({
        builder,
        result: modelsByNode.get(node),
        relation,
        items: owners,
      });
      const related = await modelClass.afterFind(args);

      if (related === undefined) {
        continue;
      }

      const relatedByOwner = new Map<Model, Model[]>(owners.map((owner) => [owner, []]));

      for (const model of asArray(related as Model | Model[])) {
        const relatedOfOwner = relatedByOwner.get(ownerByModel.get(model)!);

        if (!relatedOfOwner) {
          throw new Error(
            `Unable to assign the result of ${modelClass.name}.afterFind() to the relation ` +
              `"${relation!.name}" of ${relation!.ownerModelClass.name}: return the models ` +
              'you got, filtered or reordered.',
          );
        }

        relatedOfOwner.push(model);
      }

      for (const [owner, related] of relatedByOwner) {
        owner[relationProperty] = relation!.isOneToOne() ? related[0] || null : related;
      }
    }

    return result;
  }

  clone(): this {
    const clone = super.clone();
    clone.joiner = this.joiner;
    clone.models = this.models;
    return clone;
  }
}

function usesAfterFind(modelClass: { useAfterFindInGraphs?: boolean }): boolean {
  return !!modelClass.useAfterFindInGraphs && hasStaticHook(modelClass as never, 'afterFind');
}

export { JoinEagerOperation };
