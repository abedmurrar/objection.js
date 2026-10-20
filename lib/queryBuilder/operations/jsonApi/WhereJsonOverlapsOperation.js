'use strict';

const mysqlJsonApi = require('./mysqlJsonApi');
const { getJsonDialect } = require('../../../utils/postgresJsonPath');
const { ObjectionToKnexConvertingOperation } = require('../ObjectionToKnexConvertingOperation');

// `whereJsonOverlaps` and its variants. Postgres has no operator for this.
class WhereJsonOverlapsOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    const knex = builder.unsafeKnex();

    if (knex && getJsonDialect(knex, this.name) !== 'mysql') {
      throw new Error(`${this.name} is only supported on mysql.`);
    }

    const args = this.getKnexArgs(builder);
    const [sql, bindings] = mysqlJsonApi.whereJsonOverlaps(args[0], args[1], this.opt.prefix);

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
