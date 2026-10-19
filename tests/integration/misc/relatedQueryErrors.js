const { expect } = require('chai');
const { Model } = require('../../../');

module.exports = (session) => {
  describe('model relatedQueries fail when they lack a proper target', () => {
    let knex = session.knex;

    class Post extends Model {
      static get tableName() {
        return 'posts';
      }
    }

    class User extends Model {
      static get tableName() {
        return 'users';
      }
      static get relationMappings() {
        return {
          posts: {
            modelClass: Post,
            relation: Model.HasManyRelation,
            join: {
              from: 'users.id',
              to: 'posts.user_id',
            },
          },
        };
      }
    }

    before(async () => {
      const knex = session.knex;

      await knex.schema.dropTableIfExists('posts');
      await knex.schema.dropTableIfExists('users');

      await knex.schema
        .createTable('users', (table) => {
          table.increments('id').primary();
          table.string('name');
        })
        .createTable('posts', (table) => {
          table.increments('id').primary();
          table.integer('user_id').unsigned().references('id').inTable('users');
          table.string('content');
        });
    });

    after(async () => {
      await knex.schema.dropTableIfExists('posts');
      await knex.schema.dropTableIfExists('users');
    });

    it('relatedQuery insert does not silently fail when ommiting `for` a target', async () => {
      let error = null;

      try {
        await User.relatedQuery('posts', knex).insert({ content: 'my post content' });
      } catch (e) {
        error = e;
      }

      expect(error.message).to.equal('relatedQuery(): for() must be called before insert()');
      expect(await knex('posts')).to.have.length(0);
    });
    describe('for() outside relatedQuery()', () => {
      beforeEach(async () => {
        await knex('posts').delete();
        await knex('users').delete();
        await knex('users').insert([
          { id: 1, name: 'a' },
          { id: 2, name: 'b' },
        ]);
        await knex('posts').insert([
          { id: 1, user_id: 1, content: 'a' },
          { id: 2, user_id: 2, content: 'b' },
        ]);
      });

      for (const [name, query] of [
        ['delete', () => Post.query(knex).for(1).delete()],
        ['patch', () => Post.query(knex).for(1).patch({ content: 'changed' })],
        ['delete (for() after)', () => Post.query(knex).delete().for(1)],
      ]) {
        it(`should reject ${name} without touching any rows`, async () => {
          let error = null;

          try {
            await query();
          } catch (e) {
            error = e;
          }

          expect(error.message).to.equal(
            'for() can only be used with queries created using the static relatedQuery() method',
          );

          const posts = await knex('posts').orderBy('id');
          expect(posts.map((it) => it.content)).to.eql(['a', 'b']);
        });
      }

      it('relatedQuery().for().delete() should only delete the related rows', async () => {
        await User.relatedQuery('posts', knex).for(1).delete();

        const posts = await knex('posts').orderBy('id');
        expect(posts.map((it) => it.content)).to.eql(['b']);
      });
    });

    it('relatedQuery where fails when `for` is ommited and is not a subquery', async () => {
      try {
        await User.relatedQuery('posts', knex).where({ content: 'my post content' });
      } catch (e) {
        expect(e.message).to.equal(
          'query method `for` ommitted outside a subquery, can not figure out relation target',
        );
      }
    });
  });
};
