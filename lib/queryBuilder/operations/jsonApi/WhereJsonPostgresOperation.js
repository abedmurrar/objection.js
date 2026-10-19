'use strict';

const jsonApi = require('./postgresJsonApi');
const { assertJsonFieldExpressionSupported } = require('../../../utils/postgresJsonPath');
const { ObjectionToKnexConvertingOperation } = require('../ObjectionToKnexConvertingOperation');

class WhereJsonPostgresOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    assertJsonFieldExpressionSupported(builder.unsafeKnex(), this.name);

    const args = this.getKnexArgs(builder);

    const rawArgs = jsonApi.whereJsonbRefOnLeftJsonbValOrRefOnRightRawQueryParams(
      args[0],
      this.opt.operator,
      args[1],
      this.opt.prefix,
    );

    if (this.opt.bool === 'or') {
      knexBuilder = knexBuilder.orWhereRaw.apply(knexBuilder, rawArgs);
    } else {
      knexBuilder = knexBuilder.whereRaw.apply(knexBuilder, rawArgs);
    }

    return knexBuilder;
  }
}

module.exports = {
  WhereJsonPostgresOperation,
};
