import * as mysqlJsonApi from './mysqlJsonApi';
import { getJsonDialect } from '../../../utils/postgresJsonPath';
import { getMariaDbVersion } from '../../../utils/knexUtils';
import { jsonCastsForDialect } from '../../../utils/mysqlJsonPath';
import { ObjectionToKnexConvertingOperation } from '../ObjectionToKnexConvertingOperation';
import type { KnexBuilder, QueryBuilder } from '../types';

// `whereJsonOverlaps` and its variants. Postgres has no operator for this.
class WhereJsonOverlapsOperation extends ObjectionToKnexConvertingOperation {
  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    const knex = builder.unsafeKnex();

    if (knex && getJsonDialect(knex, this.name as string) !== 'mysql') {
      throw new Error(`${this.name} is only supported on mysql.`);
    }

    const mariaDbVersion: number[] | null = knex && getMariaDbVersion(knex);

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

export { WhereJsonOverlapsOperation };
