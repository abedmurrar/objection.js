import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin';

class ManyToManyUpdateSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyUpdateOperationBase,
) {}

export { ManyToManyUpdateSqliteOperation };
