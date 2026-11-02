'use strict';

const { withWhereScope } = require('../whereScopes');
const { FindOperation } = require('./FindOperation');
const { assertHasId } = require('../../utils/assert');

class InstanceFindOperation extends FindOperation {
  constructor(name, opt) {
    super(name, opt);
    this.instance = opt.instance;
  }

  onBuild(builder) {
    assertHasId(this.instance);
    withWhereScope(builder, () => builder.findById(this.instance.$id()));
  }
}

module.exports = {
  InstanceFindOperation,
};
