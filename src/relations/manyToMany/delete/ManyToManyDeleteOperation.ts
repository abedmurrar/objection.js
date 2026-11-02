import { ManyToManyDeleteOperationBase } from './ManyToManyDeleteOperationBase';
import { ManyToManyModifyMixin } from '../ManyToManyModifyMixin';

class ManyToManyDeleteOperation extends ManyToManyModifyMixin(ManyToManyDeleteOperationBase) {}

export { ManyToManyDeleteOperation };
