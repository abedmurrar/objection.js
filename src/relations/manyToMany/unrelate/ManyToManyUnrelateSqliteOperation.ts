import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin';

class ManyToManyUnrelateSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyUnrelateOperationBase,
) {
  get modifyMainQuery(): boolean {
    return false;
  }
}

export { ManyToManyUnrelateSqliteOperation };
