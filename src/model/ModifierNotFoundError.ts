class ModifierNotFoundError extends Error {
  declare modifierName: unknown;

  constructor(modifierName: unknown) {
    super(`Unable to determine modify function from provided value: "${modifierName}".`);
    this.modifierName = modifierName;
  }
}

export { ModifierNotFoundError };
