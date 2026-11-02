import * as promiseUtils from './utils/promiseUtils';
import { isFunction } from './utils/objectUtils';
import type { Knex } from 'knex';
import type { ModelClass } from './model/Model';

// The callback is called with the model classes bound to the transaction and
// the transaction, and `this` is the transaction.
type TransactionCallback = (this: Knex.Transaction, ...args: unknown[]) => unknown;

function transaction(...transactionArgs: unknown[]): Promise<unknown> {
  // There must be at least one model class and the callback.
  if (transactionArgs.length < 2) {
    return Promise.reject(
      new Error(
        'objection.transaction: provide at least one Model class to bind to the transaction or a knex instance',
      ),
    );
  }

  let args = Array.from(transactionArgs);

  if (!isModelClass(args[0]) && isFunction((args[0] as Partial<Knex>).transaction)) {
    const knex = args[0] as Knex;
    args = args.slice(1);

    return (knex.transaction as (...args: unknown[]) => Promise<unknown>).apply(knex, args);
  } else {
    // The last argument should be the callback and all other Model subclasses.
    const callback = args[args.length - 1] as TransactionCallback;
    const modelClasses = args.slice(0, args.length - 1) as ModelClass[];
    let i;

    for (i = 0; i < modelClasses.length; ++i) {
      if (!isModelClass(modelClasses[i])) {
        return Promise.reject(
          new Error('objection.transaction: all but the last argument should be Model subclasses'),
        );
      }
    }

    const knex = modelClasses[0].knex();
    for (i = 0; i < modelClasses.length; ++i) {
      if (modelClasses[i].knex() !== knex) {
        return Promise.reject(
          new Error(
            'objection.transaction: all Model subclasses must be bound to the same database',
          ),
        );
      }
    }

    return knex.transaction((trx) => {
      const args = new Array(modelClasses.length + 1);

      for (let i = 0; i < modelClasses.length; ++i) {
        args[i] = modelClasses[i].bindTransaction(trx);
      }

      args[args.length - 1] = trx;

      return promiseUtils.try(() => {
        return callback.apply(trx, args);
      }) as Promise<unknown>;
    });
  }
}

transaction.start = function (modelClassOrKnex: ModelClass | Knex): Promise<Knex.Transaction> {
  let knex = modelClassOrKnex as Knex;

  if (isModelClass(modelClassOrKnex)) {
    knex = (modelClassOrKnex as ModelClass).knex();
  }

  if (!knex || !isFunction(knex.transaction)) {
    return Promise.reject(
      new Error(
        'objection.transaction.start: first argument must be a model class or a knex instance',
      ),
    );
  }

  return new Promise((resolve, reject) => {
    knex
      .transaction((trx) => {
        resolve(trx);
      })
      .catch((err: unknown) => {
        reject(err);
      });
  });
};

function isModelClass(maybeModel: unknown): boolean {
  return isFunction(maybeModel) && (maybeModel as ModelClass).isObjectionModelClass;
}

export { transaction };
