import { Relation } from '../Relation';
import { HasManyInsertOperation } from './HasManyInsertOperation';
import { HasManyRelateOperation } from './HasManyRelateOperation';
import { HasManyUnrelateOperation } from './HasManyUnrelateOperation';
import type { RelationModel, RelationQueryBuilder } from '../Relation';
import type { RelationOwner } from '../RelationOwner';

class HasManyRelation extends Relation {
  declare isObjectionHasManyRelation: boolean;

  insert(_: RelationQueryBuilder, owner: RelationOwner): HasManyInsertOperation {
    return new HasManyInsertOperation('insert', {
      relation: this,
      owner: owner,
    });
  }

  relate(_: RelationQueryBuilder, owner: RelationOwner): HasManyRelateOperation {
    return new HasManyRelateOperation('relate', {
      relation: this,
      owner: owner,
    });
  }

  unrelate(_: RelationQueryBuilder, owner: RelationOwner): HasManyUnrelateOperation {
    return new HasManyUnrelateOperation('unrelate', {
      relation: this,
      owner: owner,
    });
  }

  hasRelateProp(model: RelationModel): boolean {
    return model.$hasId();
  }

  setRelateProp(model: RelationModel, values: unknown[]): void {
    model.$id(values);
  }
}

Object.defineProperties(HasManyRelation.prototype, {
  isObjectionHasManyRelation: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

export { HasManyRelation };
