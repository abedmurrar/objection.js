'use strict';

const mysqlJsonApi = require('./mysqlJsonApi');
const { getJsonDialect } = require('../../../utils/postgresJsonPath');
const { getMariaDbVersion } = require('../../../utils/knexUtils');
const { jsonCastsForDialect } = require('../../../utils/mysqlJsonPath');
const { ObjectionToKnexConvertingOperation } = require('../ObjectionToKnexConvertingOperation');

// `whereJsonOverlaps` and its variants. Postgres has no operator for this.
class WhereJsonOverlapsOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    const knex = builder.unsafeKnex();

    if (knex && getJsonDialect(knex, this.name) !== 'mysql') {
      throw new Error(`${this.name} is only supported on mysql.`);
    }

    const mariaDbVersion = knex && getMariaDbVersion(knex);

    if (
      mariaDbVersion &&
      (mariaDbVersion[0] < 10 || (mariaDbVersion[0] === 10 && mariaDbVersion[1] < 9))
    ) {
      throw new Error(`${this.name} needs MariaDB 10.9 or newer, which has JSON_OVERLAPS().`);
    }

    const args = this.getKnexArgs(builder);
    const [rawSql, bindings] = mysqlJsonApi.whereJsonOverlaps(args[0], args[1], this.opt.prefix);
    const sql = jsonCastsForDialect(rawSql, knex);

    if (this.opt.bool === 'or') {
      knexBuilder = knexBuilder.orWhereRaw(sql, bindings);
    } else {
      knexBuilder = knexBuilder.whereRaw(sql, bindings);
    }

    return knexBuilder;
  }
}

module.exports = {
  WhereJsonOverlapsOperation,
};
