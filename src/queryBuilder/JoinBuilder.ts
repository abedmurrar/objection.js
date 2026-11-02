import type { Knex } from 'knex';
import { QueryBuilderOperationSupport } from './QueryBuilderOperationSupport';
import { KnexOperation } from './operations/KnexOperation';
import { WhereInOperation } from './operations/WhereInOperation';
import { QueryBuilderOperation } from './operations/QueryBuilderOperation';

// knex's `join.on(a, b).or.on(c, d)`: `or` makes the next condition an `or`.
class OrOperation extends QueryBuilderOperation {
  // knex's typings don't declare the `or` getter.
  onBuildKnex(knexBuilder: Knex.JoinClause & { readonly or: Knex.JoinClause }): Knex.JoinClause {
    return knexBuilder.or;
  }
}

class JoinBuilder extends QueryBuilderOperationSupport {
  get or(): this {
    return this.addOperation(new OrOperation('or'), []);
  }

  using(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('using'), args);
  }

  on(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('on'), args);
  }

  orOn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orOn'), args);
  }

  onBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('onBetween'), args);
  }

  onNotBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('onNotBetween'), args);
  }

  orOnBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orOnBetween'), args);
  }

  orOnNotBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orOnNotBetween'), args);
  }

  onIn(...args: unknown[]): this {
    return this.addOperation(new WhereInOperation('onIn', { rawMethod: 'on' }), args);
  }

  onNotIn(...args: unknown[]): this {
    return this.addOperation(new WhereInOperation('onNotIn', { rawMethod: 'on', not: true }), args);
  }

  orOnIn(...args: unknown[]): this {
    return this.addOperation(new WhereInOperation('orOnIn', { rawMethod: 'orOn' }), args);
  }

  orOnNotIn(...args: unknown[]): this {
    return this.addOperation(
      new WhereInOperation('orOnNotIn', { rawMethod: 'orOn', not: true }),
      args,
    );
  }

  onNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('onNull'), args);
  }

  orOnNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orOnNull'), args);
  }

  onNotNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('onNotNull'), args);
  }

  orOnNotNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orOnNotNull'), args);
  }

  onExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('onExists'), args);
  }

  orOnExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orOnExists'), args);
  }

  onNotExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('onNotExists'), args);
  }

  orOnNotExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orOnNotExists'), args);
  }

  type(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('type'), args);
  }

  andOn(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andOn'), args);
  }

  andOnIn(...args: unknown[]): this {
    return this.addOperation(new WhereInOperation('andOnIn', { rawMethod: 'andOn' }), args);
  }

  andOnNotIn(...args: unknown[]): this {
    return this.addOperation(
      new WhereInOperation('andOnNotIn', { rawMethod: 'andOn', not: true }),
      args,
    );
  }

  andOnNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andOnNull'), args);
  }

  andOnNotNull(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andOnNotNull'), args);
  }

  andOnExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andOnExists'), args);
  }

  andOnNotExists(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andOnNotExists'), args);
  }

  andOnBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andOnBetween'), args);
  }

  andOnNotBetween(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andOnNotBetween'), args);
  }

  onJsonPathEquals(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('onJsonPathEquals'), args);
  }

  orOnJsonPathEquals(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orOnJsonPathEquals'), args);
  }

  andOnJsonPathEquals(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andOnJsonPathEquals'), args);
  }

  onVal(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('onVal'), args);
  }

  andOnVal(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('andOnVal'), args);
  }

  orOnVal(...args: unknown[]): this {
    return this.addOperation(new KnexOperation('orOnVal'), args);
  }
}

export { JoinBuilder };
