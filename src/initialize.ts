import type { Knex } from 'knex';
import type { ModelClass } from './model/Model';

async function initialize(knex: Knex | ModelClass[], modelClasses?: ModelClass[]): Promise<void> {
  if (!modelClasses) {
    modelClasses = knex as ModelClass[];
    knex = modelClasses[0].knex();
  }

  await Promise.all(
    modelClasses.map((modelClass) => modelClass.fetchTableMetadata({ knex: knex as Knex })),
  );
}

export { initialize };
