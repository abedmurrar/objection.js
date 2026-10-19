import {
  Model,
  QueryBuilder,
  QueryBuilderState,
  DefaultQueryBuilderState,
  RelationMappingsThunk,
  ModelInstance,
  ModelProps,
  ModelRelations,
  RelationsOf,
  defineRelations,
} from '../../../';
import { Equal, Expect, expectType } from '../_utils/expect';

// Relation types are inferred from `relationMappings`. The relation properties
// don't need to be declared in the model.

class SoftDeleteQueryBuilder<
  M extends Model,
  R = M[],
  S extends QueryBuilderState = DefaultQueryBuilderState<M, R>,
> extends QueryBuilder<M, R, S> {
  declare '~rebind': SoftDeleteQueryBuilder<this['~M'], this['~R'], this['~S']>;

  active(): this {
    return this.whereNull('deletedAt');
  }
}

abstract class BaseModel extends Model {
  static QueryBuilder = SoftDeleteQueryBuilder;
  declare QueryBuilderType: SoftDeleteQueryBuilder<this>;
}

declare const requiredModel: any;

class User extends BaseModel {
  static tableName = 'users';

  id!: number;
  name!: string;
  momId?: number | null;

  static relationMappings = () => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'users.id', to: 'pets.ownerId' },
    },
    mom: {
      relation: Model.BelongsToOneRelation,
      modelClass: User,
      join: { from: 'users.momId', to: 'users.id' },
    },
    // Without `defineRelations` the names of the extra columns are inferred
    // as `string[]` and can't be used.
    courses: {
      relation: Model.ManyToManyRelation,
      modelClass: () => Course,
      join: {
        from: 'users.id',
        through: { from: 'courseUsers.userId', to: 'courseUsers.courseId', extra: ['role'] },
        to: 'courses.id',
      },
    },
    firstCourse: {
      relation: Model.HasOneThroughRelation,
      modelClass: () => Course,
      join: {
        from: 'users.id',
        through: { from: 'courseUsers.userId', to: 'courseUsers.courseId' },
        to: 'courses.id',
      },
    },
    // Module paths and untyped classes (like `require()`) can't be inferred.
    webhooks: {
      relation: Model.HasManyRelation,
      modelClass: 'Webhook',
      join: { from: 'users.id', to: 'webhooks.userId' },
    },
    required: {
      relation: Model.BelongsToOneRelation,
      modelClass: requiredModel,
      join: { from: 'users.requiredId', to: 'required.id' },
    },
  });
}

class Pet extends BaseModel {
  static tableName = 'pets';

  id!: number;
  name!: string;
  ownerId!: number;
  deletedAt?: Date | null;

  // An object works too.
  static relationMappings = {
    owner: {
      relation: Model.BelongsToOneRelation,
      modelClass: () => User,
      join: { from: 'pets.ownerId', to: 'users.id' },
    },
  };
}

class CourseUser extends BaseModel {
  static tableName = 'courseUsers';

  role!: 'admin' | 'member';
  joinedAt!: Date;
}

class Course extends BaseModel {
  static tableName = 'courses';

  id!: number;
  title!: string;

  // `defineRelations` keeps the names of the extra columns. Their types come
  // from the join table model if there is one.
  static relationMappings = defineRelations(() => ({
    users: {
      relation: Model.ManyToManyRelation,
      modelClass: User,
      join: {
        from: 'courses.id',
        through: {
          modelClass: CourseUser,
          from: 'courseUsers.courseId',
          to: 'courseUsers.userId',
          extra: ['role', 'joinedAt'],
        },
        to: 'users.id',
      },
    },
    admins: {
      relation: Model.ManyToManyRelation,
      modelClass: User,
      join: {
        from: 'courses.id',
        through: {
          from: 'courseUsers.courseId',
          to: 'courseUsers.userId',
          extra: { adminSince: 'joinedAt' },
        },
        to: 'users.id',
      },
    },
  }));
}

type UserRow = ModelInstance<typeof User>;
type PetRow = ModelInstance<typeof Pet>;
type CourseRow = ModelInstance<typeof Course>;

async () => {
  const user = await User.query().findById(1).throwIfNotFound();

  expectType<UserRow>()(user);
  expectType<PetRow[] | undefined>()(user.pets);
  expectType<UserRow | null | undefined>()(user.mom);
  expectType<CourseRow[] | undefined>()(user.courses);
  expectType<CourseRow | null | undefined>()(user.firstCourse);
  expectType<Model[] | undefined>()(user.webhooks);
  expectType<Model | null | undefined>()(user.required);

  // The related models have their inferred relations too.
  expectType<UserRow | null | undefined>()(user.pets?.[0].owner);
  expectType<string | undefined>()(user.pets?.[0].owner?.mom?.name);

  // Extra columns of many-to-many relations.
  const course = await Course.query().findById(1).throwIfNotFound();
  expectType<(UserRow & { role: 'admin' | 'member'; joinedAt: Date })[] | undefined>()(
    course.users,
  );
  expectType<(UserRow & { adminSince: unknown })[] | undefined>()(course.admins);

  // @ts-expect-error
  user.notARelation;
};

// Relations aren't columns.
type _1 = Expect<Equal<ModelProps<UserRow>, 'id' | 'name' | 'momId'>>;
type _2 = Expect<
  Equal<
    ModelRelations<UserRow>,
    'pets' | 'mom' | 'courses' | 'firstCourse' | 'webhooks' | 'required'
  >
>;

// `relatedQuery` uses the inferred relations and the related model's query builder.
async () => {
  expectType<PetRow[]>()(await User.relatedQuery('pets').for(1).active());
  expectType<PetRow | undefined>()(await User.relatedQuery('pets').for(1).active().first());
  expectType<UserRow[]>()(await Pet.relatedQuery('owner').for(1));
  expectType<(UserRow & { role: 'admin' | 'member'; joinedAt: Date })[]>()(
    await Course.relatedQuery('users').for(1),
  );
  expectType<Model[]>()(await User.relatedQuery('webhooks').for(1));

  // @ts-expect-error
  User.relatedQuery('nope');

  // Models fetched from the database have the relation properties, so their
  // `$relatedQuery()` is typed too.
  const user = await User.query().findById(1).throwIfNotFound();
  expectType<PetRow[]>()(await user.$relatedQuery('pets').active());

  // `fromJson()` too.
  expectType<UserRow>()(User.fromJson({ name: 'Jennifer' }));
};

// Models can still declare relation properties. The declared types are used.
class Owner extends BaseModel {
  pets?: Pet[];

  static relationMappings = () => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'owners.id', to: 'pets.ownerId' },
    },
  });
}

async () => {
  const owner = await Owner.query().findById(1).throwIfNotFound();
  expectType<Pet[] | undefined>()(owner.pets);
};

// Annotated relation mappings can't be inferred. The declared properties are used.
class Annotated extends BaseModel {
  pets?: Pet[];

  static relationMappings: RelationMappingsThunk = () => ({
    pets: {
      relation: Model.HasManyRelation,
      modelClass: Pet,
      join: { from: 'annotated.id', to: 'pets.ownerId' },
    },
  });
}

async () => {
  const annotated = await Annotated.query().findById(1).throwIfNotFound();
  type _ = Expect<Equal<typeof annotated, Annotated>>;
};

// To get the relations for instances that aren't created by objection (like
// `new Organization()` or `this` in instance methods), add one line.
class Organization extends BaseModel {
  id!: number;

  static relationMappings = () => ({
    members: {
      relation: Model.HasManyRelation,
      modelClass: User,
      join: { from: 'organizations.id', to: 'users.organizationId' },
    },
  });

  memberNames() {
    return (this.members ?? []).map((it) => it.name);
  }
}

interface Organization extends RelationsOf<typeof Organization> {}

() => {
  const organization = new Organization();
  expectType<UserRow[] | undefined>()(organization.members);
  expectType<string[]>()(organization.memberNames());
};
