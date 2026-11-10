const Knex = require('knex');
const expect = require('expect.js');

// doc/fork/typescript.md: a custom query builder in its own file, which
// imports its model, is undefined in `static QueryBuilder = ...` when the
// builder's module is loaded first. A `static get QueryBuilder()` works in
// either order.
describe('custom query builder load order', () => {
  it('should use the builder of a static getter when the builder module loads first', () => {
    const { MessageQueryBuilder } = require('../../../testUtils/loadOrder/messageQueryBuilder');
    const { Message, AssignedMessage } = require('../../../testUtils/loadOrder/models');
    const knex = Knex({ client: 'pg' });

    expect(AssignedMessage.QueryBuilder).to.be(undefined);

    const query = Message.query(knex);
    expect(query).to.be.a(MessageQueryBuilder);
    expect(query.forInfo().toKnexQuery().toString()).to.equal(
      'select "message"."id" from "message"',
    );
  });
});
