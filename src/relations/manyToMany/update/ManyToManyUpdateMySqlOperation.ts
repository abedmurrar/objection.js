import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase';
import { ManyToManyMySqlModifyMixin } from '../ManyToManyMySqlModifyMixin';

class ManyToManyUpdateMySqlOperation extends ManyToManyMySqlModifyMixin(
  ManyToManyUpdateOperationBase,
) {}

export { ManyToManyUpdateMySqlOperation };
