const expect = require('expect.js');
const objection = require('../../../');
const Model = objection.Model;
const { JoinBuilder } = require('../../../lib/queryBuilder/JoinBuilder');
const JoinClause = require('knex/lib/query/joinclause');

describe('JoinBuilder', () => {
  it('should have knex.JoinClause methods', () => {
    class TestModel extends Model {
      static get tableName() {
        return 'Model';
      }
    }

    const ignore = [];

    const knexJoinClause = new JoinClause();
    const builder = JoinBuilder.forClass(TestModel);
    for (const name in knexJoinClause) {
      const func = knexJoinClause[name];
      console.log('checking', name, typeof func);
      if (typeof func === 'function' && ignore.indexOf(name) === -1) {
        if (typeof builder[name] !== 'function') {
          expect().to.fail("knex method '" + name + "' is missing from JoinBuilder");
        }
      }
    }
  });
});
