import { EagerOperation } from './EagerOperation';
import { RelationJoiner } from '../../join/RelationJoiner';
import type { OperationOptions, QueryBuilder } from '../types';

// `RelationJoiner` is still JavaScript, exported as a value only.
type RelationJoinerInstance = InstanceType<typeof RelationJoiner>;

class JoinEagerOperation extends EagerOperation {
  declare joiner: RelationJoinerInstance | null;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);
    this.joiner = null;
  }

  onAdd(builder: QueryBuilder): boolean {
    builder.findOptions({ callAfterFindDeeply: true });

    this.joiner = new RelationJoiner({
      modelClass: builder.modelClass(),
    });

    return true;
  }

  onBefore3(builder: QueryBuilder): unknown {
    return this.joiner!.setExpression(this.buildFinalExpression())
      .setModifiers(this.buildFinalModifiers(builder))
      .setOptions(this.graphOptions)
      .fetchColumnInfo(builder);
  }

  onBuild(builder: QueryBuilder): void {
    this.joiner!.setExpression(this.buildFinalExpression())
      .setModifiers(this.buildFinalModifiers(builder))
      .setOptions(this.graphOptions)
      .build(builder);
  }

  onRawResult(builder: QueryBuilder, rows: unknown): unknown {
    return this.joiner!.parseResult(builder, rows);
  }

  clone(): this {
    const clone = super.clone();
    clone.joiner = this.joiner;
    return clone;
  }
}

export { JoinEagerOperation };
