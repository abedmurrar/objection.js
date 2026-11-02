import type { Knex } from 'knex';
import { asArray, isObject } from '../utils/objectUtils';
import { buildArg } from '../utils/buildUtils';
import { isMySql } from '../utils/knexUtils';
import { toMySqlCastType, isBooleanType, toJsonSql } from '../utils/mysqlJsonPath';
import {
  addExpressionMethods,
  type ExpressionMethods,
  type ExpressionQueryBuilder,
} from './expressions';

// The expression methods are added to the prototype by `addExpressionMethods()`.
interface ValueBuilder extends ExpressionMethods {}

class ValueBuilder {
  declare _value: unknown;
  declare _cast: string | null;
  declare _toJson: boolean;
  declare _toArray: boolean;
  declare _alias: string | null;

  constructor(value: unknown) {
    this._value = value;
    this._cast = null;
    // Cast objects and arrays to json by default.
    this._toJson = isObject(value);
    this._toArray = false;
    this._alias = null;
  }

  get cast() {
    return this._cast;
  }

  castText() {
    return this.castTo('text');
  }

  castInt() {
    return this.castTo('integer');
  }

  castBigInt() {
    return this.castTo('bigint');
  }

  castFloat() {
    return this.castTo('float');
  }

  castDecimal() {
    return this.castTo('decimal');
  }

  castReal() {
    return this.castTo('real');
  }

  castBool() {
    return this.castTo('boolean');
  }

  castJson() {
    this._toArray = false;
    this._toJson = true;
    this._cast = 'jsonb';
    return this;
  }

  castTo(sqlType: string): this {
    this._cast = sqlType;
    return this;
  }

  asArray() {
    this._toJson = false;
    this._toArray = true;
    return this;
  }

  as(alias: string): this {
    this._alias = alias;
    return this;
  }

  toKnexRaw(builder: ExpressionQueryBuilder): Knex.Raw {
    return builder.knex().raw(...this._createRawArgs(builder));
  }

  _createRawArgs(builder: ExpressionQueryBuilder): [string, Knex.RawBinding[]] {
    let sql: string | null = null;
    const bindings: Knex.RawBinding[] = [];

    if (this._toJson) {
      bindings.push(JSON.stringify(this._value));
      sql = '?';
    } else if (this._toArray) {
      const values = asArray(this._value);
      bindings.push(...values.map((it: unknown) => buildArg(it, builder) as Knex.RawBinding));
      sql = `ARRAY[${values.map(() => '?').join(', ')}]`;
    } else {
      // A value of the user, which knex binds as it is.
      bindings.push(this._value as Knex.RawBinding);
      sql = '?';
    }

    const knex = builder.unsafeKnex();
    const mysql = isMySql(knex);

    if (this._toJson && !this._cast && mysql) {
      // MySQL compares strings and JSON values as strings, so `{}` is never
      // equal to a JSON column without the cast. Postgres casts it implicitly.
      sql = toJsonSql(sql, knex);
    } else if (this._cast && mysql) {
      const type = toMySqlCastType(this._cast);

      // MySQL can't cast to a boolean.
      if (isBooleanType(this._cast)) {
        sql = `(${sql} <> 0)`;
      } else if (type === 'JSON') {
        sql = toJsonSql(sql, knex);
      } else {
        sql = `CAST(${sql} AS ${type})`;
      }
    } else if (this._cast) {
      sql = `CAST(${sql} AS ${this._cast})`;
    }

    if (this._alias) {
      bindings.push(this._alias);
      sql = `${sql} as ??`;
    }

    return [sql, bindings];
  }
}

addExpressionMethods(ValueBuilder.prototype);

function val(val: unknown): ValueBuilder {
  return new ValueBuilder(val);
}

export { ValueBuilder, val };
