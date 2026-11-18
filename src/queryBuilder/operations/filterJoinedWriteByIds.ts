import { withWhereScope } from '../whereScopes';
import type { QueryBuilder } from './types';

interface BuilderClass {
  JoinSelector: RegExp;
  WhereSelector: RegExp;
}

// knex leaves the joins out of updates on every database but MySQL, so an
// update with joins changed every row that its where clauses matched without
// the joined tables, or all the rows when it had none. Deletes with joins don't
// compile on SQLite. Such a write filters its rows by their ids in a subquery
// that has the joins and the where clauses instead.
function filterJoinedWriteByIds(builder: QueryBuilder): void {
  const builderClass = builder.constructor as unknown as BuilderClass;

  if (!builder.has(builderClass.JoinSelector)) {
    return;
  }

  const modelClass = builder.modelClass();

  if (modelClass.getIdColumn() === null) {
    throw new Error(
      `${modelClass.name} has no idColumn, which an update or a delete with joins needs on this database: the rows are filtered by their ids in a subquery that has the joins.`,
    );
  }

  const idProp = modelClass.getIdRelationProperty();
  const subquery = modelClass
    .query()
    .childQueryOf(builder)
    .copyFrom(builder, builderClass.JoinSelector)
    .copyFrom(builder, builderClass.WhereSelector);

  subquery.select(idProp.refs(subquery));

  builder.clear(builderClass.WhereSelector);
  builder.clear(builderClass.JoinSelector);

  withWhereScope(builder, () => builder.whereInComposite(idProp.refs(builder), subquery));
}

export { filterJoinedWriteByIds };
