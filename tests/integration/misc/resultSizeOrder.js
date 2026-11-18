const expect = require('expect.js');

// resultSize() leaves out the orders of the query, also the ones that a
// relation's `modify` adds when the query is built (#2747).
module.exports = (session) => {
  describe('resultSize() and the orders that a relation adds', () => {
    const { Model1, Model2 } = session.models;
    const queries = [];
    const onQuery = (query) => queries.push(query.sql);

    class OrderedModel1 extends Model1 {
      static get relationMappings() {
        return {
          ...super.relationMappings,
          orderedRelation2: {
            relation: Model1.HasManyRelation,
            modelClass: Model2,
            modify: (qb) => qb.orderBy('id_col', 'desc'),
            join: { from: 'Model1.id', to: 'model2.model1_id' },
          },
        };
      }
    }

    beforeEach(async () => {
      await session.populate([
        {
          id: 1,
          model1Prop1: 'a',
          model1Relation2: [
            { idCol: 1, model2Prop1: 'x' },
            { idCol: 2, model2Prop1: 'y' },
          ],
        },
      ]);

      queries.length = 0;
      session.knex.on('query', onQuery);
    });

    afterEach(() => {
      session.knex.removeListener('query', onQuery);
    });

    it("should count without the relation's order", async () => {
      const owner = await OrderedModel1.query(session.knex).findById(1);
      queries.length = 0;

      const size = await owner.$relatedQuery('orderedRelation2', session.knex).resultSize();

      expect(size).to.equal(2);
      expect(queries).to.have.length(1);
      expect(queries[0]).not.to.match(/order by/i);
    });
  });
};
