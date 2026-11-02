import { QueryBuilderOperationSupport } from './QueryBuilderOperationSupport';
import { isSqlite, isMsSql } from '../utils/knexUtils';

import { KnexOperation } from './operations/KnexOperation';
import { expression } from './expressions';
import { MergeOperation } from './operations/MergeOperation';
import { SelectOperation } from './operations/select/SelectOperation';
import { ReturningOperation } from './operations/ReturningOperation';
import { WhereCompositeOperation } from './operations/WhereCompositeOperation';
import { WhereJsonOperation } from './operations/jsonApi/WhereJsonOperation';
import { WhereJsonOverlapsOperation } from './operations/jsonApi/WhereJsonOverlapsOperation';

import { WhereInCompositeOperation } from './operations/whereInComposite/WhereInCompositeOperation';
import { WhereInCompositeSqliteOperation } from './operations/whereInComposite/WhereInCompositeSqliteOperation';
import { WhereInCompositeMsSqlOperation } from './operations/whereInComposite/WhereInCompositeMsSqlOperation';
import { WhereJsonHasOperation } from './operations/jsonApi/WhereJsonHasOperation';
import { WhereJsonNotObjectOperation } from './operations/jsonApi/WhereJsonNotObjectOperation';
import type { KnexInstance } from './operations/types';

const HavingSelector = /^(having|orHaving|andHaving)/;
const GroupBySelector = /^groupBy/;

class QueryBuilderBase extends QueryBuilderOperationSupport {
  // Defined on the prototype below.
  declare readonly isObjectionQueryBuilderBase: true;

  modify(...args: unknown[]): this {
    const func = args[0] as ((...args: unknown[]) => unknown) | null | undefined;

    if (!func) {
      return this;
    }

    if (args.length === 1) {
      func.call(this, this);
    } else {
      args[0] = this;
      func(...args);
    }

    return this;
  }

  transacting(trx: KnexInstance | null | undefined): this {
    this._context.knex = trx || null;
    return this;
  }

  select(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('select'), args);
  }

  insert(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('insert'), args);
  }

  update(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('update'), args);
  }

  delete(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('delete'), args);
  }

  del(...args: unknown[]): this {
    return this.delete(...args);
  }

  forUpdate(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('forUpdate'), args);
  }

  forShare(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('forShare'), args);
  }

  forNoKeyUpdate(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('forNoKeyUpdate'), args);
  }

  forKeyShare(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('forKeyShare'), args);
  }

  skipLocked(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('skipLocked'), args);
  }

  noWait(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('noWait'), args);
  }

  as(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('as'), args);
  }

  columns(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('columns'), args);
  }

  column(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('column'), args);
  }

  from(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('from'), args);
  }

  fromJS(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('fromJS'), args);
  }

  fromRaw(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('fromRaw'), args);
  }

  into(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('into'), args);
  }

  withSchema(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('withSchema'), args);
  }

  table(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('table'), args);
  }

  distinct(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('distinct'), args);
  }

  distinctOn(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('distinctOn'), args);
  }

  join(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('join'), args);
  }

  joinRaw(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('joinRaw'), args);
  }

  innerJoin(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('innerJoin'), args);
  }

  leftJoin(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('leftJoin'), args);
  }

  leftOuterJoin(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('leftOuterJoin'), args);
  }

  rightJoin(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('rightJoin'), args);
  }

  rightOuterJoin(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('rightOuterJoin'), args);
  }

  outerJoin(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('outerJoin'), args);
  }

  fullOuterJoin(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('fullOuterJoin'), args);
  }

  crossJoin(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('crossJoin'), args);
  }

  where(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('where'), args);
  }

  andWhere(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhere'), args);
  }

  orWhere(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhere'), args);
  }

  whereNot(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereNot'), args);
  }

  andWhereNot(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereNot'), args);
  }

  orWhereNot(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereNot'), args);
  }

  // Makes the query match no rows.
  none(): this {
    return this.where(expression('(1 = 0)', []));
  }

  whereRaw(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereRaw'), args);
  }

  andWhereRaw(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereRaw'), args);
  }

  orWhereRaw(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereRaw'), args);
  }

  whereWrapped(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereWrapped'), args);
  }

  havingWrapped(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingWrapped'), args);
  }

  whereExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereExists'), args);
  }

  orWhereExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereExists'), args);
  }

  whereNotExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereNotExists'), args);
  }

  orWhereNotExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereNotExists'), args);
  }

  whereIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereIn'), args);
  }

  orWhereIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereIn'), args);
  }

  whereNotIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereNotIn'), args);
  }

  orWhereNotIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereNotIn'), args);
  }

  whereNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereNull'), args);
  }

  orWhereNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereNull'), args);
  }

  whereNotNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereNotNull'), args);
  }

  orWhereNotNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereNotNull'), args);
  }

  whereBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereBetween'), args);
  }

  andWhereBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereBetween'), args);
  }

  whereNotBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereNotBetween'), args);
  }

  andWhereNotBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereNotBetween'), args);
  }

  orWhereBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereBetween'), args);
  }

  orWhereNotBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereNotBetween'), args);
  }

  whereLike(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereLike'), args);
  }

  andWhereLike(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereLike'), args);
  }

  orWhereLike(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereLike'), args);
  }

  whereILike(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereILike'), args);
  }

  andWhereILike(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereILike'), args);
  }

  orWhereILike(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereILike'), args);
  }

  groupBy(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('groupBy'), args);
  }

  groupByRaw(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('groupByRaw'), args);
  }

  orderBy(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orderBy'), args);
  }

  orderByRaw(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orderByRaw'), args);
  }

  union(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('union'), args);
  }

  unionAll(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('unionAll'), args);
  }

  intersect(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('intersect'), args);
  }

  except(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('except'), args);
  }

  having(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('having'), args);
  }

  // Like clearSelect() and clearWhere(), these remove the operations, so that
  // has() and copyFrom() see the query as it is.
  clearHaving(): this {
    return this.clear(HavingSelector);
  }

  clearGroup(): this {
    return this.clear(GroupBySelector);
  }

  orHaving(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHaving'), args);
  }

  havingIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingIn'), args);
  }

  orHavingIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHavingIn'), args);
  }

  havingNotIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingNotIn'), args);
  }

  orHavingNotIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHavingNotIn'), args);
  }

  havingNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingNull'), args);
  }

  orHavingNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHavingNull'), args);
  }

  havingNotNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingNotNull'), args);
  }

  orHavingNotNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHavingNotNull'), args);
  }

  havingExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingExists'), args);
  }

  orHavingExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHavingExists'), args);
  }

  havingNotExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingNotExists'), args);
  }

  orHavingNotExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHavingNotExists'), args);
  }

  havingBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingBetween'), args);
  }

  orHavingBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHavingBetween'), args);
  }

  havingNotBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingNotBetween'), args);
  }

  orHavingNotBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHavingNotBetween'), args);
  }

  andHaving(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andHaving'), args);
  }

  andHavingIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andHavingIn'), args);
  }

  andHavingNotIn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andHavingNotIn'), args);
  }

  andHavingNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andHavingNull'), args);
  }

  andHavingNotNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andHavingNotNull'), args);
  }

  andHavingExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andHavingExists'), args);
  }

  andHavingNotExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andHavingNotExists'), args);
  }

  andHavingBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andHavingBetween'), args);
  }

  andHavingNotBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andHavingNotBetween'), args);
  }

  comment(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('comment'), args);
  }

  hintComment(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('hintComment'), args);
  }

  using(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('using'), args);
  }

  havingRaw(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('havingRaw'), args);
  }

  orHavingRaw(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orHavingRaw'), args);
  }

  offset(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('offset'), args);
  }

  limit(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('limit'), args);
  }

  count(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('count'), args);
  }

  countDistinct(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('countDistinct'), args);
  }

  min(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('min'), args);
  }

  max(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('max'), args);
  }

  sum(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('sum'), args);
  }

  sumDistinct(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('sumDistinct'), args);
  }

  avg(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('avg'), args);
  }

  avgDistinct(...args: unknown[]): this {
    return this.addOperation(new SelectOperation('avgDistinct'), args);
  }

  debug(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('debug'), args);
  }

  returning(...args: unknown[]): this {
    return this.addOperation(new ReturningOperation('returning'), args);
  }

  truncate(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('truncate'), args);
  }

  connection(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('connection'), args);
  }

  options(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('options'), args);
  }

  columnInfo(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('columnInfo'), args);
  }

  off(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('off'), args);
  }

  timeout(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('timeout'), args);
  }

  with(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('with'), args);
  }

  withWrapped(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('withWrapped'), args);
  }

  withRecursive(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('withRecursive'), args);
  }

  withMaterialized(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('withMaterialized'), args);
  }

  withNotMaterialized(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('withNotMaterialized'), args);
  }

  whereComposite(...args: unknown[]): this {
    return this.addOperation(new WhereCompositeOperation('whereComposite'), args);
  }

  whereInComposite(...args: unknown[]): this {
    let operation = null;

    if (isSqlite(this.knex())) {
      operation = new WhereInCompositeSqliteOperation('whereInComposite');
    } else if (isMsSql(this.knex())) {
      operation = new WhereInCompositeMsSqlOperation('whereInComposite');
    } else {
      operation = new WhereInCompositeOperation('whereInComposite');
    }

    return this.addOperation(operation, args);
  }

  whereNotInComposite(...args: unknown[]): this {
    let operation = null;

    if (isSqlite(this.knex())) {
      operation = new WhereInCompositeSqliteOperation('whereNotInComposite', { prefix: 'not' });
    } else if (isMsSql(this.knex())) {
      operation = new WhereInCompositeMsSqlOperation('whereNotInComposite', { prefix: 'not' });
    } else {
      operation = new WhereInCompositeOperation('whereNotInComposite', { prefix: 'not' });
    }

    return this.addOperation(operation, args);
  }

  jsonExtract(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('jsonExtract'), args);
  }

  jsonSet(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('jsonSet'), args);
  }

  jsonInsert(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('jsonInsert'), args);
  }

  jsonRemove(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('jsonRemove'), args);
  }

  whereJsonObject(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereJsonObject'), args);
  }

  orWhereJsonObject(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereJsonObject'), args);
  }

  andWhereJsonObject(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereJsonObject'), args);
  }

  whereNotJsonObject(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereNotJsonObject'), args);
  }

  orWhereNotJsonObject(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereNotJsonObject'), args);
  }

  andWhereNotJsonObject(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereNotJsonObject'), args);
  }

  whereJsonPath(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereJsonPath'), args);
  }

  orWhereJsonPath(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereJsonPath'), args);
  }

  andWhereJsonPath(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereJsonPath'), args);
  }

  // whereJson(Not)SupersetOf / whereJson(Not)SubsetOf are now supported by knex >= 1.0, but for now
  // objection handles them differently and only for postgres.
  // Changing them to utilize knex methods directly may require a major version bump and upgrade guide.
  whereJsonSupersetOf(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOperation('whereJsonSupersetOf', { operator: '@>', bool: 'and' }),
      args,
    );
  }

  andWhereJsonSupersetOf(...args: unknown[]): this {
    return this.whereJsonSupersetOf(...args);
  }

  orWhereJsonSupersetOf(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOperation('orWhereJsonSupersetOf', { operator: '@>', bool: 'or' }),
      args,
    );
  }

  whereJsonNotSupersetOf(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOperation('whereJsonNotSupersetOf', {
        operator: '@>',
        bool: 'and',
        prefix: 'not',
      }),
      args,
    );
  }

  andWhereJsonNotSupersetOf(...args: unknown[]): this {
    return this.whereJsonNotSupersetOf(...args);
  }

  orWhereJsonNotSupersetOf(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOperation('orWhereJsonNotSupersetOf', {
        operator: '@>',
        bool: 'or',
        prefix: 'not',
      }),
      args,
    );
  }

  whereJsonSubsetOf(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOperation('whereJsonSubsetOf', { operator: '<@', bool: 'and' }),
      args,
    );
  }

  andWhereJsonSubsetOf(...args: unknown[]): this {
    return this.whereJsonSubsetOf(...args);
  }

  orWhereJsonSubsetOf(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOperation('orWhereJsonSubsetOf', { operator: '<@', bool: 'or' }),
      args,
    );
  }

  whereJsonNotSubsetOf(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOperation('whereJsonNotSubsetOf', {
        operator: '<@',
        bool: 'and',
        prefix: 'not',
      }),
      args,
    );
  }

  andWhereJsonNotSubsetOf(...args: unknown[]): this {
    return this.whereJsonNotSubsetOf(...args);
  }

  orWhereJsonNotSubsetOf(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOperation('orWhereJsonNotSubsetOf', {
        operator: '<@',
        bool: 'or',
        prefix: 'not',
      }),
      args,
    );
  }

  whereJsonNotArray(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonNotObjectOperation('whereJsonNotArray', {
        bool: 'and',
        compareValue: [],
      }),
      args,
    );
  }

  orWhereJsonNotArray(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonNotObjectOperation('orWhereJsonNotArray', {
        bool: 'or',
        compareValue: [],
      }),
      args,
    );
  }

  whereJsonNotObject(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonNotObjectOperation('whereJsonNotObject', {
        bool: 'and',
        compareValue: {},
      }),
      args,
    );
  }

  orWhereJsonNotObject(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonNotObjectOperation('orWhereJsonNotObject', {
        bool: 'or',
        compareValue: {},
      }),
      args,
    );
  }

  whereJsonHasAny(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonHasOperation('whereJsonHasAny', { bool: 'and', operator: '?|' }),
      args,
    );
  }

  orWhereJsonHasAny(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonHasOperation('orWhereJsonHasAny', { bool: 'or', operator: '?|' }),
      args,
    );
  }

  whereJsonHasAll(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonHasOperation('whereJsonHasAll', { bool: 'and', operator: '?&' }),
      args,
    );
  }

  orWhereJsonHasAll(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonHasOperation('orWhereJsonHasAll', { bool: 'or', operator: '?&' }),
      args,
    );
  }

  whereJsonOverlaps(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOverlapsOperation('whereJsonOverlaps', { bool: 'and' }),
      args,
    );
  }

  andWhereJsonOverlaps(...args: unknown[]): this {
    return this.whereJsonOverlaps(...args);
  }

  orWhereJsonOverlaps(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOverlapsOperation('orWhereJsonOverlaps', { bool: 'or' }),
      args,
    );
  }

  whereJsonNotOverlaps(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOverlapsOperation('whereJsonNotOverlaps', { bool: 'and', prefix: 'not' }),
      args,
    );
  }

  andWhereJsonNotOverlaps(...args: unknown[]): this {
    return this.whereJsonNotOverlaps(...args);
  }

  orWhereJsonNotOverlaps(...args: unknown[]): this {
    return this.addOperation(
      new WhereJsonOverlapsOperation('orWhereJsonNotOverlaps', { bool: 'or', prefix: 'not' }),
      args,
    );
  }

  whereJsonIsArray(fieldExpression: unknown): this {
    return this.whereJsonSupersetOf(fieldExpression, []);
  }

  orWhereJsonIsArray(fieldExpression: unknown): this {
    return this.orWhereJsonSupersetOf(fieldExpression, []);
  }

  whereJsonIsObject(fieldExpression: unknown): this {
    return this.whereJsonSupersetOf(fieldExpression, {});
  }

  orWhereJsonIsObject(fieldExpression: unknown): this {
    return this.orWhereJsonSupersetOf(fieldExpression, {});
  }

  whereColumn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereColumn'), args);
  }

  andWhereColumn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereColumn'), args);
  }

  orWhereColumn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereColumn'), args);
  }

  whereNotColumn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('whereNotColumn'), args);
  }

  andWhereNotColumn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andWhereNotColumn'), args);
  }

  orWhereNotColumn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orWhereNotColumn'), args);
  }

  onConflict(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('onConflict'), args);
  }

  ignore(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('ignore'), args);
  }

  merge(...args: unknown[]): this {
    return this.addOperation(new MergeOperation('merge'), args);
  }
}

Object.defineProperties(QueryBuilderBase.prototype, {
  isObjectionQueryBuilderBase: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

export { QueryBuilderBase };
