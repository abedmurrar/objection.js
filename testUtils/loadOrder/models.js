const { Model } = require('../../');
const builders = require('./messageQueryBuilder');

// Read when the class body runs: undefined if the builder's module is still
// loading.
class AssignedMessage extends Model {
  static tableName = 'message';
  static QueryBuilder = builders.MessageQueryBuilder;
}

// Read when a query is built.
class Message extends Model {
  static tableName = 'message';

  static get QueryBuilder() {
    return builders.MessageQueryBuilder;
  }
}

exports.AssignedMessage = AssignedMessage;
exports.Message = Message;
