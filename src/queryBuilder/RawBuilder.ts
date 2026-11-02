import type { Knex } from 'knex';
import { isPlainObject } from '../utils/objectUtils';
import { buildArg } from '../utils/buildUtils';
import {
  addExpressionMethods,
  type ExpressionMethods,
  type ExpressionQueryBuilder,
} from './expressions';

// The expression methods are added to the prototype by `addExpressionMethods()`.
interface RawBuilder extends ExpressionMethods {}

class RawBuilder {
  declare _sql: string;
  declare _args: unknown[];
  declare _as: string | null;
  declare readonly isObjectionRawBuilder: true;

  constructor(sql: unknown, args: unknown[]) {
    this._sql = `${sql}`;
    this._args = args;
    this._as = null;
  }

  get alias() {
    return this._as;
  }

  as(as: string | null): this {
    this._as = as;
    return this;
  }

  toKnexRaw(builder: ExpressionQueryBuilder): Knex.Raw {
    let args: Knex.ValueDict | Knex.RawBinding[] | null = null;
    let sql = this._sql;

    if (this._args.length === 1 && isPlainObject(this._args[0])) {
      args = buildObject(this._args[0] as Record<string, unknown>, builder);

      if (this._as) {
        args.__alias__ = this._as;
        sql += ' as :__alias__:';
      }
    } else {
      args = buildArray(this._args, builder);

      if (this._as) {
        args.push(this._as);
        sql += ' as ??';
      }
    }

    return builder.knex().raw(sql, args);
  }
}

Object.defineProperties(RawBuilder.prototype, {
  isObjectionRawBuilder: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

addExpressionMethods(RawBuilder.prototype);

// `buildArg()` turns objection builders into knex ones. Everything else is a
// value that knex binds as it is.
function buildArray(arr: unknown[], builder: ExpressionQueryBuilder): Knex.RawBinding[] {
  return arr.map((it) => buildArg(it, builder) as Knex.RawBinding);
}

function buildObject(
  obj: Record<string, unknown>,
  builder: ExpressionQueryBuilder,
): Knex.ValueDict {
  return Object.keys(obj).reduce<Knex.ValueDict>((args, key) => {
    args[key] = buildArg(obj[key], builder) as Knex.RawBinding;
    return args;
  }, {});
}

function normalizeRawArgs(argsIn: unknown[]): { sql: unknown; args: unknown[] } {
  const [sql, ...restArgs] = argsIn;

  if (restArgs.length === 1 && Array.isArray(restArgs[0])) {
    return {
      sql,
      args: restArgs[0],
    };
  } else {
    return {
      sql,
      args: restArgs,
    };
  }
}

function raw(...argsIn: unknown[]): RawBuilder {
  const { sql, args } = normalizeRawArgs(argsIn);
  return new RawBuilder(sql, args);
}

export { RawBuilder, normalizeRawArgs, raw };
