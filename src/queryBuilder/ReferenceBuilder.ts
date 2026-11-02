import type { Knex } from 'knex';
import { parseFieldExpression, type ParsedFieldExpression } from '../utils/parseFieldExpression';
import { isObject } from '../utils/objectUtils';
import { isMySql, isMariaDb } from '../utils/knexUtils';
import { toPgJsonPathLiteral, getJsonDialect } from '../utils/postgresJsonPath';
import { toMySqlJsonPath, toMySqlCastType, isBooleanType, toJsonSql } from '../utils/mysqlJsonPath';
import {
  addExpressionMethods,
  type ExpressionMethods,
  type ExpressionQueryBuilder,
  type ModelClass,
} from './expressions';

// The expression methods are added to the prototype by `addExpressionMethods()`.
interface ReferenceBuilder extends ExpressionMethods {}

class ReferenceBuilder {
  declare _expr: string | null;
  declare _parsedExpr: ParsedFieldExpression | null;
  declare _column: string | null;
  declare _table: string | null;
  declare _cast: string | null;
  declare _toJson: boolean;
  declare _alias: string | null;
  declare _modelClass: ModelClass | null;
  declare readonly isObjectionReferenceBuilder: true;

  constructor(expr: string | null) {
    this._expr = expr;
    this._parsedExpr = null;
    this._column = null;
    this._table = null;
    this._cast = null;
    this._toJson = false;
    this._table = null;
    this._alias = null;
    this._modelClass = null;

    // This `if` makes it possible for `clone` to skip
    // parsing the expression again.
    if (expr !== null) {
      this._parseExpression(expr);
    }
  }

  // `_expr`, `_parsedExpr` and `_column` are only null inside `clone()`, which
  // sets them right after creating the clone.

  get parsedExpr() {
    return this._parsedExpr!;
  }

  get column() {
    return this._column!;
  }

  set column(column: string) {
    this._column = column;
  }

  get alias() {
    return this._alias;
  }

  set alias(alias: string | null) {
    this._alias = alias;
  }

  get tableName() {
    return this._table;
  }

  set tableName(table: string | null) {
    this._table = table;
  }

  get modelClass() {
    return this._modelClass;
  }

  set modelClass(modelClass: ModelClass | null) {
    this._modelClass = modelClass;
  }

  get isPlainColumnRef() {
    return (
      (!this._parsedExpr || this._parsedExpr.access.length === 0) && !this._cast && !this._toJson
    );
  }

  get expression() {
    return this._expr!;
  }

  get cast() {
    return this._cast;
  }

  fullColumn(builder: ExpressionQueryBuilder): string {
    const table = this.tableName
      ? this.tableName
      : this.modelClass
        ? builder.tableRefFor(this.modelClass)
        : null;

    if (table) {
      return `${table}.${this.column}`;
    } else {
      return this.column;
    }
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
    this._toJson = true;
    return this;
  }

  castTo(sqlType: string): this {
    this._cast = sqlType;
    return this;
  }

  from(table: string): this {
    this._table = table;
    return this;
  }

  table(table: string): this {
    this._table = table;
    return this;
  }

  model(modelClass: ModelClass): this {
    this._modelClass = modelClass;
    return this;
  }

  as(alias: string): this {
    this._alias = alias;
    return this;
  }

  clone() {
    const clone = new (this.constructor as new (expr: string | null) => this)(null);

    clone._expr = this._expr;
    clone._parsedExpr = this._parsedExpr;
    clone._column = this._column;
    clone._table = this._table;
    clone._cast = this._cast;
    clone._toJson = this._toJson;
    clone._alias = this._alias;
    clone._modelClass = this._modelClass;

    return clone;
  }

  toKnexRaw(builder: ExpressionQueryBuilder): Knex.Raw {
    return builder.knex().raw(...this._createRawArgs(builder));
  }

  _parseExpression(expr: string): void {
    this._parsedExpr = parseFieldExpression(expr);
    this._column = this._parsedExpr.column;
    this._table = this._parsedExpr.table;
  }

  _createRawArgs(builder: ExpressionQueryBuilder): [string, Knex.RawBinding[]] {
    const knex = builder.unsafeKnex();
    const mysql = isMySql(knex);
    const bindings: Knex.RawBinding[] = [];
    let sql = this._createReferenceSql(builder, bindings);

    sql = this._maybeCast(sql, mysql, knex);
    sql = this._maybeToJsonb(sql, mysql, knex);
    sql = this._maybeAlias(sql, bindings);

    return [sql, bindings];
  }

  _createReferenceSql(builder: ExpressionQueryBuilder, bindings: Knex.RawBinding[]): string {
    const access = this._parsedExpr!.access;
    bindings.push(this.fullColumn(builder));

    if (access.length === 0) {
      return '??';
    }

    if (getJsonDialect(builder.unsafeKnex(), this._expr!) === 'mysql') {
      bindings.push(toMySqlJsonPath(access));
      // Casts need the unquoted value: `abc` instead of the JSON string `"abc"`.
      if (this._cast) {
        return 'JSON_UNQUOTE(JSON_EXTRACT(??, ?))';
      }

      // MariaDB's JSON_EXTRACT() returns the JSON with spaces, so it would never
      // be equal to a value like `val({ a: 1 })`, which is compact.
      return isMariaDb(builder.unsafeKnex())
        ? 'JSON_COMPACT(JSON_EXTRACT(??, ?))'
        : 'JSON_EXTRACT(??, ?)';
    }

    const extractor = this._cast ? '#>>' : '#>';
    return `??${extractor}${toPgJsonPathLiteral(access)}`;
  }

  _maybeCast(sql: string, mysql: boolean, knex: Knex | null): string {
    if (!this._cast) {
      return sql;
    } else if (!mysql) {
      return `CAST(${sql} AS ${this._cast})`;
    }

    const isJsonField = this._parsedExpr!.access.length > 0;

    // MySQL can't cast to a boolean.
    if (isBooleanType(this._cast)) {
      return isJsonField ? `(${sql} IN ('true', '1'))` : `(${sql} <> 0)`;
    }

    const type = toMySqlCastType(this._cast);

    // `JSON_UNQUOTE()` already returns text. Casting it would change its collation
    // from the case sensitive one `->>` also uses.
    if (isJsonField && type === 'CHAR') {
      return sql;
    }

    if (type === 'JSON') {
      return toJsonSql(sql, knex);
    }

    return `CAST(${sql} AS ${type})`;
  }

  _maybeToJsonb(sql: string, mysql: boolean, knex: Knex | null): string {
    if (!this._toJson) {
      return sql;
    } else if (mysql) {
      return toJsonSql(sql, knex);
    } else {
      return `to_jsonb(${sql})`;
    }
  }

  _maybeAlias(sql: string, bindings: Knex.RawBinding[]): string {
    if (this._shouldAlias()) {
      bindings.push(this._alias);
      return `${sql} as ??`;
    } else {
      return sql;
    }
  }

  _shouldAlias() {
    if (!this._alias) {
      return false;
    } else if (!this.isPlainColumnRef) {
      return true;
    } else {
      // No need to alias if we are dealing with a simple column reference
      // and the alias is the same as the column name.
      return this._alias !== this._column;
    }
  }
}

Object.defineProperties(ReferenceBuilder.prototype, {
  isObjectionReferenceBuilder: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

addExpressionMethods(ReferenceBuilder.prototype);

const ref = (reference: unknown): ReferenceBuilder => {
  if (isObject(reference) && (reference as ReferenceBuilder).isObjectionReferenceBuilder) {
    return reference as ReferenceBuilder;
  } else {
    return new ReferenceBuilder(reference as string);
  }
};

export { ReferenceBuilder, ref };
