import * as postgresJsonApi from './postgresJsonApi';
import * as mysqlJsonApi from './mysqlJsonApi';
import { getJsonDialect } from '../../../utils/postgresJsonPath';
import { jsonCastsForDialect } from '../../../utils/mysqlJsonPath';
import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import type { KnexBuilder, QueryBuilder } from '../types';

// `whereJsonHasAny` and `whereJsonHasAll`.
class WhereJsonHasOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const dialect = getJsonDialect(builder.unsafeKnex(), this.name as string);
    const args = this.getKnexArgs(builder);

    let [sql, bindings] =
      dialect === 'mysql'
        ? mysqlJsonApi.whereJsonHas(args[0], this.opt.operator, args[1], builder.unsafeKnex())
        : postgresJsonApi.whereJsonFieldRightStringArrayOnLeftQuery(
            builder.knex(),
            args[0],
            this.opt.operator as string,
            args[1],
          );

    if (dialect === 'mysql') {
      sql = jsonCastsForDialect(sql, builder.unsafeKnex());
    }

    if (this.opt.bool === 'or') {
      knexBuilder = knexBuilder.orWhereRaw(sql, bindings);
    } else {
      knexBuilder = knexBuilder.whereRaw(sql, bindings);
    }

    return knexBuilder;
  }
}

export { WhereJsonHasOperation };
