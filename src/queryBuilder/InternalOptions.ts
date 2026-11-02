class InternalOptions {
  declare skipUndefined: boolean;
  declare keepImplicitJoinProps: boolean;
  declare returnImmediatelyValue: unknown;
  declare isInternalQuery: boolean;
  declare debug: boolean;
  declare schema: string | undefined;

  constructor() {
    this.skipUndefined = false;
    this.keepImplicitJoinProps = false;
    this.returnImmediatelyValue = undefined;
    this.isInternalQuery = false;
    this.debug = false;
    this.schema = undefined;
  }

  clone(): this {
    const copy = new (this.constructor as new () => this)();

    copy.skipUndefined = this.skipUndefined;
    copy.keepImplicitJoinProps = this.keepImplicitJoinProps;
    copy.returnImmediatelyValue = this.returnImmediatelyValue;
    copy.isInternalQuery = this.isInternalQuery;
    copy.debug = this.debug;
    copy.schema = this.schema;

    return copy;
  }
}

export { InternalOptions };
