class RelationDoesNotExistError extends Error {
  declare relationName: string | null;

  constructor(relationName: string | null) {
    super(`unknown relation "${relationName}" in a relation expression`);

    this.name = this.constructor.name;
    this.relationName = relationName;
  }
}

export { RelationDoesNotExistError };
