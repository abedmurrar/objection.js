import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin';

class ManyToManyUnrelateSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyUnrelateOperationBase,
) {}

export { ManyToManyUnrelateSqliteOperation };
