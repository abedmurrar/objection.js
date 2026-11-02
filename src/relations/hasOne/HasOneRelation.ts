import { HasManyRelation } from '../hasMany/HasManyRelation';

class HasOneRelation extends HasManyRelation {
  isOneToOne(): boolean {
    return true;
  }
}

export { HasOneRelation };
