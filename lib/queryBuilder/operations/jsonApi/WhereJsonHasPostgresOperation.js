'use strict';

const jsonApi = require('./postgresJsonApi');
const { assertJsonFieldExpressionSupported } = require('../../../utils/postgresJsonPath');
const { ObjectionToKnexConvertingOperation } = require('../ObjectionToKnexConvertingOperation');

class WhereJsonHasPostgresOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    assertJsonFieldExpressionSupported(builder.unsafeKnex(), this.name);

    const args = this.getKnexArgs(builder);

    const [sql, bindings] = jsonApi.whereJsonFieldRightStringArrayOnLeftQuery(
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
  WhereJsonHasPostgresOperation,
};
