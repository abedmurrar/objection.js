import type { ModelClass } from './Model';

interface NotFoundErrorArgs {
  modelClass?: ModelClass;
  data?: Record<string, unknown>;
  statusCode?: number;
  message?: string;
  [prop: string]: unknown;
}

class NotFoundError extends Error {
  declare type: string;
  declare data: Record<string, unknown>;
  declare statusCode: number;
  declare modelClass: ModelClass | undefined;

  constructor({ modelClass, data = {}, statusCode = 404, ...rest }: NotFoundErrorArgs = {}) {
    super((rest.message as string | undefined) || 'NotFoundError');

    this.type = 'NotFound';
    this.name = this.constructor.name;
    this.data = { ...rest, ...data };
    this.statusCode = statusCode;

    // Add as non-enumerable in case people are passing instances of
    // this error directly to `JSON.stringify`.
    Object.defineProperty(this, 'modelClass', {
      value: modelClass,
      enumerable: false,
    });
  }
}

export { NotFoundError };
export type { NotFoundErrorArgs };
