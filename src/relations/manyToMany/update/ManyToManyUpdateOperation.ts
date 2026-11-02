import { ManyToManyUpdateOperationBase } from './ManyToManyUpdateOperationBase';
import { ManyToManyModifyMixin } from '../ManyToManyModifyMixin';

class ManyToManyUpdateOperation extends ManyToManyModifyMixin(ManyToManyUpdateOperationBase) {}

export { ManyToManyUpdateOperation };
