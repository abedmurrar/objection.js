import { WhereInEagerOperation } from './WhereInEagerOperation';

class NaiveEagerOperation extends WhereInEagerOperation {
  batchSize(): number {
    return 1;
  }
}

export { NaiveEagerOperation };
