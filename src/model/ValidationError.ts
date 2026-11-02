import { asArray, isString } from '../utils/objectUtils';
import type { ModelClass } from './Model';

const ValidationErrorType = {
  ModelValidation: 'ModelValidation',
  RelationExpression: 'RelationExpression',
  UnallowedRelation: 'UnallowedRelation',
  InvalidGraph: 'InvalidGraph',
};

// An error message, or an object with one, like the errors of Ajv.
type ErrorItem = string | { message?: string };

interface ValidationErrorArgs {
  type?: string;
  message?: string;
  modelClass?: ModelClass;
  data?: Record<string, ErrorItem | ErrorItem[]>;
  statusCode?: number;
}

class ValidationError extends Error {
  declare type: string | undefined;
  declare data: Record<string, ErrorItem | ErrorItem[]>;
  declare statusCode: number;
  declare modelClass: ModelClass | undefined;

  static get Type(): typeof ValidationErrorType {
    return ValidationErrorType;
  }

  constructor({ type, message, modelClass, data = {}, statusCode = 400 }: ValidationErrorArgs) {
    super(message || errorsToMessage(data));

    this.name = this.constructor.name;
    this.type = type;
    this.data = data;
    this.statusCode = statusCode;

    // Add as non-enumerable in case people are passing instances of
    // this error directly to `JSON.stringify`.
    Object.defineProperty(this, 'modelClass', {
      value: modelClass,
      enumerable: false,
    });
  }
}

function errorsToMessage(data: Record<string, ErrorItem | ErrorItem[]>): string {
  return Object.keys(data)
    .reduce<string[]>((messages, key) => {
      messages.push(`${key}: ${asArray(data[key]).map(message).join(', ')}`);
      return messages;
    }, [])
    .join(', ');
}

function message(it: ErrorItem): string | undefined {
  if (isString(it)) {
    return it as string;
  } else {
    return (it as { message?: string }).message;
  }
}

export { ValidationError, ValidationErrorType };
export type { ValidationErrorArgs };
