const { sortBy } = require('../../testUtils/testUtils');
const { cloneDeep } = require('../../lib/utils/cloneDeep');
const chai = require('chai');
const utils = require('../../lib/utils/knexUtils');
const expect = require('expect.js');
const { transaction, ValidationError, Model } = require('../../');

module.exports = (session) => {
  const Model1 = session.models.Model1;
  const Model2 = session.models.Model2;

  describe('Model insertGraph queries', () => {
    const eagerExpr = `[
      model1Relation1.model1Relation3,
      model1Relation1Inverse,
      model1Relation2.model2Relation2
    ]`;

    let population;
    let insertion;

    beforeEach(() => {
      population = {
        id: 1,
        model1Prop1: '20',
        model1Relation3: [
          {
            idCol: 1,
          },
        ],
      };

      insertion = {
        model1Prop1: 'root',

        model1Relation1: {
          model1Prop1: 'parent',
          model1Prop2: '#ref{grandChild.idCol}',

          model1Relation3: [
            {
              '#ref': 'child1',
            },
            {
              '#id': 'grandChild',
              model2Prop1: 'cibling2',
              // These should go to the join table.
              extra1: 'extraVal1',
              extra2: 'extraVal2',
            },
            {
              '#dbRef': 1,
              extra1: 'foo',
            },
          ],
        },

        model1Relation1Inverse: {
          model1Prop1: 'rootParent',
        },

        model1Relation2: [
          {
            '#id': 'child1',
            model2Prop1: 'child1',
          },
          {
            model2Prop1: 'child2',

            model2Relation2: {
              model1Prop1: 'child3',
            },
          },
        ],
      };
    });

    describe('.query().insertGraph()', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      it('should do nothing if an empty array is provided', () => {
        return Model1.query().insertGraph([]);
      });

      it('should throw if #ref is used without the `allowRefs` option', (done) => {
        Model1.query()
          .insertGraph({
            '#id': 'id1',

            model1Relation2: [
              {
                '#ref': 'id1',
              },
            ],
          })
          .then(() => {
            done(new Error('should not get here'));
          })
          .catch((err) => {
            expect(err.message).to.equal(
              '#ref references are not allowed in a graph by default. see the allowRefs insert/upsert graph option',
            );
            done();
          });
      });

      it('should throw if #ref{} is used without the `allowRefs` option', (done) => {
        Model1.query()
          .insertGraph({
            '#id': 'id1',

            model1Relation2: [
              {
                model1Prop1: '#ref{id1.id}',
              },
            ],
          })
          .then(() => {
            done(new Error('should not get here'));
          })
          .catch((err) => {
            expect(err.message).to.equal(
              '#ref references are not allowed in a graph by default. see the allowRefs insert/upsert graph option',
            );
            done();
          });
      });

      it('should insert a model with relations', () => {
        return Model1.query()
          .insertGraph(insertion, { allowRefs: true })
          .then((inserted) => {
            return check(inserted, true).then(() => inserted);
          })
          .then((inserted) => {
            expect(inserted).to.not.have.property('model1Prop2');
            return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
          })
          .then((model) => {
            return check(model);
          });
      });

      describe('jsonSchema: additionalProperties = false', () => {
        let origSchema;

        before(() => {
          origSchema = Model1.jsonSchema;

          Model1.jsonSchema = {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'number' },
              model1Prop1: { type: 'string' },
              model1Prop2: { type: 'number' },
              model1Id: { type: 'number' },
            },
          };

          // Clear the memoized schema.
          delete Model1.$$jsonSchema;
          expect(Model1.getJsonSchema()).to.equal(Model1.jsonSchema);
        });

        after(() => {
          Model1.jsonSchema = origSchema;

          // Clear the memoized schema.
          delete Model1.$$jsonSchema;
          expect(Model1.getJsonSchema()).to.equal(origSchema);
        });

        it('should insert a model with relations', () => {
          return Model1.query()
            .insertGraph(insertion, { allowRefs: true })
            .then((inserted) => {
              return check(inserted, true).then(() => inserted);
            })
            .then((inserted) => {
              expect(inserted).to.not.have.property('model1Prop2');
              return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
            })
            .then((model) => {
              return check(model);
            });
        });
      });

      it('should accept raw sql and subqueries', () => {
        return Model1.query()
          .insertGraph([
            {
              model1Prop1: '10',
            },
            {
              model1Prop1: '50',
            },
          ])
          .then(() => {
            return Model1.query().insertGraph({
              model1Prop1: Model1.raw('40 + 2'),

              model1Relation2: [
                {
                  '#id': 'child1',
                  idCol: 100,
                  model2Prop1: Model1.query().min('model1Prop1'),
                },
                {
                  idCol: 101,
                  model2Prop1: Model1.knex().from('Model1').max('model1Prop1'),
                },
              ],
            });
          })
          .then((inserted) => {
            inserted.model1Relation2 = sortBy(inserted.model1Relation2, 'idCol');

            expect(inserted.toJSON()).to.eql({
              id: 4,
              model1Relation2: [
                { model1Id: 4, idCol: 100 },
                { model1Id: 4, idCol: 101 },
              ],
            });

            return Model1.query().withGraphFetched('model1Relation2').where('id', inserted.id);
          })
          .then((inserted) => {
            inserted[0].model1Relation2 = sortBy(inserted[0].model1Relation2, 'idCol');

            expect(inserted[0]).to.eql({
              id: 4,
              model1Id: null,
              model1Prop1: '42',
              model1Prop2: null,
              $afterFindCalled: 1,
              model1Relation2: [
                {
                  idCol: 100,
                  model1Id: 4,
                  model2Prop1: '10',
                  model2Prop2: null,
                  $afterFindCalled: 1,
                },
                {
                  idCol: 101,
                  model1Id: 4,
                  model2Prop1: '50',
                  model2Prop2: null,
                  $afterFindCalled: 1,
                },
              ],
            });
          });
      });

      const testValidation = (modifyGraph, expectedProperty) => {
        return (done) => {
          const graph = cloneDeep(insertion);
          modifyGraph(graph);

          transaction(Model1, Model2, (Model1, Model2) => {
            // We can modify Model1 and Model2 here since it is a subclass of the actual
            // models shared between tests.
            Model1.jsonSchema = {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                model1Id: { type: 'integer' },
                model1Prop1: { type: 'string' },
                model1Prop2: { type: 'integer' },
              },
            };

            Model2.jsonSchema = {
              type: 'object',
              properties: {
                idCol: { type: 'integer' },
                model1Id: { type: 'integer' },
                model2Prop1: { type: 'string' },
                model2Prop2: { type: 'integer' },
              },
            };

            delete Model1.$$jsonSchema;
            delete Model2.$$jsonSchema;

            expect(Model1.getJsonSchema()).to.equal(Model1.jsonSchema);
            expect(Model2.getJsonSchema()).to.equal(Model2.jsonSchema);

            return Model1.query().insertGraph(graph, { allowRefs: true });
          })
            .then(() => {
              done(new Error('should not get here'));
            })
            .catch((err) => {
              expect(err).to.be.a(ValidationError);
              expect(err.data).to.have.property(expectedProperty);

              return Promise.all([session.knex('Model1'), session.knex('model2')]);
            })
            .then(([rows1, rows2]) => {
              expect(rows1).to.have.length(1);
              expect(rows2).to.have.length(1);
              done();
            })
            .catch(done);
        };
      };

      it(
        'should validate models upon insertion and return correct validation paths',
        testValidation((graph) => {
          graph.model1Relation1.model1Prop1 = 666;
        }, 'model1Relation1.model1Prop1'),
      );

      it(
        'should return correct validation paths with has-many relations',
        testValidation((graph) => {
          graph.model1Relation2[0].model2Prop1 = 666;
        }, 'model1Relation2[0].model2Prop1'),
      );

      it(
        'should return correct validation paths with many-to-many relations',
        testValidation((graph) => {
          graph.model1Relation1.model1Relation3[1].model2Prop1 = 666;
        }, 'model1Relation1.model1Relation3[1].model2Prop1'),
      );

      it('should roll back after the inserts that already started when a model fails validation', async () => {
        let numStarted = 0;
        let numInserted = 0;

        class ValidatedModel1 extends Model1 {
          static jsonSchema = {
            type: 'object',
            properties: {
              model1Prop1: { type: 'string' },
            },
          };

          // Keep the valid inserts running when the invalid model fails:
          async $beforeInsert() {
            numStarted++;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          $afterInsert() {
            numInserted++;
          }
        }

        const graph = [
          ...Array.from({ length: 7 }, (_, i) => ({ model1Prop1: `${i}` })),
          { model1Prop1: 666 },
        ];

        const err = await transaction(ValidatedModel1, (ValidatedModel1) =>
          ValidatedModel1.query().insertGraph(graph),
        ).catch((err) => err);

        expect(err).to.be.a(ValidationError);
        // Inserts that run after the rollback can commit their rows on SQLite:
        expect(numInserted).to.equal(numStarted);
        expect(await session.knex('Model1')).to.have.length(1);
      });

      it('should validate models upon insertion: references in integer columns should be accepted', () => {
        return transaction(Model1, Model2, (Model1, Model2) => {
          // We can modify Model1 and Model2 here since it is a subclass of the actual
          // models shared between tests.
          Model1.jsonSchema = {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              model1Id: { type: 'integer' },
              model1Prop1: { type: 'string' },
              model1Prop2: { type: 'integer' },
            },
          };

          Model2.jsonSchema = {
            type: 'object',
            properties: {
              idCol: { type: 'integer' },
              model1Id: { type: 'integer' },
              model2Prop1: { type: 'string' },
              model2Prop2: { type: 'integer' },
            },
          };

          // Clear the memoized schema.
          delete Model1.$$jsonSchema;
          delete Model2.$$jsonSchema;

          expect(Model1.getJsonSchema()).to.equal(Model1.jsonSchema);
          expect(Model2.getJsonSchema()).to.equal(Model2.jsonSchema);

          return Model1.query()
            .insertGraph(insertion, { allowRefs: true })
            .then((inserted) => {
              return check(inserted, true).then(() => inserted);
            })
            .then((inserted) => {
              expect(inserted).to.not.have.property('model1Prop2');
              return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
            })
            .then((model) => {
              return check(model);
            });
        });
      });

      it('relate: true option should cause models with id to be related instead of inserted', () => {
        return Model2.query()
          .insertGraph(
            {
              model2Prop1: 'foo',

              model2Relation1: [
                {
                  id: population.id,
                },
              ],
            },
            {
              relate: true,
            },
          )
          .then((model) => {
            return Model2.query().findById(model.idCol).withGraphFetched('model2Relation1');
          })
          .then((model) => {
            delete model.idCol;

            expect(model).to.eql({
              model1Id: null,
              model2Prop1: 'foo',
              model2Prop2: null,
              $afterFindCalled: 1,

              model2Relation1: [
                {
                  id: population.id,
                  model1Id: null,
                  model1Prop1: population.model1Prop1,
                  model1Prop2: null,
                  aliasedExtra: null,
                  $afterFindCalled: 1,
                },
              ],
            });
          });
      });

      it('should not insert the descendants of models skipped by noInsert (#215)', async () => {
        await Model1.query().insertGraph(
          {
            model1Prop1: 'root',

            model1Relation2: [
              {
                // Not inserted because of `noInsert`, and neither are its descendants.
                model2Prop1: 'skipped hasMany',

                model2Relation1: [
                  {
                    model1Prop1: 'manyToMany of skipped',
                    model1Relation1: { model1Prop1: 'belongsToOne of skipped' },
                  },
                ],
              },
            ],
          },
          { noInsert: ['model1Relation2'] },
        );

        const [model1Rows, model2Rows] = await Promise.all([
          session.knex('Model1').orderBy('id'),
          session.knex('model2'),
        ]);

        chai.expect(model1Rows.map((row) => row.model1Prop1)).to.eql(['20', 'root']);
        chai.expect(model2Rows.map((row) => row.id_col)).to.eql([1]);
      });

      it('should insert the models below models skipped by noInsert that #ref points to (#215)', async () => {
        const model = await Model1.query().insertGraph(
          {
            model1Prop1: 'root',

            model1Relation1: {
              // Not inserted because of `noInsert`.
              model1Prop1: 'skipped belongsToOne',
              model1Relation2: [{ '#id': 'referenced', model2Prop1: 'referenced' }],

              model1Relation1: {
                // Not inserted because of `noInsert`, and neither are its descendants.
                model1Prop1: 'nested skipped belongsToOne',
                model1Relation2: [{ model2Prop1: 'hasMany of nested skipped' }],
              },
            },

            model1Relation3: [{ '#ref': 'referenced' }],
          },
          { allowRefs: true, noInsert: ['model1Relation1', 'model1Relation1.model1Relation1'] },
        );

        const result = await Model1.query().findById(model.id).withGraphFetched('model1Relation3');

        expect(result.model1Id).to.equal(null);
        expect(result.model1Relation3.map((it) => it.model2Prop1)).to.eql(['referenced']);
        expect(
          await session.knex('model2').where('model2_prop1', 'hasMany of nested skipped'),
        ).to.eql([]);
      });

      it('should insert the models below models skipped by noInsert that #ref{} points to (#215)', async () => {
        const model = await Model1.query().insertGraph(
          {
            model1Prop1: 'root',
            model1Prop2: '#ref{referenced.idCol}',

            model1Relation1: {
              // Not inserted because of `noInsert`.
              model1Prop1: 'skipped belongsToOne',
              model1Relation2: [{ '#id': 'referenced', model2Prop1: 'referenced' }],
            },
          },
          { allowRefs: true, noInsert: ['model1Relation1'] },
        );

        const [row] = await session.knex('model2').where('model2_prop1', 'referenced');

        expect(row.id_col).to.be.a('number');
        expect(model.model1Prop2).to.equal(row.id_col);
      });

      it('trying to relate a HasManyRelation should throw', (done) => {
        Model1.query()
          .insertGraph(
            {
              model1Prop1: 'foo',

              model1Relation2: [
                {
                  idCol: population.model1Relation3[0].idCol,
                },
              ],
            },
            {
              relate: true,
            },
          )
          .then(() => done(new Error('should not get here')))
          .catch((err) => {
            expect(err.message).to.equal(
              'You cannot relate HasManyRelation or HasOneRelation using insertGraph, because those require update operations. Consider using upsertGraph instead.',
            );
            done();
          })
          .catch(done);
      });

      it(`relate: ['relation.path'] option should cause models with id to be related instead of inserted`, () => {
        return Model1.query()
          .insert({ model1Prop1: 'howdy', id: 500 })
          .then(() => {
            return Model1.query().insertGraph(
              {
                model1Prop1: 'hello',

                model1Relation1: {
                  // This should get related.
                  id: 500,
                },

                model1Relation2: [
                  {
                    model2Prop1: 'world',

                    model2Relation1: [
                      {
                        // This should get related.
                        id: population.id,
                      },
                    ],
                  },
                ],

                model1Relation3: [
                  {
                    // This should get inserted.
                    idCol: 1000,
                  },
                ],
              },
              {
                relate: ['model1Relation1', 'model1Relation2.model2Relation1'],
              },
            );
          })
          .then((model) => {
            return Model1.query()
              .findById(model.id)
              .withGraphFetched(
                '[model1Relation1, model1Relation2.model2Relation1, model1Relation3]',
              );
          })
          .then((model) => {
            delete model.id;
            delete model.model1Relation2[0].idCol;
            delete model.model1Relation2[0].model1Id;

            expect(model).to.eql({
              model1Id: 500,
              model1Prop1: 'hello',
              model1Prop2: null,
              $afterFindCalled: 1,

              model1Relation1: {
                id: 500,
                model1Prop1: 'howdy',
                model1Id: null,
                model1Prop2: null,
                $afterFindCalled: 1,
              },

              model1Relation2: [
                {
                  model2Prop1: 'world',
                  model2Prop2: null,
                  $afterFindCalled: 1,

                  model2Relation1: [
                    {
                      id: population.id,
                      model1Id: null,
                      model1Prop1: population.model1Prop1,
                      model1Prop2: null,
                      aliasedExtra: null,
                      $afterFindCalled: 1,
                    },
                  ],
                },
              ],

              model1Relation3: [
                {
                  idCol: 1000,
                  model1Id: null,
                  model2Prop1: null,
                  model2Prop2: null,
                  extra1: null,
                  extra2: null,
                  $afterFindCalled: 1,
                },
              ],
            });
          });
      });

      if (utils.isPostgres(session.knex)) {
        it('query building methods should be applied to the root models', () => {
          return Model1.query()
            .insertGraph(insertion, { allowRefs: true })
            .returning('*')
            .then((inserted) => {
              return check(inserted, true).then(() => inserted);
            })
            .then((inserted) => {
              expect(inserted).to.have.property('model1Prop2');
              return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
            })
            .then((model) => {
              return check(model);
            });
        });
      }
    });

    describe('.query().insertGraphAndFetch()', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      it('should do nothing if an empty array is provided', () => {
        return Model1.query().insertGraphAndFetch([]);
      });

      it('should insert a model with relations and fetch the inserted graph', () => {
        return Model1.query()
          .insertGraphAndFetch(insertion, { allowRefs: true })
          .then((inserted) => {
            return check(inserted).then(() => inserted);
          })
          .then((inserted) => {
            return Model1.query()
              .withGraphFetched(eagerExpr)
              .findById(inserted.id)
              .then((fetched) => {
                chai.expect(inserted.$toJson()).to.containSubset(fetched.$toJson());
                chai.expect(fetched.$toJson()).to.containSubset(inserted.$toJson());
              });
          });
      });

      it('relate: true option should cause models with id to be related instead of inserted', () => {
        return Model2.query()
          .insertGraphAndFetch(
            {
              model2Prop1: 'foo',

              model2Relation1: [
                {
                  id: population.id,
                },
              ],
            },
            {
              relate: true,
            },
          )
          .then((model) => {
            return Model2.query().findById(model.idCol).withGraphFetched('model2Relation1');
          })
          .then((model) => {
            delete model.idCol;

            expect(model).to.eql({
              model1Id: null,
              model2Prop1: 'foo',
              model2Prop2: null,
              $afterFindCalled: 1,

              model2Relation1: [
                {
                  id: population.id,
                  model1Id: null,
                  model1Prop1: population.model1Prop1,
                  model1Prop2: null,
                  aliasedExtra: null,
                  $afterFindCalled: 1,
                },
              ],
            });
          });
      });
    });

    describe('.query().insertGraph().allowGraph()', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      it('should allow insert when the allowed relation expression is a superset', () => {
        return Model1.query()
          .insertGraph(insertion, { allowRefs: true })
          .allowGraph(eagerExpr)
          .then((inserted) => {
            return check(inserted, true).then(() => inserted);
          });
      });

      it('should not allow insert when the allowed relation expression is not a superset', (done) => {
        Model1.query()
          .insertGraph(insertion)
          .allowGraph('[model1Relation1.model1Relation3, model1Relation2]')
          .then(() => {
            done(new Error('should not get here'));
          })
          .catch((err) => {
            expect(err instanceof ValidationError).to.equal(true);
            expect(err.type).to.equal('UnallowedRelation');
            expect(err.message).to.eql('trying to upsert an unallowed relation');
            done();
          })
          .catch(done);
      });
    });

    describe('.$query().insertGraph()', () => {
      beforeEach(() => {
        return session.populate(population);
      });

      it('should insert a model with relations', () => {
        return Model1.fromJson(insertion)
          .$query()
          .insertGraph(undefined, { allowRefs: true })
          .then((inserted) => {
            return check(inserted, true).then(() => inserted);
          })
          .then((inserted) => {
            return Model1.query().withGraphFetched(eagerExpr).where('id', inserted.id).first();
          })
          .then((model) => {
            return check(model);
          });
      });
    });

    describe('batch inserts', () => {
      beforeEach(() => session.populate([]));

      it('should insert the rows of each table in one query on MySQL and PostgreSQL, with the right keys', async () => {
        const queries = [];
        const onQuery = (query) => queries.push(query.sql);
        session.knex.on('query', onQuery);

        let root;
        try {
          root = await Model1.query().insertGraph({
            model1Prop1: 'root',
            model1Relation2: [1, 2, 3].map((i) => ({
              model2Prop1: `hasMany ${i}`,
              // Each child has its own children, which depend on the child's id.
              model2Relation1: [1, 2].map((j) => ({ model1Prop1: `manyToMany ${i}.${j}` })),
            })),
          });
        } finally {
          session.knex.removeListener('query', onQuery);
        }

        const inserts = queries.filter((sql) => /^insert/i.test(sql));

        if (session.isMySql() || session.isPostgres()) {
          // The root with the 6 many-to-many rows (the same table), the 3
          // children and the 6 join rows.
          expect(inserts).to.have.length(3);
        } else {
          expect(inserts).to.have.length(16);
        }

        const fetched = await Model1.query()
          .findById(root.id)
          .withGraphFetched('model1Relation2.model2Relation1');

        // The ids and props of the inserted models match the rows, which have
        // the right foreign keys and join rows. The rows are matched by their
        // props, since the order of the ids differs between databases.
        const describe = (model1) =>
          model1.model1Relation2
            .map((it) => ({
              idCol: it.idCol,
              model2Prop1: it.model2Prop1,
              related: it.model2Relation1
                .map((m) => ({ id: m.id, model1Prop1: m.model1Prop1 }))
                .sort((a, b) => a.model1Prop1.localeCompare(b.model1Prop1)),
            }))
            .sort((a, b) => a.model2Prop1.localeCompare(b.model2Prop1));

        expect(describe(fetched)).to.eql(describe(root));
        expect(describe(fetched).map((it) => it.related.map((m) => m.model1Prop1))).to.eql([
          ['manyToMany 1.1', 'manyToMany 1.2'],
          ['manyToMany 2.1', 'manyToMany 2.2'],
          ['manyToMany 3.1', 'manyToMany 3.2'],
        ]);
      });

      it('should insert the rows with an id separately from the ones without on MySQL', async () => {
        const root = await Model1.query().insertGraph({
          model1Prop1: 'root',
          model1Relation2: [
            { idCol: 100, model2Prop1: 'with id' },
            { model2Prop1: 'without id' },
            { idCol: 101, model2Prop1: 'with id 2' },
            { model2Prop1: 'without id 2' },
          ],
        });

        const rows = await session.knex('model2').where('model1_id', root.id).orderBy('id_col');
        expect(rows).to.have.length(4);

        const byProp = new Map(rows.map((it) => [it.model2_prop1, it.id_col]));
        for (const model of root.model1Relation2) {
          expect(model.idCol).to.equal(byProp.get(model.model2Prop1));
        }
        expect(byProp.get('with id')).to.equal(100);
        expect(byProp.get('with id 2')).to.equal(101);
      });
    });

    describe('.$relatedQuery().insertGraph()', () => {
      describe('belongs to one relation', () => {
        let parent;

        beforeEach(async () => {
          await session.populate(population);
          parent = await Model1.query().findById(1);
        });

        it('should insert a model with relations and relate it (#216)', async () => {
          const inserted = await parent
            .$relatedQuery('model1Relation1')
            .insertGraph(insertion, { allowRefs: true });

          expect(parent.model1Id).to.equal(inserted.id);
          await check(inserted, true);

          const row = await session.knex('Model1').where('id', 1).first();
          expect(row.model1Id).to.equal(inserted.id);
        });
      });

      describe('has many relation', () => {
        let parent;

        beforeEach(() => {
          return session.populate(population);
        });

        beforeEach(() => {
          return Model1.query()
            .where('id', 1)
            .first()
            .then((par) => {
              parent = par;
            });
        });

        beforeEach(() => {
          insertion = {
            model2Prop1: 'howdy',
            model2Relation1: [insertion],
          };
        });

        it('should insert a model with relations', () => {
          return parent
            .$relatedQuery('model1Relation2')
            .insertGraph(insertion, { allowRefs: true })
            .then((inserted) => {
              return check(inserted.model2Relation1[0], true);
            })
            .then(() => {
              return parent.$relatedQuery('model1Relation2').first();
            })
            .then((insertion) => {
              expect(insertion.model2Prop1).to.equal('howdy');
              return insertion.$relatedQuery('model2Relation1').withGraphFetched(eagerExpr).first();
            })
            .then((model) => {
              return check(model);
            });
        });
      });

      describe('many to many relation', () => {
        let parent;

        beforeEach(() => {
          return session.populate(population);
        });

        beforeEach(() => {
          return Model1.query()
            .where('id', 1)
            .first()
            .then((par) => {
              parent = par;
            });
        });

        beforeEach(() => {
          insertion = {
            model2Prop1: 'howdy',
            model2Relation1: [insertion],
          };
        });

        it('should insert a model with relations', () => {
          return parent
            .$relatedQuery('model1Relation3')
            .insertGraph(insertion, { allowRefs: true })
            .then((inserted) => {
              return check(inserted.model2Relation1[0], true);
            })
            .then(() => {
              return parent.$relatedQuery('model1Relation3');
            })
            .then((models) => {
              const insertion = models.find((it) => it.model2Prop1 === 'howdy');
              return insertion.$relatedQuery('model2Relation1').withGraphFetched(eagerExpr);
            })
            .then((models) => {
              const model = models.find((it) => it.model1Prop1 === 'root');
              return check(model);
            });
        });
      });
    });

    function check(model, shouldCheckHooks) {
      model = model.$clone();
      const knex = model.constructor.knex();

      expect(model).to.have.property('model1Relation1');
      expect(model.model1Relation1).to.have.property('model1Relation3');
      expect(model).to.have.property('model1Relation2');

      model.model1Relation1.model1Relation3 = sortBy(
        model.model1Relation1.model1Relation3,
        'model2Prop1',
      );
      model.model1Relation2 = sortBy(model.model1Relation2, 'model2Prop1');

      expect(model.model1Prop1).to.equal('root');
      shouldCheckHooks && checkHooks(model);

      expect(model.model1Relation1.model1Prop1).to.equal('parent');
      shouldCheckHooks && checkHooks(model.model1Relation1);

      expect(model.model1Relation1Inverse.model1Prop1).to.equal('rootParent');
      shouldCheckHooks && checkHooks(model.model1Relation1Inverse);

      expect(model.model1Relation1.model1Relation3[0].model2Prop1).to.equal('child1');
      shouldCheckHooks && checkHooks(model.model1Relation1.model1Relation3[0]);

      expect(model.model1Relation1.model1Relation3[1].model2Prop1).to.equal('cibling2');
      expect(model.model1Relation1.model1Relation3[1].extra1).to.equal('extraVal1');
      expect(model.model1Relation1.model1Relation3[1].extra2).to.equal('extraVal2');
      expect(model.model1Relation1.model1Relation3[2].idCol).to.equal(1);
      expect(model.model1Relation1.model1Relation3[2].extra1).to.equal('foo');
      shouldCheckHooks && checkHooks(model.model1Relation1.model1Relation3[1]);

      expect(model.model1Relation2[0].model2Prop1).to.equal('child1');
      shouldCheckHooks && checkHooks(model.model1Relation2[0]);

      expect(model.model1Relation2[1].model2Prop1).to.equal('child2');
      shouldCheckHooks && checkHooks(model.model1Relation2[1]);

      expect(model.model1Relation2[1].model2Relation2.model1Prop1).to.equal('child3');
      shouldCheckHooks && checkHooks(model.model1Relation2[1].model2Relation2);

      return knex(Model2.getTableName()).then((rows) => {
        // Check that the reference model was only inserted once.
        expect(rows.filter((it) => it.model2_prop1 === 'child1')).to.have.length(1);
      });
    }

    function checkHooks(model) {
      expect(model.$beforeInsertCalled).to.equal(1);
      expect(model.$afterInsertCalled).to.equal(1);
    }
  });
};
