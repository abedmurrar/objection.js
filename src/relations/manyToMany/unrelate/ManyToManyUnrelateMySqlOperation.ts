import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase';
import { ManyToManyMySqlModifyMixin } from '../ManyToManyMySqlModifyMixin';

class ManyToManyUnrelateMySqlOperation extends ManyToManyMySqlModifyMixin(
  ManyToManyUnrelateOperationBase,
) {}

export { ManyToManyUnrelateMySqlOperation };
