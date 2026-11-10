// Custom query builder methods, written the way chat-api writes them: one
// builder per model, in its own file, with methods that select columns, load
// relations and post-process rows. `this` is generic inside these methods.
import {
  Model,
  QueryBuilder,
  defineRelations,
  type DefaultQueryBuilderState,
  type ModelInstance,
  type QueryBuilderState,
  type WithGraphQueryBuilder,
} from '../../';

class UserQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  declare '~rebind': UserQueryBuilder<this['~M'], this['~R'], this['~S']>;

  forBasic(): this {
    return this.select('id', 'firstName');
  }
}

class MessageQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  declare '~rebind': MessageQueryBuilder<this['~M'], this['~R'], this['~S']>;

  // (a) Graph methods on `this`, with the model given explicitly, and
  // `modifyGraph()` typing the related builder with its custom methods.
  forBasic(): this {
    return this.withGraphFetched<MessageModel>('[user, threadedMessage]')
      .modifyGraph<UserModel>('user', (user) => user.forBasic())
      .modifyGraph<MessageModel>('threadedMessage', (threaded) => threaded.forInfo());
  }

  withJoinedUser(): this {
    return this.withGraphJoined<MessageModel>('user').allowGraph<MessageModel>('user');
  }

  // (b) A method whose return type says which relations it loads.
  withUser(): WithGraphQueryBuilder<this, 'user'> {
    return this.withGraphFetched<MessageModel, 'user'>('user');
  }

  forInfo(): this {
    return this.select('id', 'userId');
  }

  // (c) A `runAfter()` callback that returns its input keeps `this`.
  forList(): this {
    return this.select('id').runAfter(async (rows) => rows);
  }

  forListSync(): this {
    return this.runAfter((rows) => rows);
  }
}

class User extends Model {
  static tableName = 'user';

  // A getter, so that the builder's module can load before this one.
  static get QueryBuilder() {
    return UserQueryBuilder;
  }

  declare QueryBuilderType: UserQueryBuilder<this>;

  id!: number;
  firstName!: string;
}

class Message extends Model {
  static tableName = 'message';

  static get QueryBuilder() {
    return MessageQueryBuilder;
  }

  declare QueryBuilderType: MessageQueryBuilder<this>;

  id!: number;
  userId!: number;
  content!: string;

  static relationMappings = defineRelations(() => ({
    user: {
      relation: Model.BelongsToOneRelation,
      modelClass: User,
      join: { from: 'message.userId', to: 'user.id' },
    },
    threadedMessage: {
      relation: Model.BelongsToOneRelation,
      modelClass: Message,
      join: { from: 'message.threadedMessageId', to: 'message.id' },
    },
  }));
}

type MessageModel = ModelInstance<typeof Message>;
type UserModel = ModelInstance<typeof User>;

async function usage(): Promise<void> {
  // (4) `query()` is typed with the builder of the getter.
  const builder: MessageQueryBuilder<MessageModel> = Message.query();

  // (a) The custom methods chain.
  const basic = await Message.query().forBasic().forInfo();
  const id: number = basic[0].id;

  // (b) The loaded relation is typed on the rows.
  const withUser = await Message.query().withUser();
  // A belongs-to-one relation can be null.
  const firstName: string | undefined = withUser[0].user?.firstName;
  const one = await Message.query().withUser().findById(1);
  const maybeName: string | undefined = one?.user?.firstName;

  // (c) `forList()` keeps the rows.
  const list = await Message.query().forList();
  const listId: number = list[0].id;

  // (d) A `runAfter()` that maps still changes the result type.
  const contents: string[] = await Message.query().runAfter((rows) => rows.map((it) => it.content));

  // A `runAfter()` that returns nothing makes the result `undefined`.
  const nothing: undefined = await Message.query().runAfter(() => {});

  void [builder, id, firstName, maybeName, listId, contents, nothing];
}

void usage;
