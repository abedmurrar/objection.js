import { QueryBuilderOperation } from './QueryBuilderOperation';
import type { KnexBuilder, OperationClass, OperationOptions, QueryBuilder } from './types';

// Operation that simply delegates all calls to the operation passed
// to to the constructor in `opt.delegate`.
class DelegateOperation extends QueryBuilderOperation {
  declare delegate: QueryBuilderOperation;

  constructor(name: string | null, opt: OperationOptions) {
    super(name, opt);

    this.delegate = opt.delegate as QueryBuilderOperation;
  }

  get modelOptions(): unknown {
    return (this.delegate as QueryBuilderOperation & { modelOptions?: unknown }).modelOptions;
  }

  is(OperationClass: OperationClass): boolean {
    return super.is(OperationClass) || this.delegate.is(OperationClass);
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    return this.delegate.onAdd(builder, args);
  }

  onBefore1(builder: QueryBuilder, result: unknown): unknown {
    return this.delegate.onBefore1(builder, result);
  }

  hasOnBefore1(): boolean {
    return this.onBefore1 !== DelegateOperation.prototype.onBefore1 || this.delegate.hasOnBefore1();
  }

  onBefore2(builder: QueryBuilder, result: unknown): unknown {
    return this.delegate.onBefore2(builder, result);
  }

  hasOnBefore2(): boolean {
    return this.onBefore2 !== DelegateOperation.prototype.onBefore2 || this.delegate.hasOnBefore2();
  }

  onBefore3(builder: QueryBuilder, result: unknown): unknown {
    return this.delegate.onBefore3(builder, result);
  }

  hasOnBefore3(): boolean {
    return this.onBefore3 !== DelegateOperation.prototype.onBefore3 || this.delegate.hasOnBefore3();
  }

  onBuild(builder: QueryBuilder): unknown {
    return this.delegate.onBuild(builder);
  }

  hasOnBuild(): boolean {
    return this.onBuild !== DelegateOperation.prototype.onBuild || this.delegate.hasOnBuild();
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    return this.delegate.onBuildKnex(knexBuilder, builder);
  }

  hasOnBuildKnex(): boolean {
    return (
      this.onBuildKnex !== DelegateOperation.prototype.onBuildKnex || this.delegate.hasOnBuildKnex()
    );
  }

  onRawResult(builder: QueryBuilder, result: unknown): unknown {
    return this.delegate.onRawResult(builder, result);
  }

  hasOnRawResult(): boolean {
    return (
      this.onRawResult !== DelegateOperation.prototype.onRawResult || this.delegate.hasOnRawResult()
    );
  }

  onAfter1(builder: QueryBuilder, result: unknown): unknown {
    return this.delegate.onAfter1(builder, result);
  }

  hasOnAfter1(): boolean {
    return this.onAfter1 !== DelegateOperation.prototype.onAfter1 || this.delegate.hasOnAfter1();
  }

  onAfter2(builder: QueryBuilder, result: unknown): unknown {
    return this.delegate.onAfter2(builder, result);
  }

  hasOnAfter2(): boolean {
    return this.onAfter2 !== DelegateOperation.prototype.onAfter2 || this.delegate.hasOnAfter2();
  }

  onAfter3(builder: QueryBuilder, result: unknown): unknown {
    return this.delegate.onAfter3(builder, result);
  }

  hasOnAfter3(): boolean {
    return this.onAfter3 !== DelegateOperation.prototype.onAfter3 || this.delegate.hasOnAfter3();
  }

  queryExecutor(builder: QueryBuilder): unknown {
    return this.delegate.queryExecutor(builder);
  }

  hasQueryExecutor(): boolean {
    return (
      this.queryExecutor !== DelegateOperation.prototype.queryExecutor ||
      this.delegate.hasQueryExecutor()
    );
  }

  onError(builder: QueryBuilder, error: unknown): unknown {
    return this.delegate.onError(builder, error);
  }

  hasOnError(): boolean {
    return this.onError !== DelegateOperation.prototype.onError || this.delegate.hasOnError();
  }

  toFindOperation(builder: QueryBuilder): QueryBuilderOperation | null {
    return this.delegate.toFindOperation(builder);
  }

  hasToFindOperation(): boolean {
    return (
      this.hasToFindOperation !== DelegateOperation.prototype.hasToFindOperation ||
      this.delegate.hasToFindOperation()
    );
  }

  clone(): this {
    const clone = super.clone();
    clone.delegate = this.delegate && this.delegate.clone();
    return clone;
  }
}

export { DelegateOperation };
