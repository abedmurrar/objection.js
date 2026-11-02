'use strict';

const postgresJsonApi = require('./postgresJsonApi');
const mysqlJsonApi = require('./mysqlJsonApi');
const { getJsonDialect } = require('../../../utils/postgresJsonPath');
const { jsonCastsForDialect } = require('../../../utils/mysqlJsonPath');
const { ObjectionToKnexConvertingOperation } = require('../ObjectionToKnexConvertingOperation');

// `whereJsonSupersetOf`, `whereJsonSubsetOf` and their variants.
class WhereJsonOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    const dialect = getJsonDialect(builder.unsafeKnex(), this.name);
    const args = this.getKnexArgs(builder);
    const jsonApi =
      dialect === 'mysql'
        ? mysqlJsonApi.whereJsonContains
        : postgresJsonApi.whereJsonbRefOnLeftJsonbValOrRefOnRightRawQueryParams;
    const rawArgs = jsonApi(args[0], this.opt.operator, args[1], this.opt.prefix);

    if (dialect === 'mysql') {
      rawArgs[0] = jsonCastsForDialect(rawArgs[0], builder.unsafeKnex());
    }

    if (this.opt.bool === 'or') {
      knexBuilder = knexBuilder.orWhereRaw.apply(knexBuilder, rawArgs);
    } else {
      knexBuilder = knexBuilder.whereRaw.apply(knexBuilder, rawArgs);
    }

    return knexBuilder;
  }
}

module.exports = {
  WhereJsonOperation,
};
