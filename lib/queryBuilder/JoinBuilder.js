'use strict';

const { QueryBuilderOperationSupport } = require('./QueryBuilderOperationSupport');
const { KnexOperation } = require('./operations/KnexOperation');
const { WhereInOperation } = require('./operations/WhereInOperation');

class JoinBuilder extends QueryBuilderOperationSupport {
  using(...args) {
    return this.addOperation(new KnexOperation('using'), args);
  }

  on(...args) {
    return this.addOperation(new KnexOperation('on'), args);
  }

  orOn(...args) {
    return this.addOperation(new KnexOperation('orOn'), args);
  }

  onBetween(...args) {
    return this.addOperation(new KnexOperation('onBetween'), args);
  }

  onNotBetween(...args) {
    return this.addOperation(new KnexOperation('onNotBetween'), args);
  }

  orOnBetween(...args) {
    return this.addOperation(new KnexOperation('orOnBetween'), args);
  }

  orOnNotBetween(...args) {
    return this.addOperation(new KnexOperation('orOnNotBetween'), args);
  }

  onIn(...args) {
    return this.addOperation(new WhereInOperation('onIn', { rawMethod: 'on' }), args);
  }

  onNotIn(...args) {
    return this.addOperation(new WhereInOperation('onNotIn', { rawMethod: 'on', not: true }), args);
  }

  orOnIn(...args) {
    return this.addOperation(new WhereInOperation('orOnIn', { rawMethod: 'orOn' }), args);
  }

  orOnNotIn(...args) {
    return this.addOperation(
      new WhereInOperation('orOnNotIn', { rawMethod: 'orOn', not: true }),
      args,
    );
  }

  onNull(...args) {
    return this.addOperation(new KnexOperation('onNull'), args);
  }

  orOnNull(...args) {
    return this.addOperation(new KnexOperation('orOnNull'), args);
  }

  onNotNull(...args) {
    return this.addOperation(new KnexOperation('onNotNull'), args);
  }

  orOnNotNull(...args) {
    return this.addOperation(new KnexOperation('orOnNotNull'), args);
  }

  onExists(...args) {
    return this.addOperation(new KnexOperation('onExists'), args);
  }

  orOnExists(...args) {
    return this.addOperation(new KnexOperation('orOnExists'), args);
  }

  onNotExists(...args) {
    return this.addOperation(new KnexOperation('onNotExists'), args);
  }

  orOnNotExists(...args) {
    return this.addOperation(new KnexOperation('orOnNotExists'), args);
  }

  type(...args) {
    return this.addOperation(new KnexOperation('type'), args);
  }

  andOn(...args) {
    return this.addOperation(new KnexOperation('andOn'), args);
  }

  andOnIn(...args) {
    return this.addOperation(new WhereInOperation('andOnIn', { rawMethod: 'andOn' }), args);
  }

  andOnNotIn(...args) {
    return this.addOperation(
      new WhereInOperation('andOnNotIn', { rawMethod: 'andOn', not: true }),
      args,
    );
  }

  andOnNull(...args) {
    return this.addOperation(new KnexOperation('andOnNull'), args);
  }

  andOnNotNull(...args) {
    return this.addOperation(new KnexOperation('andOnNotNull'), args);
  }

  andOnExists(...args) {
    return this.addOperation(new KnexOperation('andOnExists'), args);
  }

  andOnNotExists(...args) {
    return this.addOperation(new KnexOperation('andOnNotExists'), args);
  }

  andOnBetween(...args) {
    return this.addOperation(new KnexOperation('andOnBetween'), args);
  }

  andOnNotBetween(...args) {
    return this.addOperation(new KnexOperation('andOnNotBetween'), args);
  }

  onJsonPathEquals(...args) {
    return this.addOperation(new KnexOperation('onJsonPathEquals'), args);
  }

  orOnJsonPathEquals(...args) {
    return this.addOperation(new KnexOperation('orOnJsonPathEquals'), args);
  }

  andOnJsonPathEquals(...args) {
    return this.addOperation(new KnexOperation('andOnJsonPathEquals'), args);
  }

  onVal(...args) {
    return this.addOperation(new KnexOperation('onVal'), args);
  }

  andOnVal(...args) {
    return this.addOperation(new KnexOperation('andOnVal'), args);
  }

  orOnVal(...args) {
    return this.addOperation(new KnexOperation('orOnVal'), args);
  }
}

module.exports = {
  JoinBuilder,
};
