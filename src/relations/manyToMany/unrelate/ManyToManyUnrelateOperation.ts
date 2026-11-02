import { ManyToManyUnrelateOperationBase } from './ManyToManyUnrelateOperationBase';
import { ManyToManyModifyMixin } from '../ManyToManyModifyMixin';

class ManyToManyUnrelateOperation extends ManyToManyModifyMixin(ManyToManyUnrelateOperationBase) {
  get modifyMainQuery(): boolean {
    return false;
  }
}

export { ManyToManyUnrelateOperation };
