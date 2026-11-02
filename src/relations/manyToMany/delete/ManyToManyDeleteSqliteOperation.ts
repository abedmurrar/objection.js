import { ManyToManyDeleteOperationBase } from './ManyToManyDeleteOperationBase';
import { ManyToManySqliteModifyMixin } from '../ManyToManySqliteModifyMixin';

class ManyToManyDeleteSqliteOperation extends ManyToManySqliteModifyMixin(
  ManyToManyDeleteOperationBase,
) {}

export { ManyToManyDeleteSqliteOperation };
