// A custom query builder in its own file, which imports its model, as a
// builder does for typed refs. Loaded before the model, the model's class body
// runs while this module hasn't finished loading.
const { QueryBuilder } = require('../../');
const models = require('./models');

class MessageQueryBuilder extends QueryBuilder {
  forInfo() {
    return this.select(models.Message.ref('id'));
  }
}

// Assigned like the CommonJS output of TypeScript, so that the model's getter
// sees it once this module has loaded.
exports.MessageQueryBuilder = MessageQueryBuilder;
