import { Model, ref } from '../../../';
import { expectType } from '../_utils/expect';

class Notification extends Model {
  static tableName = 'notifications';

  id!: number;
  payload!: { courseId?: number; tags?: string[] } | null;
}

async () => {
  expectType<Notification[]>()(
    await Notification.query()
      .whereJsonOverlaps('payload:tags', ['a', 'b'])
      .orWhereJsonNotOverlaps('payload:tags', 'other:tags')
      .andWhereJsonOverlaps('payload', { courseId: 1 })
      .whereJsonSupersetOf('payload:tags', ['a'])
      .whereJsonHasAny('payload', ['courseId']),
  );

  await Notification.query().whereIn(ref('payload:courseId').castInt(), [1, 2]);
};
