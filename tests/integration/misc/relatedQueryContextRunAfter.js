const expect = require('expect.js');
const { Model } = require('../../../');

// A context `runAfter()` runs before the relation's own result handling, which
// removes the join columns it selected and turns the rows of a one-to-one
// relation into one model. It can return anything: an `undefined` made
// `$relatedQuery()` of a one-to-one relation throw "Cannot read properties of
// undefined (reading 'length')".
module.exports = (session) => {
  describe('$relatedQuery() with a context runAfter()', () => {
    const knex = session.knex;
    let kid;

    class Person extends Model {
      static tableName = 'rqcPerson';
      static relationMappings = () => ({
        mom: {
          relation: Model.BelongsToOneRelation,
          modelClass: Person,
          join: { from: 'rqcPerson.momId', to: 'rqcPerson.id' },
        },
      });
    }

    before(async () => {
      await knex.schema.dropTableIfExists('rqcPerson');
      await knex.schema.createTable('rqcPerson', (table) => {
        table.integer('id').primary();
        table.integer('momId');
        table.string('name');
      });
      await knex('rqcPerson').insert([
        { id: 1, momId: null, name: 'mom' },
        { id: 2, momId: 1, name: 'kid' },
      ]);

      kid = await Person.query(knex).findById(2);
    });

    after(() => knex.schema.dropTableIfExists('rqcPerson'));

    it('should return what runAfter() returns when it is undefined', async () => {
      const mom = await kid
        .$relatedQuery('mom', knex)
        .select('name')
        .context({ runAfter: () => undefined });

      expect(mom).to.be(undefined);
    });

    it('should remove the selected join column when runAfter() returns one model', async () => {
      const mom = await kid
        .$relatedQuery('mom', knex)
        .select('name')
        .context({ runAfter: (people) => people[0] });

      expect(mom).to.be.a(Person);
      expect(mom.toJSON()).to.eql({ name: 'mom' });
    });

    it('should remove the selected join column when runAfter() returns the models', async () => {
      const mom = await kid
        .$relatedQuery('mom', knex)
        .select('name')
        .context({ runAfter: (people) => people });

      expect(mom.toJSON()).to.eql({ name: 'mom' });
    });
  });
};
