import { Relation } from '../Relation';
import { BelongsToOneInsertOperation } from './BelongsToOneInsertOperation';
import { BelongsToOneDeleteOperation } from './BelongsToOneDeleteOperation';
import { BelongsToOneRelateOperation } from './BelongsToOneRelateOperation';
import { BelongsToOneUnrelateOperation } from './BelongsToOneUnrelateOperation';
import type { RelationQueryBuilder } from '../Relation';
import type { RelationOwner } from '../RelationOwner';

class BelongsToOneRelation extends Relation {
  declare isObjectionBelongsToOneRelation: boolean;

  isOneToOne(): boolean {
    return true;
  }

  insert(_: RelationQueryBuilder, owner: RelationOwner): BelongsToOneInsertOperation {
    return new BelongsToOneInsertOperation('insert', {
      relation: this,
      owner,
    });
  }

  delete(_: RelationQueryBuilder, owner: RelationOwner): BelongsToOneDeleteOperation {
    return new BelongsToOneDeleteOperation('delete', {
      relation: this,
      owner,
    });
  }

  relate(_: RelationQueryBuilder, owner: RelationOwner): BelongsToOneRelateOperation {
    return new BelongsToOneRelateOperation('relate', {
      relation: this,
      owner,
    });
  }

  unrelate(_: RelationQueryBuilder, owner: RelationOwner): BelongsToOneUnrelateOperation {
    return new BelongsToOneUnrelateOperation('unrelate', {
      relation: this,
      owner,
    });
  }
}

Object.defineProperties(BelongsToOneRelation.prototype, {
  isObjectionBelongsToOneRelation: {
    enumerable: false,
    writable: false,
    value: true,
  },
});

export { BelongsToOneRelation };
