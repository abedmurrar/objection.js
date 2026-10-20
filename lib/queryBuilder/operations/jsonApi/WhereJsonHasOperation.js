'use strict';

const postgresJsonApi = require('./postgresJsonApi');
const mysqlJsonApi = require('./mysqlJsonApi');
const { getJsonDialect } = require('../../../utils/postgresJsonPath');
const { ObjectionToKnexConvertingOperation } = require('../ObjectionToKnexConvertingOperation');

// `whereJsonHasAny` and `whereJsonHasAll`.
class WhereJsonHasOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    const dialect = getJsonDialect(builder.unsafeKnex(), this.name);
    const args = this.getKnexArgs(builder);

    const [sql, bindings] =
      dialect === 'mysql'
        ? mysqlJsonApi.whereJsonHas(args[0], this.opt.operator, args[1])
        : postgresJsonApi.whereJsonFieldRightStringArrayOnLeftQuery(
            builder.knex(),
            args[0],
            this.opt.operator,
            args[1],
          );

    if (this.opt.bool === 'or') {
      knexBuilder = knexBuilder.orWhereRaw(sql, bindings);
    } else {
      knexBuilder = knexBuilder.whereRaw(sql, bindings);
    }

    return knexBuilder;
  }
}

module.exports = {
  WhereJsonHasOperation,
};
