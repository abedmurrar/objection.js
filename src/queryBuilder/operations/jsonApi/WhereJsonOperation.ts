import * as postgresJsonApi from './postgresJsonApi';
import * as mysqlJsonApi from './mysqlJsonApi';
import { getJsonDialect } from '../../../utils/postgresJsonPath';
import { jsonCastsForDialect } from '../../../utils/mysqlJsonPath';
import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import type { KnexBuilder, QueryBuilder } from '../types';

// `whereJsonSupersetOf`, `whereJsonSubsetOf` and their variants.
class WhereJsonOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const dialect = getJsonDialect(builder.unsafeKnex(), this.name as string);
    const args = this.getKnexArgs(builder);
    const jsonApi =
      dialect === 'mysql'
        ? mysqlJsonApi.whereJsonContains
        : postgresJsonApi.whereJsonbRefOnLeftJsonbValOrRefOnRightRawQueryParams;
    const rawArgs = jsonApi(
      args[0],
      this.opt.operator as string,
      args[1],
      this.opt.prefix as string,
    );

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

export { WhereJsonOperation };
