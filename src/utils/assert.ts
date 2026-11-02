// The parts of a model instance that are used here.
interface AssertableModel {
  $hasId(): boolean;
  constructor: {
    name: string;
    getIdColumnArray(): string[];
  };
}

function assertHasId(model: AssertableModel): void {
  if (!model.$hasId()) {
    const modelClass = model.constructor;
    const ids = modelClass.getIdColumnArray().join(', ');

    throw new Error(
      `one of the identifier columns [${ids}] is null or undefined. Have you specified the correct identifier column for the model '${modelClass.name}' using the 'idColumn' property?`,
    );
  }
}

function assertIdNotUndefined(id: unknown, message: string): void {
  if (Array.isArray(id)) {
    id.forEach((id) => assertIdNotUndefined(id, message));
  } else if (id === undefined) {
    throw Error(message);
  }
}

export { assertHasId, assertIdNotUndefined };
