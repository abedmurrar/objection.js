'use strict';

// The contenders, in display order. `fork` is the checkout given with `--lib`.
const CONTENDERS = {
  fork: {
    file: 'objection.js',
    options: { variant: 'fork' },
    label: '@abedmurrar/objection (this checkout)',
  },
  'objection-4.4.2': {
    file: 'objection.js',
    options: { variant: 'objection-4.4.2' },
    label: 'objection 4.4.2',
  },
  'objection-3.1.5': {
    file: 'objection.js',
    options: { variant: 'objection-3.1.5' },
    label: 'objection 3.1.5',
  },
  knex: { file: 'knex.js', options: {}, label: 'knex 3.3.0 (no ORM)' },
  kysely: { file: 'kysely.js', options: {}, label: 'kysely 0.29.8' },
  drizzle: { file: 'drizzle.js', options: {}, label: 'drizzle-orm 0.45.4' },
  sequelize: { file: 'sequelize.js', options: {}, label: 'sequelize 6.37.8' },
  typeorm: { file: 'typeorm.js', options: {}, label: 'typeorm 1.1.2' },
  'mikro-orm': { file: 'mikro-orm.js', options: {}, label: 'mikro-orm 7.2.6' },
};

module.exports = { CONTENDERS };
