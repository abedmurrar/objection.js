// Error message tests for the methods of custom query builders, where `this`
// is generic. See scripts/typings-errors.js.
import {
  Model,
  QueryBuilder,
  type DefaultQueryBuilderState,
  type ModelInstance,
  type QueryBuilderState,
} from '../../';

class MessageQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  declare '~rebind': MessageQueryBuilder<this['~M'], this['~R'], this['~S']>;

  wrongRelation() {
    // @error: Unknown relation \"usr\"
    return this.withGraphFetched<MessageModel, 'usr'>('usr');
  }

  wrongNestedRelation() {
    // @error: Unknown relation \"usr\" at \"threadedMessage\"
    return this.withGraphFetched<MessageModel, 'threadedMessage.usr'>('threadedMessage.usr');
  }

  withoutModel(): this {
    // @error: not assignable to parameter of type
    this.withGraphFetched('user');
    return this;
  }

  mapsRows(): this {
    // @error: is not assignable to type 'this'
    return this.runAfter((rows) => [rows]);
  }
}

class User extends Model {
  static tableName = 'user';
  firstName!: string;
}

class Message extends Model {
  static tableName = 'message';

  static get QueryBuilder() {
    return MessageQueryBuilder;
  }

  declare QueryBuilderType: MessageQueryBuilder<this>;

  user?: User | null;
  threadedMessage?: Message | null;
}

type MessageModel = ModelInstance<typeof Message>;

// @error: Argument of type '"usr"' is not assignable to parameter of type '"Unknown relation \"usr\""'.
Message.query().withGraphFetched('usr');
