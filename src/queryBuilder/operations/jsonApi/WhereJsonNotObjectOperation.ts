import * as jsonApi from './postgresJsonApi';
import * as mysqlJsonApi from './mysqlJsonApi';
import { getJsonDialect } from '../../../utils/postgresJsonPath';
import { jsonCastsForDialect } from '../../../utils/mysqlJsonPath';
import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import type { KnexBuilder, KnexInstance, QueryBuilder } from '../types';

// `whereJsonNotArray` and `whereJsonNotObject`.
class WhereJsonNotObjectOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const dialect = getJsonDialect(builder.unsafeKnex(), this.name as string);
    const fieldExpression = this.getKnexArgs(builder)[0];

    if (dialect === 'mysql') {
      const [rawSql, bindings] = mysqlJsonApi.whereJsonNotContains(
        fieldExpression,
        this.opt.compareValue,
      );
      const sql = jsonCastsForDialect(rawSql, builder.unsafeKnex());

      return this.opt.bool === 'or'
        ? knexBuilder.orWhereRaw(sql, bindings)
        : knexBuilder.whereRaw(sql, bindings);
    }

    return this.whereJsonNotObject(knexBuilder, builder.knex(), fieldExpression);
  }

  whereJsonNotObject(
    knexBuilder: KnexBuilder,
    knex: KnexInstance,
    fieldExpression: string,
  ): KnexBuilder {
    const innerQuery = (innerQuery: KnexBuilder) => {
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

export { WhereJsonNotObjectOperation };
