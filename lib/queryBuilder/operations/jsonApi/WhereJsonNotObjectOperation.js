'use strict';

const jsonApi = require('./postgresJsonApi');
const mysqlJsonApi = require('./mysqlJsonApi');
const { getJsonDialect } = require('../../../utils/postgresJsonPath');
const { ObjectionToKnexConvertingOperation } = require('../ObjectionToKnexConvertingOperation');

// `whereJsonNotArray` and `whereJsonNotObject`.
class WhereJsonNotObjectOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder, builder) {
    const dialect = getJsonDialect(builder.unsafeKnex(), this.name);
    const fieldExpression = this.getKnexArgs(builder)[0];

    if (dialect === 'mysql') {
      const [sql, bindings] = mysqlJsonApi.whereJsonNotContains(
        fieldExpression,
        this.opt.compareValue,
      );

      return this.opt.bool === 'or'
        ? knexBuilder.orWhereRaw(sql, bindings)
        : knexBuilder.whereRaw(sql, bindings);
    }

    return this.whereJsonNotObject(knexBuilder, builder.knex(), fieldExpression);
  }

  whereJsonNotObject(knexBuilder, knex, fieldExpression) {
    const innerQuery = (innerQuery) => {
      const builder = jsonApi.whereJsonbRefOnLeftJsonbValOrRefOnRight(
        innerQuery,
        fieldExpression,
        '@>',
        this.opt.compareValue,
        'not',
      );

      builder.orWhereRaw(...jsonApi.whereJsonFieldQuery(knex, fieldExpression, 'IS', null));
    };

    if (this.opt.bool === 'or') {
      knexBuilder = knexBuilder.orWhere(innerQuery);
    } else {
      knexBuilder = knexBuilder.where(innerQuery);
    }

    return knexBuilder;
  }
}

module.exports = {
  WhereJsonNotObjectOperation,
};
