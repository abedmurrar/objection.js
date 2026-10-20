const _ = require('lodash');
const expect = require('expect.js');
const Promise = require('bluebird');
const { Model, ref, val, raw } = require('../../');

function expectIdsEqual(resultArray, expectedIds) {
  expectArraysEqual(_(resultArray).map('id').sort().value(), expectedIds);
}

function expectArraysEqual(arr1, arr2) {
  expect({ arr: arr1 }).to.eql({ arr: arr2 });
}

module.exports = (session) => {
  // Tests that use postgres-only features, like `returning` or `to_jsonb()`.
  const itPostgres = session.isPostgres() ? it : () => {};

  describe('JSON queries', () => {
    class ModelJson extends Model {
      static get tableName() {
        return 'ModelJson';
      }

      static get jsonSchema() {
        return {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            jsonObject: { type: 'object' },
            jsonArray: { type: 'array' },
          },
        };
      }
    }

    let BoundModel = ModelJson.bindKnex(session.knex);

    before(() => {
      return session.knex.schema
        .dropTableIfExists('ModelJson')
        .createTable('ModelJson', (table) => {
          table.integer('id').primary();
          table.string('name');
          table.jsonb('jsonObject');
          table.jsonb('jsonArray');
        });
    });

    describe('QueryBuilder using ref() in normal query builder methods', () => {
      describe('Querying rows', () => {
        before(() => {
          return BoundModel.query()
            .delete()
            .then(() => {
              return BoundModel.query().insert([
                { id: 1, name: 'test1', jsonObject: {}, jsonArray: [1] },
                { id: 2, name: 'test2', jsonObject: { attr: 2 }, jsonArray: [2] },
                { id: 3, name: 'test3', jsonObject: { attr: 3 }, jsonArray: [3] },
                { id: 4, name: 'test4', jsonObject: { attr: 4 }, jsonArray: [4] },
              ]);
            });
        });

        it('should be able to extract json attr in select(ref)', () => {
          return BoundModel.query()
            .select(ref('jsonArray:[0]').as('foo'))
            .orderBy('foo', 'desc')
            .then((result) => {
              expect(result).to.have.length(4);
              expect(_.first(result)).eql({ foo: 4 });
            });
        });

        it('should be able to extract json attr in select(array)', () => {
          return BoundModel.query()
            .select([ref('jsonObject:attr').castBigInt().as('bar'), ref('jsonArray:[0]').as('foo')])
            .orderBy('foo')
            .then((result) => {
              expect(result).to.have.length(4);
              expect(_.first(result)).eql({ foo: 1, bar: null });
            });
        });

        it('should be able to use ref inside select of select subquery', () => {
          return BoundModel.query()
            .select([
              (builder) => {
                builder
                  .select([ref('name').as('barName')])
                  .from('ModelJson')
                  .orderBy('name', 'desc')
                  .limit(1)
                  .as('foo');
              },
              ref('jsonArray:[0]').as('firstArrayItem'),
            ])
            .orderBy('firstArrayItem', 'desc')
            .then((result) => {
              expect(result).to.have.length(4);
              // foo is always name of the last row of the table (quite a nonsense query)
              expect(_.first(result)).eql({ foo: 'test4', firstArrayItem: 4 });
            });
        });

        it('should be able to use ref with where', () => {
          return BoundModel.query()
            .where(ref('jsonArray:[0]').castBigInt(), ref('jsonObject:attr').castBigInt())
            .then((result) => {
              expect(result).to.have.length(3);
            });
        });

        it('should be able to use ref with where subquery', () => {
          return BoundModel.query()
            .where((builder) => {
              builder.where(ref('jsonArray:[0]').castBigInt(), ref('jsonObject:attr').castBigInt());
            })
            .then((result) => {
              expect(result).to.have.length(3);
            });
        });

        it('should be able to use ref with join', () => {
          // select * from foo join bar on ref() = ref()
          return BoundModel.query()
            .join('ModelJson as t2', ref('ModelJson.jsonArray:[0]'), '=', ref('t2.jsonObject:attr'))
            .select('t2.*')
            .then((result) => {
              expect(result).to.have.length(3);
            });
        });

        it('should be able to use ref with double nested join builder', () => {
          return BoundModel.query()
            .join('ModelJson as t2', (builder) => {
              builder
                .on(ref('ModelJson.jsonArray:[0]'), '=', ref('t2.jsonObject:attr'))
                .on((nestedBuilder) => {
                  nestedBuilder
                    .on(ref('ModelJson.id').castInt(), '=', ref('t2.jsonArray:[0]').castInt())
                    .orOn(ref('ModelJson.id').castInt(), '=', ref('t2.jsonObject:attr').castInt());
                });
            })
            .select('t2.*')
            .then((result) => {
              expect(result).to.have.length(3);
            });
        });

        it('should be able to use ref with orderBy', () => {
          return BoundModel.query()
            .orderBy(ref('jsonObject:attr'), 'desc')
            .then((result) => {
              expect(result).to.have.length(4);
              // null is first on postgres and last on mysql.
              expect(result.map((it) => it.name)).to.eql(
                session.isPostgres()
                  ? ['test1', 'test4', 'test3', 'test2']
                  : ['test4', 'test3', 'test2', 'test1'],
              );
            });
        });

        itPostgres(
          'should be able to use ref with groupBy and having (last argument of having is ref)',
          () => {
            return BoundModel.query()
              .select(['id', ref('jsonObject:attr').as('foo')])
              .groupBy([ref('jsonObject:attr'), 'id'])
              .having('id', '>=', ref('jsonObject:attr').castInt())
              .orderBy('foo')
              .then((result) => {
                expect(result).to.have.length(3);
                expect(_.first(result)).to.eql({ id: 2, foo: 2 });
              });
          },
        );

        itPostgres(
          'should be able to use ref with groupBy and having (also first arg is ref)',
          () => {
            return BoundModel.query()
              .select('id', ref('jsonObject:attr').as('foo'))
              .groupBy([ref('jsonObject:attr'), 'id'])
              .having(ref('id').castInt(), '>=', ref('jsonObject:attr').castInt())
              .orderBy('foo')
              .then((result) => {
                expect(result).to.have.length(3);
                expect(_.first(result)).to.eql({ id: 2, foo: 2 });
              });
          },
        );

        itPostgres('should be able to use ref with groupBy and nested having', () => {
          return BoundModel.query()
            .select(['id', ref('jsonObject:attr').as('foo')])
            .groupBy([ref('jsonObject:attr'), 'id'])
            .having('id', '>=', ref('jsonObject:attr').castInt())
            .having((builder) => {
              builder.having('id', '=', ref('id')).having((nestedBuilder) => {
                nestedBuilder.having('id', '=', ref('id'));
              });
            })
            .orderBy('foo')
            .then((result) => {
              expect(result).to.have.length(3);
              expect(_.first(result)).to.eql({ id: 2, foo: 2 });
            });
        });
      });

      describe('.insert()', () => {
        it('should insert nicely', () => {
          // this query actually isnt valid, but I couldn't figure any query where one would actually use ref as value
          // so just testing that refs are converted to raw correctly
          BoundModel.query().insert({
            id: 5,
            name: ref('jsonArray:[0]').castText(),
            jsonObject: ref('name'),
            jsonArray: [1],
          });
          // I have no idea how to check built result.. toSql() didn't seem to help in this case
        });
      });

      describe('.update() and .patch()', () => {
        beforeEach(() => {
          return BoundModel.query()
            .truncate()
            .then(() => {
              return BoundModel.query().insert([
                { id: 1, name: 'test1', jsonObject: {}, jsonArray: [1] },
                { id: 2, name: 'test2', jsonObject: { attr: 2 }, jsonArray: [2] },
                { id: 3, name: 'test3', jsonObject: { attr: 3 }, jsonArray: [3] },
                { id: 4, name: 'test4', jsonObject: { attr: 4 }, jsonArray: [4] },
              ]);
            });
        });

        itPostgres('should be able to use knex.raw to jsonb column in update', () => {
          return BoundModel.query()
            .update({
              jsonArray: BoundModel.knex().raw('to_jsonb(??)', ['name']),
            })
            .then((result) => {
              expect(result).to.be(4);
            });
        });

        itPostgres(
          'should be able to update internal field of json column and allow ref() syntax',
          () => {
            // should do something like:
            // update 'ModelJson' set
            //   'jsonArray' = jsonb_set('[]', '{0}', to_jsonb('name'), true),
            //   'jsonObject' = jsonb_set('jsonObject', '{attr}', to_jsonb('name'), true),
            //   'name' = 'jsonArray'#>>'{0}' where 'id' = 1 returning *;
            return BoundModel.query()
              .update({
                name: ref('jsonArray:[0]').castText(),
                'jsonObject:attr': ref('name'),
                // each attribute which is updated with ref must be updated separately
                // e.g. SET 'jsonArray' = '[ ref(...), ref(...) ]' just isn't valid SQL
                // (though it could be kind of parsed to multiple jsonb_set calls which would be insanely cool)
                jsonArray: ref('name').castJson(),
              })
              .where('id', 1)
              .returning('*')
              .then((result) => {
                expect(result).to.eql([
                  {
                    id: 1,
                    name: '1',
                    jsonObject: { attr: 'test1' },
                    jsonArray: 'test1',
                  },
                ]);
              });
          },
        );

        itPostgres(
          'should be able to patch internal field of json column and allow ref() syntax',
          () => {
            // same stuff that with patch but different api method
            return BoundModel.query()
              .patch({
                name: ref('jsonArray:[0]').castText(),
                'jsonObject:attr': ref('name'),
                jsonArray: ref('name').castJson(),
              })
              .where('id', 1)
              .returning('*')
              .then((result) => {
                expect(result).to.eql([
                  {
                    id: 1,
                    name: '1',
                    jsonObject: { attr: 'test1' },
                    jsonArray: 'test1',
                  },
                ]);
              });
          },
        );

        it('should be able to patch internal field of json column using an array literal', () => {
          return BoundModel.query()
            .patch({
              'jsonObject:attr': [1, 2, 5, 7],
            })
            .findById(1)
            .then(() => BoundModel.query().findById(1).select('jsonObject'))
            .then((result) => {
              expect(result).to.eql({
                jsonObject: { attr: [1, 2, 5, 7] },
              });
            });
        });

        it('should be able to patch internal field of json column using an object literal', () => {
          return BoundModel.query()
            .patch({
              'IGNOREME.jsonObject:attr': { foo: 'bar' },
            })
            .where('id', 1)
            .then(() => BoundModel.query().findById(1).select('jsonObject'))
            .then((result) => {
              expect(result).to.eql({
                jsonObject: { attr: { foo: 'bar' } },
              });
            });
        });

        it('should be able to patch internal field of json column using a string', () => {
          return BoundModel.query()
            .patch({
              'jsonObject:attr': 'baz',
            })
            .where('id', 2)
            .then(() => BoundModel.query().findById(2).select('jsonObject'))
            .then((result) => {
              expect(result).to.eql({
                jsonObject: { attr: 'baz' },
              });
            });
        });

        it('should be able to patch internal field of json column using a val() instance', () => {
          return BoundModel.query()
            .patch({
              'jsonObject:attr': val('baz').castJson(),
            })
            .where('id', 2)
            .then(() => BoundModel.query().findById(2).select('jsonObject'))
            .then((result) => {
              expect(result).to.eql({
                jsonObject: { attr: 'baz' },
              });
            });
        });

        it('should be able to patch multiple fields inside the same json object', () => {
          return BoundModel.query()
            .patch({
              'jsonObject:attr1': 'foo',
              'jsonObject:attr2': 'bar',
            })
            .where('id', 2)
            .then(() => BoundModel.query().findById(2).select('jsonObject'))
            .then((result) => {
              expect(result).to.eql({
                jsonObject: {
                  attr: 2,
                  attr1: 'foo',
                  attr2: 'bar',
                },
              });
            });
        });

        it('should create the object when patching a field of a NULL column', async () => {
          await BoundModel.knex()('ModelJson')
            .update({ jsonObject: null, jsonArray: null })
            .where('id', 1);
          await BoundModel.query()
            .patch({ 'jsonObject:a': 1, 'jsonObject:b': { c: 'x' }, 'jsonArray:[0]': 'first' })
            .where('id', 1);

          const [row1, row2] = await BoundModel.query().whereIn('id', [1, 2]).orderBy('id');
          expect(row1.jsonObject).to.eql({ a: 1, b: { c: 'x' } });
          expect(row1.jsonArray).to.eql(['first']);
          expect(row2.jsonObject).to.eql({ attr: 2 });
        });

        it('should patch nested fields and array items', async () => {
          await BoundModel.query()
            .patch({ jsonObject: { a: { b: [1, 2] } }, jsonArray: [1, 2, 3] })
            .where('id', 1);
          await BoundModel.query()
            .patch({ 'jsonObject:a.b[1]': true, 'jsonObject:a.c': null, 'jsonArray:[1]': 'two' })
            .where('id', 1);

          const row = await BoundModel.query().findById(1);
          expect(row.jsonObject).to.eql({ a: { b: [1, true], c: null } });
          expect(row.jsonArray).to.eql([1, 'two', 3]);
        });

        it('should cast field values', async () => {
          await BoundModel.query()
            .patch({ jsonObject: { s: 'Abc', n: '12', f: 1.5, t: true, z: false } })
            .where('id', 1);

          const row = await BoundModel.query()
            .select(
              ref('jsonObject:s').as('json'),
              ref('jsonObject:s').castText().as('text'),
              ref('jsonObject:n').castInt().as('int'),
              ref('jsonObject:f').castDecimal().as('decimal'),
              ref('jsonObject:t').castBool().as('t'),
              ref('jsonObject:z').castBool().as('z'),
              ref('jsonObject:missing').castBool().as('missing'),
            )
            .findById(1);

          expect(row.json).to.equal('Abc');
          expect(row.text).to.equal('Abc');
          expect(row.int).to.equal(12);
          expect(Number(row.decimal)).to.equal(1.5);
          expect(Boolean(row.t)).to.equal(true);
          expect(Boolean(row.z)).to.equal(false);
          expect(row.missing).to.equal(null);

          expectIdsEqual(
            await BoundModel.query().whereIn(ref('jsonObject:n').castInt(), [12, 13]),
            [1],
          );
          expectIdsEqual(await BoundModel.query().where(ref('jsonObject:s').castText(), 'Abc'), [
            1,
          ]);
        });

        it('should be able to patch fields using $query().patch()', () => {
          return BoundModel.query()
            .findById(1)
            .then((model) => {
              return model.$query().patch({
                name: 'updated name',
                'jsonObject:attr': 'bar',
              });
            })
            .then(() => {
              return BoundModel.query().findById(1).select('name', 'jsonObject');
            })
            .then((result) => {
              expect(result).to.eql({
                name: 'updated name',
                jsonObject: {
                  attr: 'bar',
                },
              });
            });
        });

        itPostgres('should not have the json reference property in the result object', async () => {
          const item = await BoundModel.query().findById(1);
          await item.$query().patch({ 'jsonObject:attr': 'bar' }).returning('*');
          expect(item).to.eql({
            id: 1,
            name: 'test1',
            jsonObject: { attr: 'bar' },
            jsonArray: [1],
          });
        });
      });
    });

    describe('QueryBuilder JSON queries', () => {
      let complexJsonObj;

      before(() => {
        complexJsonObj = {
          id: 1,
          name: 'complex line',
          jsonObject: {
            stringField: 'string in jsonObject.stringField',
            numberField: 1.5,
            nullField: null,
            booleanField: false,
            arrayField: [
              { noMoreLevels: true },
              1,
              true,
              null,
              'string in jsonObject.arrayField[4]',
            ],
            objectField: {
              object: 'string in jsonObject.objectField.object',
            },
          },
          jsonArray: [
            {
              stringField: 'string in jsonArray[0].stringField',
              numberField: 5.5,
              nullField: null,
              booleanField: true,
              arrayField: [{ noMoreLevels: true }],
              objectField: {
                object: `I'm string in jsonArray[0].objectField.object`,
              },
            },
            null,
            1,
            'string in jsonArray[3]',
            false,
            [{ noMoreLevels: true }, null, 1, 'string in jsonArray[5][3]', true],
          ],
        };

        complexJsonObj.jsonObject.jsonArray = _.cloneDeep(complexJsonObj.jsonArray);

        return BoundModel.query()
          .delete()
          .then(() => {
            return Promise.all([
              BoundModel.query().insert(complexJsonObj),
              BoundModel.query().insert({
                id: 2,
                name: 'empty object and array',
                jsonObject: {},
                jsonArray: [],
              }),
              BoundModel.query().insert({ id: 3, name: 'null object and array' }),
              BoundModel.query().insert({
                id: 4,
                name: 'empty object and [1,2]',
                jsonObject: {},
                jsonArray: [1, 2],
              }),
              BoundModel.query().insert({
                id: 5,
                name: 'empty object and array [ null ]',
                jsonObject: {},
                jsonArray: [null],
              }),
              BoundModel.query().insert({
                id: 6,
                name: '{a: 1} and empty array',
                jsonObject: { a: 1 },
                jsonArray: [],
              }),
              BoundModel.query().insert({
                id: 7,
                name: '{a: {1:1, 2:2}, b:{2:2, 1:1}} for equality comparisons',
                jsonObject: { a: { 1: 1, 2: 2 }, b: { 2: 2, 1: 1 } },
                jsonArray: [],
              }),
            ]);
          });
      });

      it('should have test data', () => {
        return BoundModel.query().then((all) => {
          expect(_.find(all, { name: 'complex line' }).jsonObject.stringField).to.be(
            complexJsonObj.jsonObject.stringField,
          );
        });
      });

      describe('private function parseFieldExpression(expression, extractAsText)', () => {
        itPostgres('should quote ModelJson.jsonArray column reference properly', () => {
          expect(
            BoundModel.query().whereJsonIsArray('ModelJson.jsonArray').toKnexQuery().toString(),
          ).to.contain('"ModelJson"."jsonArray"');
        });

        itPostgres('should quote ModelJson.jsonArray:[10] column reference properly', () => {
          expect(
            BoundModel.query()
              .whereJsonIsArray('ModelJson.jsonArray:[50]')
              .toKnexQuery()
              .toString(),
          ).to.contain('"ModelJson"."jsonArray"');
        });
      });

      describe('.where(ref(fieldExpr), val(<array|object|string>))', () => {
        it('should find results for jsonArray == []', () => {
          return BoundModel.query()
            .where('jsonArray', val([]).castJson())
            .then((results) => {
              expectIdsEqual(results, [2, 6, 7]);
            });
        });

        it('should find results for jsonArray != []', () => {
          return BoundModel.query()
            .where('jsonArray', '!=', val([]))
            .then((results) => {
              expectIdsEqual(results, [1, 4, 5]);
            });
        });

        it('should find results for jsonObject == {}', () => {
          return BoundModel.query()
            .where('jsonObject', val({}))
            .then((results) => {
              expectIdsEqual(results, [2, 4, 5]);
            });
        });

        it('should not find results for jsonArray == {}', () => {
          return BoundModel.query()
            .where('jsonArray', val({}))
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should not find results for jsonObject == []', () => {
          return BoundModel.query()
            .where('jsonObject', val([]))
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should find result for jsonObject == {a: 1}', () => {
          return BoundModel.query()
            .where('jsonObject', val({ a: 1 }))
            .then((results) => {
              expectIdsEqual(results, [6]);
            });
        });

        it('should find result for jsonObject.a == jsonObject[b]', () => {
          return BoundModel.query()
            .where(ref('jsonObject:a'), ref('jsonObject:[b]'))
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should find result where keys are in different order jsonObject.a == {2:2, 1:1}', () => {
          return BoundModel.query()
            .where(ref('jsonObject:a'), val({ 2: 2, 1: 1 }))
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should not find result with wrong type as value jsonObject == {a: "1"}', () => {
          return BoundModel.query()
            .where('jsonObject', val({ a: '1' }))
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should find results jsonArray[0].arrayField[0] == { noMoreLevels: true }', () => {
          return BoundModel.query()
            .where(ref('jsonArray:[0].arrayField[0]'), val({ noMoreLevels: true }))
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should not find results jsonArray[0].arrayField[0] == { noMoreLevels: false }', () => {
          return BoundModel.query()
            .where(ref('jsonArray:[0].arrayField[0]'), val({ noMoreLevels: false }))
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should find result with jsonArray == [ null ]', () => {
          return BoundModel.query()
            .where('jsonArray', val([null]))
            .then((results) => {
              expectIdsEqual(results, [5]);
            });
        });

        it('should find results with jsonArray == complexJsonObj.jsonArray', () => {
          return BoundModel.query()
            .where('jsonArray', val(complexJsonObj.jsonArray))
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should find results with jsonObject,jsonArray == complexJsonObj.jsonArray', () => {
          return BoundModel.query()
            .where(ref('jsonObject:jsonArray'), val(complexJsonObj.jsonArray))
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should not find results jsonArray == [2,1]', () => {
          return BoundModel.query()
            .where('jsonArray', val([2, 1]))
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should find results jsonArray == [1,2]', () => {
          return BoundModel.query()
            .where('jsonArray', val([1, 2]))
            .then((results) => {
              expectIdsEqual(results, [4]);
            });
        });

        it('should find results jsonArray == [2,1] OR jsonArray == [1,2]', () => {
          return BoundModel.query()
            .where('jsonArray', val([1, 2]))
            .orWhere('jsonArray', val([2, 1]))
            .then((results) => {
              expectIdsEqual(results, [4]);
            });
        });

        it('should find results jsonArray == [1,2] OR jsonArray != [1,2]', () => {
          return BoundModel.query()
            .where('jsonArray', val([1, 2]))
            .orWhere('jsonArray', '!=', val([2, 1]))
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should not find results jsonObject.a != jsonObject.b', () => {
          return BoundModel.query()
            .whereNot(ref('jsonObject:a'), ref('jsonObject:b'))
            .then((results) => {
              expectIdsEqual(results, []);
            });
        });

        it('should find all rows with jsonObject.a = jsonObject.b OR jsonObject.a != jsonObject.b', () => {
          return BoundModel.query()
            .where(ref('jsonObject:a'), ref('jsonObject:b'))
            .orWhere(ref('jsonObject:a'), '!=', ref('jsonObject:b'))
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should find results jsonObject != jsonArray', () => {
          return BoundModel.query()
            .whereNot(ref('jsonObject'), ref('jsonArray'))
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });
      });

      describe('.whereJsonSupersetOf(fieldExpr, <array|object|string>)', () => {
        it('should find all empty arrays with jsonArray @> []', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonArray', [])
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        itPostgres('should find all empty arrays with jsonArray @> []', () => {
          return BoundModel.query()
            .where('jsonArray', '@>', val([]))
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should find results jsonArray @> [1,2] (set is its own superset)', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonArray', [1, 2])
            .then((results) => {
              expectIdsEqual(results, [4]);
            });
        });

        itPostgres('should find results jsonArray @> [1,2] (set is its own superset)', () => {
          return BoundModel.query()
            .where('jsonArray', '@>', val([1, 2]))
            .then((results) => {
              expectIdsEqual(results, [4]);
            });
        });

        it('should not find results jsonArray @> {}', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonArray', {})
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        itPostgres('should not find results jsonArray @> {}', () => {
          return BoundModel.query()
            .where('jsonArray', '@>', val({}))
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should not find results jsonObject @> []', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonObject', [])
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        itPostgres('should not find results jsonObject @> []', () => {
          return BoundModel.query()
            .where('jsonObject', '@>', val([]))
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should find subset where both sides are references', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonObject:a', 'jsonObject:b')
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        itPostgres('should find subset where both sides are references', () => {
          return BoundModel.query()
            .where(ref('jsonObject:a').castJson(), '@>', ref('jsonObject:b').castJson())
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should find results jsonObject @> {}', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonObject', {})
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        itPostgres('should find results jsonObject @> {}', () => {
          return BoundModel.query()
            .where('jsonObject', '@>', val({}))
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should find results jsonObject.objectField @> complexJsonObj.jsonObject.objectField', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonObject:objectField', complexJsonObj.jsonObject.objectField)
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        itPostgres(
          'should find results jsonObject.objectField @> complexJsonObj.jsonObject.objectField',
          () => {
            return BoundModel.query()
              .where(
                ref('jsonObject:objectField'),
                '@>',
                val(complexJsonObj.jsonObject.objectField),
              )
              .then((results) => {
                expectIdsEqual(results, [1]);
              });
          },
        );

        it('should not find results jsonObject.objectField @> complexJsonObj.jsonObject.objectField that has additional key', () => {
          let obj = _.cloneDeep(complexJsonObj.jsonObject.objectField);
          obj.otherKey = 'Im here too!';

          return BoundModel.query()
            .whereJsonSupersetOf('jsonObject:objectField', obj)
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        itPostgres(
          'should not find results jsonObject.objectField @> complexJsonObj.jsonObject.objectField that has additional key',
          () => {
            let obj = _.cloneDeep(complexJsonObj.jsonObject.objectField);
            obj.otherKey = 'Im here too!';

            return BoundModel.query()
              .where(ref('jsonObject:objectField'), '@>', val(obj))
              .then((results) => {
                expect(results).to.have.length(0);
              });
          },
        );

        it('should not find results jsonObject.objectField @> { object: "other string" }', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonObject:objectField', {
              object: 'something else',
            })
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        itPostgres(
          'should not find results jsonObject.objectField @> { object: "other string" }',
          () => {
            return BoundModel.query()
              .where(
                ref('jsonObject:objectField'),
                '@>',
                val({
                  object: 'something else',
                }),
              )
              .then((results) => {
                expect(results).to.have.length(0);
              });
          },
        );

        it('should find results jsonObject @> [] OR jsonObject @> {}', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonObject', [])
            .orWhereJsonSupersetOf('jsonObject', {})
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        itPostgres('should find results jsonObject @> [] OR jsonObject @> {}', () => {
          return BoundModel.query()
            .where('jsonObject', '@>', val([]))
            .orWhere('jsonObject', '@>', val({}))
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should not find results NOT(jsonObject.objectField @> complexJsonObj.jsonObject.objectField)', () => {
          return BoundModel.query()
            .whereJsonNotSupersetOf('jsonObject:objectField', complexJsonObj.jsonObject.objectField)
            .then((results) => {
              expectIdsEqual(results, []);
            });
        });

        itPostgres(
          'should not find results NOT(jsonObject.objectField @> complexJsonObj.jsonObject.objectField)',
          () => {
            return BoundModel.query()
              .whereNot(
                ref('jsonObject:objectField'),
                '@>',
                val(complexJsonObj.jsonObject.objectField),
              )
              .then((results) => {
                expectIdsEqual(results, []);
              });
          },
        );

        it('should not find results NOT(jsonObject.a @> jsonObject.b)', () => {
          return BoundModel.query()
            .whereJsonNotSupersetOf('jsonObject:a', 'jsonObject:b')
            .then((results) => {
              expectIdsEqual(results, []);
            });
        });

        itPostgres('should not find results NOT(jsonObject.a @> jsonObject.b)', () => {
          return BoundModel.query()
            .whereNot(ref('jsonObject:a').castJson(), '@>', ref('jsonObject:b').castJson())
            .then((results) => {
              expectIdsEqual(results, []);
            });
        });

        it('should find results jsonObject.a @> jsonObject.b OR NOT(jsonObject.a @> jsonObject.b)', () => {
          return BoundModel.query()
            .whereJsonSupersetOf('jsonObject:a', 'jsonObject:b')
            .orWhereJsonNotSupersetOf('jsonObject:a', 'jsonObject:b')
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        itPostgres(
          'should find results jsonObject.a @> jsonObject.b OR NOT(jsonObject.a @> jsonObject.b)',
          () => {
            return BoundModel.query()
              .where(ref('jsonObject:a').castJson(), '@>', ref('jsonObject:b').castJson())
              .orWhereNot(ref('jsonObject:a').castJson(), '@>', ref('jsonObject:b').castJson())
              .then((results) => {
                expectIdsEqual(results, [7]);
              });
          },
        );

        it('should not find results NOT(jsonObject.x @> jsonObject.y)', () => {
          return BoundModel.query()
            .whereJsonNotSupersetOf('jsonObject:x', 'jsonObject:y')
            .then((results) => {
              expectIdsEqual(results, []);
            });
        });

        itPostgres('should not find results NOT(jsonObject.x @> jsonObject.y)', () => {
          return BoundModel.query()
            .whereNot(ref('jsonObject:x').castJson(), '@>', ref('jsonObject:y').castJson())
            .then((results) => {
              expectIdsEqual(results, []);
            });
        });

        itPostgres('should find results jsonArray = {} or NOT(jsonObject @> jsonArray)', () => {
          return BoundModel.query()
            .where('jsonArray', '=', val({}))
            .orWhereNot('jsonObject', '@>', ref('jsonArray'))
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should get skipped if value is undefined and skipUndefined() is called', () => {
          return BoundModel.query()
            .skipUndefined()
            .orWhereJsonSupersetOf('jsonObject', undefined)
            .then((results) => {
              expect(results.length).to.equal(7);
            });
        });
      });

      describe('.whereJsonSubsetOf(fieldExpr, <array|object|string>)', () => {
        it('should find all empty arrays with jsonArray <@ []', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonArray', [])
            .then((results) => {
              expectIdsEqual(results, [2, 6, 7]);
            });
        });

        it('should find results jsonArray <@ [1,2] (set is its own subset)', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonArray', [1, 2])
            .then((results) => {
              expectIdsEqual(results, [2, 4, 6, 7]);
            });
        });

        it('should not find results jsonArray <@ {}', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonArray', {})
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        itPostgres('should not find results jsonArray <@ {}', () => {
          return BoundModel.query()
            .where('jsonArray', '<@', val({}))
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should not find results jsonObject <@ []', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonObject', [])
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        itPostgres('should not find results jsonObject <@ []', () => {
          return BoundModel.query()
            .where('jsonObject', '<@', val([]))
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should find subset where both sides are references', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonObject:a', 'jsonObject:b')
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        itPostgres('should find subset where both sides are references', () => {
          return BoundModel.query()
            .where(ref('jsonObject:a').castJson(), '<@', ref('jsonObject:b').castJson())
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should find results jsonObject <@ {}', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonObject', {})
            .then((results) => {
              expectIdsEqual(results, [2, 4, 5]);
            });
        });

        itPostgres('should find results jsonObject <@ {}', () => {
          return BoundModel.query()
            .where('jsonObject', '<@', val({}))
            .then((results) => {
              expectIdsEqual(results, [2, 4, 5]);
            });
        });

        it('should find results jsonObject.objectField <@ complexJsonObj.jsonObject.objectField', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonObject:objectField', complexJsonObj.jsonObject.objectField)
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        itPostgres(
          'should find results jsonObject.objectField <@ complexJsonObj.jsonObject.objectField',
          () => {
            return BoundModel.query()
              .where(
                ref('jsonObject:objectField'),
                '<@',
                val(complexJsonObj.jsonObject.objectField),
              )
              .then((results) => {
                expectIdsEqual(results, [1]);
              });
          },
        );

        it('should find results jsonObject.objectField <@ complexJsonObj.jsonObject.objectField that has additional key', () => {
          let obj = _.cloneDeep(complexJsonObj.jsonObject.objectField);
          obj.otherKey = 'Im here too!';

          return BoundModel.query()
            .whereJsonSubsetOf('jsonObject:objectField', obj)
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        itPostgres(
          'should find results jsonObject.objectField <@ complexJsonObj.jsonObject.objectField that has additional key',
          () => {
            let obj = _.cloneDeep(complexJsonObj.jsonObject.objectField);
            obj.otherKey = 'Im here too!';

            return BoundModel.query()
              .where(ref('jsonObject:objectField'), '<@', val(obj))
              .then((results) => {
                expectIdsEqual(results, [1]);
              });
          },
        );

        it('should not find results jsonObject.objectField <@ { object: "other string" }', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonObject:objectField', {
              object: 'something else',
            })
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        itPostgres(
          'should not find results jsonObject.objectField <@ { object: "other string" }',
          () => {
            return BoundModel.query()
              .where(
                ref('jsonObject:objectField'),
                '<@',
                val({
                  object: 'something else',
                }),
              )
              .then((results) => {
                expect(results).to.have.length(0);
              });
          },
        );

        it('should find results jsonObject <@ {} OR jsonArray <@ []', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonObject', {})
            .orWhereJsonSubsetOf('jsonArray', [])
            .then((results) => {
              expectIdsEqual(results, [2, 4, 5, 6, 7]);
            });
        });

        itPostgres('should find results jsonObject <@ {} OR jsonArray <@ []', () => {
          return BoundModel.query()
            .where('jsonObject', '<@', val({}))
            .orWhere('jsonArray', '<@', val([]))
            .then((results) => {
              expectIdsEqual(results, [2, 4, 5, 6, 7]);
            });
        });

        it('should find results NOT(jsonObject.a <@ jsonObject.b)', () => {
          return BoundModel.query()
            .whereJsonNotSubsetOf('jsonObject:a', 'jsonObject:b')
            .then((results) => {
              expectIdsEqual(results, []);
            });
        });

        itPostgres('should find results NOT(jsonObject.a <@ jsonObject.b)', () => {
          return BoundModel.query()
            .whereNot(ref('jsonObject:a').castJson(), '<@', ref('jsonObject:b').castJson())
            .then((results) => {
              expectIdsEqual(results, []);
            });
        });

        it('should find results jsonObject.a <@ jsonObject.b OR NOT(jsonObject.a <@ jsonObject.b)', () => {
          return BoundModel.query()
            .whereJsonSubsetOf('jsonObject:a', 'jsonObject:b')
            .orWhereJsonNotSubsetOf('jsonObject:a', 'jsonObject:b')
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        itPostgres(
          'should find results jsonObject.a <@ jsonObject.b OR NOT(jsonObject.a <@ jsonObject.b)',
          () => {
            return BoundModel.query()
              .where(ref('jsonObject:a').castJson(), '<@', ref('jsonObject:b').castJson())
              .orWhereNot(ref('jsonObject:a').castJson(), '<@', ref('jsonObject:b').castJson())
              .then((results) => {
                expectIdsEqual(results, [7]);
              });
          },
        );
      });

      describe('.whereJsonIsArray(fieldExpr)', () => {
        it('should find all arrays that has an array in index 5', () => {
          return BoundModel.query()
            .whereJsonIsArray('jsonArray:[5]')
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should find no arrays from object type of field arrays', () => {
          return BoundModel.query()
            .whereJsonIsArray('jsonObject:objectField')
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should find objects with orWhereJsonIsArray', () => {
          return BoundModel.query()
            .whereJsonIsArray('jsonObject')
            .orWhereJsonIsArray('jsonArray')
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should add parenthesis for find arrays with whereJsonNotArray()', () => {
          return BoundModel.query()
            .whereJsonNotArray('jsonObject')
            .whereJsonIsObject('jsonObject')
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should add parenthesis for find arrays with orWhereJsonNotArray()', () => {
          return BoundModel.query()
            .whereJsonIsObject('jsonArray')
            .orWhereJsonNotArray('jsonObject')
            .whereJsonIsObject('jsonObject')
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should find all rows with orWhereJsonNotArray(jsonObject)', () => {
          return BoundModel.query()
            .whereJsonIsObject('jsonArray')
            .orWhereJsonNotArray('jsonObject')
            .then((results) => {
              expectIdsEqual(results, [1, 2, 3, 4, 5, 6, 7]);
            });
        });
      });

      describe('.whereJsonIsObject(fieldExpr)', () => {
        it('should find first object', () => {
          return BoundModel.query()
            .whereJsonIsObject('jsonObject:objectField')
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should find nothing for array field', () => {
          return BoundModel.query()
            .whereJsonIsObject('jsonObject:arrayField')
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should find nothing for non existing field', () => {
          return BoundModel.query()
            .whereJsonIsObject('jsonObject:arrayField.imNot')
            .then((results) => {
              expect(results).to.have.length(0);
            });
        });

        it('should find objects with orWhereJsonIsObject', () => {
          return BoundModel.query()
            .whereJsonIsObject('jsonArray')
            .orWhereJsonIsObject('jsonObject:objectField')
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should add parenthesis for find objects with whereJsonNotObject(jsonArray)', () => {
          return BoundModel.query()
            .whereJsonNotObject('jsonArray')
            .whereJsonIsArray('jsonArray')
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should add parenthesis for find objects with orWhereJsonNotObject(jsonArray)', () => {
          return BoundModel.query()
            .whereJsonIsArray('jsonObject')
            .orWhereJsonNotObject('jsonArray')
            .whereJsonIsArray('jsonArray')
            .then((results) => {
              expectIdsEqual(results, [1, 2, 4, 5, 6, 7]);
            });
        });

        it('should find all rows with orWhereJsonNotObject(jsonArray)', () => {
          return BoundModel.query()
            .whereJsonIsArray('jsonObject')
            .orWhereJsonNotObject('jsonArray')
            .then((results) => {
              expectIdsEqual(results, [1, 2, 3, 4, 5, 6, 7]);
            });
        });
      });

      describe('.whereJsonHasAny(fieldExpr, keys) and .whereJsonHasAll(fieldExpr, keys)', () => {
        it('should throw error if null in input array', (done) => {
          BoundModel.query()
            .whereJsonHasAny('jsonObject', [null])
            .then(() => {
              done(new Error('should not get here'));
            })
            .catch((err) => {
              done();
            })
            .catch(done);
        });

        it('should throw error if number in input array', (done) => {
          BoundModel.query()
            .whereJsonHasAny('jsonObject', 1)
            .then(() => {
              done(new Error('should not get here'));
            })
            .catch((err) => {
              done();
            })
            .catch(done);
        });

        it('should throw error if boolean in input array', (done) => {
          BoundModel.query()
            .whereJsonHasAny('jsonObject', false)
            .then(() => {
              done(new Error('should not get here'));
            })
            .catch((err) => {
              done();
            })
            .catch(done);
        });

        it('should find results for a', () => {
          return BoundModel.query()
            .whereJsonHasAny('jsonObject', 'a')
            .then((results) => {
              expectIdsEqual(results, [6, 7]);
            });
        });

        itPostgres('should find results for a', () => {
          // TODO knex doesn't support ?| operator.
          return BoundModel.query()
            .where(raw('?? \\?| ?', ['jsonObject', val('a').asArray()]))
            .then((results) => {
              expectIdsEqual(results, [6, 7]);
            });
        });

        it('should find results for a or b', () => {
          return BoundModel.query()
            .whereJsonHasAny('jsonObject', 'b')
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should find results for b or notMe', () => {
          return BoundModel.query()
            .whereJsonHasAny('jsonObject', ['b', 'notMe'])
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should find results for hasAny(notMe) orHasAny(b)', () => {
          return BoundModel.query()
            .whereJsonHasAny('jsonObject', 'notMe')
            .orWhereJsonHasAny('jsonObject', 'b')
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should find results for a and b', () => {
          return BoundModel.query()
            .whereJsonHasAll('jsonObject', ['a', 'b'])
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        itPostgres('should find results for a and b', () => {
          // TODO knex doesn't support ?& operator.
          return BoundModel.query()
            .where(raw('?? \\?& ?', ['jsonObject', val(['a', 'b']).asArray()]))
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should find results for hasAll(notMe) orHasAll([a, b])', () => {
          return BoundModel.query()
            .whereJsonHasAll('jsonObject', 'notMe')
            .orWhereJsonHasAll('jsonObject', ['a', 'b'])
            .then((results) => {
              expectIdsEqual(results, [7]);
            });
        });

        it('should find results for string in array "string in jsonArray[3]"', () => {
          return BoundModel.query()
            .whereJsonHasAny('jsonArray', 'string in jsonArray[3]')
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should work with range', () => {
          return BoundModel.query()
            .range(0, 1)
            .whereJsonHasAny('jsonObject:b', '2')
            .then((result) => {
              expect(result.results).to.have.length(1);
              expect(result.total).to.equal(1);
              expect(result.results[0].id).to.equal(7);
            });
        });
      });

      describe('.where(fieldExpr, operator, value)', () => {
        it('should be able to find numbers with >', () => {
          return BoundModel.query()
            .where(ref('jsonObject:numberField'), '>', 1.4)
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should be able to find numbers with >', () => {
          return BoundModel.query()
            .where(ref('jsonObject:numberField').castFloat(), '>', val(1.4).castFloat())
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should not find where 1.5 < 1.5', () => {
          return BoundModel.query()
            .where(ref('jsonObject:numberField'), '<', 1.5)
            .then((results) => {
              expectIdsEqual(results, []);
            });
        });

        it('should be able to find strings with =', () => {
          return BoundModel.query()
            .where(
              ref('jsonObject:stringField').castText(),
              '=',
              'string in jsonObject.stringField',
            )
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should be able to find strings with =', () => {
          return BoundModel.query()
            .where(
              ref('jsonObject:stringField').castText(),
              '=',
              val('string in jsonObject.stringField').castText(),
            )
            .then((results) => {
              expectIdsEqual(results, [1]);
            });
        });

        it('should be able to find every but first row where booleanField equals true or is NULL', () => {
          return BoundModel.query()
            .where(ref('jsonObject:booleanField'), '=', true)
            .orWhere(ref('jsonObject:booleanField'), 'IS', null)
            .then((results) => {
              expectIdsEqual(results, [2, 3, 4, 5, 6, 7]);
            });
        });

        it('should be able to find every but first row where booleanField equals true or is NULL', () => {
          return BoundModel.query()
            .where(ref('jsonObject:booleanField').castBool(), '=', val(true).castBool())
            .orWhere(ref('jsonObject:booleanField'), 'IS', null)
            .then((results) => {
              expectIdsEqual(results, [2, 3, 4, 5, 6, 7]);
            });
        });
      });
    });

    describe('JSON semantics that differ between MySQL and postgres', () => {
      beforeEach(async () => {
        await BoundModel.query().delete();
        await BoundModel.query().insert([
          {
            id: 1,
            name: 'objects in array',
            jsonObject: { tags: ['a', 'b'] },
            jsonArray: [{ a: 1 }],
          },
          { id: 2, name: 'strings', jsonObject: { tags: ['c'] }, jsonArray: ['a', 'x'] },
          { id: 3, name: 'string', jsonObject: { tags: 'a' }, jsonArray: [] },
          { id: 4, name: 'missing', jsonObject: {} },
        ]);
      });

      it('an object should only be contained in an object', async () => {
        expectIdsEqual(await BoundModel.query().whereJsonSupersetOf('jsonArray', { a: 1 }), []);
        expectIdsEqual(await BoundModel.query().whereJsonSupersetOf('jsonArray', [{ a: 1 }]), [1]);
        expectIdsEqual(await BoundModel.query().whereJsonIsObject('jsonArray'), []);
        expectIdsEqual(await BoundModel.query().whereJsonNotObject('jsonArray'), [1, 2, 3, 4]);
      });

      it('whereJsonHasAny should look in keys, string items and strings', async () => {
        expectIdsEqual(await BoundModel.query().whereJsonHasAny('jsonArray', ['a']), [2]);
        expectIdsEqual(await BoundModel.query().whereJsonHasAny('jsonObject:tags', ['a']), [1, 3]);
        expectIdsEqual(await BoundModel.query().whereJsonHasAll('jsonObject:tags', ['a', 'b']), [
          1,
        ]);
        expectIdsEqual(await BoundModel.query().whereJsonHasAny('jsonObject', ['tags']), [1, 2, 3]);
      });

      if (session.isMySql()) {
        it('whereJsonOverlaps', async () => {
          expectIdsEqual(
            await BoundModel.query().whereJsonOverlaps('jsonObject:tags', ['b', 'c']),
            [1, 2],
          );
          expectIdsEqual(
            await BoundModel.query()
              .whereJsonOverlaps('jsonObject:tags', ['b'])
              .orWhereJsonOverlaps('jsonArray', ['x']),
            [1, 2],
          );
        });

        it('whereJsonNotOverlaps should find NULL and missing fields', async () => {
          expectIdsEqual(
            await BoundModel.query().whereJsonNotOverlaps('jsonObject:tags', ['a']),
            [2, 4],
          );
          expectIdsEqual(
            await BoundModel.query().whereJsonNotOverlaps('jsonArray', ['a']),
            [1, 3, 4],
          );
        });
      } else {
        it('whereJsonOverlaps should throw', async () => {
          const err = await BoundModel.query()
            .whereJsonOverlaps('jsonArray', ['a'])
            .catch((err) => err);

          expect(err.message).to.equal('whereJsonOverlaps is only supported on mysql.');
        });
      }
    });

    describe('special characters in field expression keys', () => {
      const keys = [
        "x') or 1=1 --",
        "x'}'; drop table ModelJson; --",
        'a?b',
        '??',
        '\\?',
        'a\\b',
        'a"b',
        'a,b',
        '{}',
        'a b',
        'NULL',
        'a\nb',
      ];

      // Keys with a double quote need to be written using single quotes.
      const keyExpr = (key) => (key.includes('"') ? `['${key}']` : `["${key}"]`);

      beforeEach(async () => {
        await BoundModel.query().delete();
        await BoundModel.query().insert([
          {
            id: 1,
            name: 'has keys',
            jsonObject: Object.fromEntries(keys.map((key, i) => [key, { n: i }])),
          },
          { id: 2, name: 'other', jsonObject: { other: { n: -1 } } },
        ]);
      });

      keys.forEach((key, i) => {
        describe(JSON.stringify(key), () => {
          const expr = `jsonObject:${keyExpr(key)}`;

          it('select(ref)', async () => {
            const rows = await BoundModel.query()
              .select(ref(expr).as('value'), ref(`${expr}.n`).castInt().as('n'))
              .orderBy('id');

            expect(rows).to.eql([
              { value: { n: i }, n: i },
              { value: null, n: null },
            ]);
          });

          it('where(ref)', async () => {
            expectIdsEqual(await BoundModel.query().where(ref(`${expr}.n`).castInt(), i), [1]);
            expectIdsEqual(await BoundModel.query().whereNotNull(ref(expr)), [1]);
          });

          it('whereJson* methods', async () => {
            expectIdsEqual(await BoundModel.query().whereJsonIsObject(expr), [1]);
            expectIdsEqual(await BoundModel.query().whereJsonNotObject(expr), [2]);
            expectIdsEqual(await BoundModel.query().whereJsonSupersetOf(expr, { n: i }), [1]);
            expectIdsEqual(await BoundModel.query().whereJsonSubsetOf(expr, { n: i, x: 1 }), [1]);
            expectIdsEqual(await BoundModel.query().where(ref(`${expr}.n`), '=', i), [1]);
          });

          it('whereJsonHasAny and whereJsonHasAll with the key as a value', async () => {
            expectIdsEqual(await BoundModel.query().whereJsonHasAny('jsonObject', key), [1]);
            expectIdsEqual(await BoundModel.query().whereJsonHasAll('jsonObject', [key, 'a?b']), [
              1,
            ]);
          });

          it('patch', async () => {
            const numUpdated = await BoundModel.query()
              .patch({ [`${expr}.n`]: 100 })
              .where('id', 1);

            expect(numUpdated).to.equal(1);

            const [row1, row2] = await BoundModel.query().orderBy('id');
            expect(row1.jsonObject[key]).to.eql({ n: 100 });

            keys
              .filter((other) => other !== key)
              .forEach((other) => {
                expect(row1.jsonObject[other]).to.eql({ n: keys.indexOf(other) });
              });

            expect(row2.jsonObject).to.eql({ other: { n: -1 } });
          });
        });
      });

      itPostgres('works with standard_conforming_strings = off', async () => {
        await session.knex.transaction(async (trx) => {
          await trx.raw('SET LOCAL standard_conforming_strings = off');

          const rows = await BoundModel.query(trx)
            .select(ref(`jsonObject:${keyExpr('a\\b')}.n`).as('n'))
            .where(ref(`jsonObject:${keyExpr("x') or 1=1 --")}.n`).castInt(), 0);

          expect(rows).to.eql([{ n: keys.indexOf('a\\b') }]);
        });
      });
    });
  });
};
