'use strict';

const { parseFieldExpression } = require('../utils/parseFieldExpression');
const { isObject } = require('../utils/objectUtils');
const { isMySql } = require('../utils/knexUtils');
const { toPgJsonPathLiteral, getJsonDialect } = require('../utils/postgresJsonPath');
const { toMySqlJsonPath, toMySqlCastType, isBooleanType } = require('../utils/mysqlJsonPath');
const { addExpressionMethods } = require('./expressions');

class ReferenceBuilder {
  constructor(expr) {
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

  get parsedExpr() {
    return this._parsedExpr;
  }

  get column() {
    return this._column;
  }

  set column(column) {
    this._column = column;
  }

  get alias() {
    return this._alias;
  }

  set alias(alias) {
    this._alias = alias;
  }

  get tableName() {
    return this._table;
  }

  set tableName(table) {
    this._table = table;
  }

  get modelClass() {
    return this._modelClass;
  }

  set modelClass(modelClass) {
    this._modelClass = modelClass;
  }

  get isPlainColumnRef() {
    return (
      (!this._parsedExpr || this._parsedExpr.access.length === 0) && !this._cast && !this._toJson
    );
  }

  get expression() {
    return this._expr;
  }

  get cast() {
    return this._cast;
  }

  fullColumn(builder) {
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

  castTo(sqlType) {
    this._cast = sqlType;
    return this;
  }

  from(table) {
    this._table = table;
    return this;
  }

  table(table) {
    this._table = table;
    return this;
  }

  model(modelClass) {
    this._modelClass = modelClass;
    return this;
  }

  as(alias) {
    this._alias = alias;
    return this;
  }

  clone() {
    const clone = new this.constructor(null);

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

  toKnexRaw(builder) {
    return builder.knex().raw(...this._createRawArgs(builder));
  }

  _parseExpression(expr) {
    this._parsedExpr = parseFieldExpression(expr);
    this._column = this._parsedExpr.column;
    this._table = this._parsedExpr.table;
  }

  _createRawArgs(builder) {
    const mysql = isMySql(builder.unsafeKnex());
    let bindings = [];
    let sql = this._createReferenceSql(builder, bindings);

    sql = this._maybeCast(sql, mysql);
    sql = this._maybeToJsonb(sql, mysql);
    sql = this._maybeAlias(sql, bindings);

    return [sql, bindings];
  }

  _createReferenceSql(builder, bindings) {
    const access = this._parsedExpr.access;
    bindings.push(this.fullColumn(builder));

    if (access.length === 0) {
      return '??';
    }

    if (getJsonDialect(builder.unsafeKnex(), this._expr) === 'mysql') {
      bindings.push(toMySqlJsonPath(access));
      // Casts need the unquoted value: `abc` instead of the JSON string `"abc"`.
      return this._cast ? 'JSON_UNQUOTE(JSON_EXTRACT(??, ?))' : 'JSON_EXTRACT(??, ?)';
    }

    const extractor = this._cast ? '#>>' : '#>';
    return `??${extractor}${toPgJsonPathLiteral(access)}`;
  }

  _maybeCast(sql, mysql) {
    if (!this._cast) {
      return sql;
    } else if (!mysql) {
      return `CAST(${sql} AS ${this._cast})`;
    }

    const isJsonField = this._parsedExpr.access.length > 0;

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

    return `CAST(${sql} AS ${type})`;
  }

  _maybeToJsonb(sql, mysql) {
    if (!this._toJson) {
      return sql;
    } else if (mysql) {
      return `CAST(${sql} AS JSON)`;
    } else {
      return `to_jsonb(${sql})`;
    }
  }

  _maybeAlias(sql, bindings) {
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

const ref = (reference) => {
  if (isObject(reference) && reference.isObjectionReferenceBuilder) {
    return reference;
  } else {
    return new ReferenceBuilder(reference);
  }
};

module.exports = {
  ReferenceBuilder,
  ref,
};
