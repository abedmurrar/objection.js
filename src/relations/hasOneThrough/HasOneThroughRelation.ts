import { ManyToManyRelation } from '../manyToMany/ManyToManyRelation';

class HasOneThroughRelation extends ManyToManyRelation {
  isOneToOne(): boolean {
    return true;
  }
}

export { HasOneThroughRelation };
