'use strict';

/* global BigInt */

const { QueryBuilderOperation } = require('./QueryBuilderOperation');
const { StaticHookArguments } = require('../StaticHookArguments');
const { after, mapAfterAllReturn } = require('../../utils/promiseUtils');
const { isSqlite, isMySql } = require('../../utils/knexUtils');
const { isObject } = require('../../utils/objectUtils');

// `@@auto_increment_increment` for each MySQL knex instance, keyed by the knex config,
// which transactions share with the knex they were started from.
const autoIncrementIncrements = new WeakMap();

// Base class for all insert operations.
class InsertOperation extends QueryBuilderOperation {
  constructor(name, opt) {
    super(name, opt);

    this.models = null;
    this.isArray = false;
    this.modelOptions = Object.assign({}, this.opt.modelOptions || {});
    this.autoIncrementIncrement = null;
  }

  onAdd(builder, args) {
    const json = args[0];
    const modelClass = builder.modelClass();

    this.isArray = Array.isArray(json);
    this.models = modelClass.ensureModelArray(json, this.modelOptions);

    return true;
  }

  async onBefore2(builder, result) {
    await callBeforeInsert(builder, this.models);

    if (this.models.length > 1 && isMySql(builder.knex())) {
      await this.prepareMySqlBatchInsert(builder);
    }

    return result;
  }

  // MySQL only returns the id of the first row of a multi-row insert. InnoDB
  // gives the rows of one multi-row VALUES insert consecutive ids (in every
  // `innodb_autoinc_lock_mode`), so the other ids can be computed from it and
  // `@@auto_increment_increment`.
  async prepareMySqlBatchInsert(builder) {
    const withId = this.models.filter((model) => model.$hasId()).length;

    if (withId === this.models.length) {
      return;
    }

    if (withId > 0) {
      throw new Error(
        `batch insert on MySQL can't return ids when only some rows have an id. Set the id on all rows or none.`,
      );
    }

    if (Array.isArray(builder.modelClass().getIdColumn())) {
      return;
    }

    const knex = builder.knex();
    let increment = autoIncrementIncrements.get(knex.client.config);

    if (increment === undefined) {
      const [rows] = await knex.raw('select @@auto_increment_increment as increment');
      increment = Number(rows[0].increment);
      autoIncrementIncrements.set(knex.client.config, increment);
    }

    this.autoIncrementIncrement = increment;
  }

  onBuildKnex(knexBuilder, builder) {
    const knex = builder.knex();
    const returnsIds = !isMySql(knex) && (!isSqlite(knex) || this.models.length > 1);

    if (returnsIds && !builder.has(/returning/)) {
      // If the user hasn't specified a `returning` clause, we make sure
      // that at least the identifier is returned. SQLite only returns the
      // id of the last row without one.
      knexBuilder = knexBuilder.returning(builder.modelClass().getIdColumn());
    }

    return knexBuilder.insert(this.models.map((model) => model.$toDatabaseJson(builder)));
  }

  onAfter1(builder, ret) {
    if (!Array.isArray(ret) || !ret.length || ret === this.models) {
      // Early exit if there is nothing to do.
      return this.models;
    }

    if (ret.length === 1 && this.models.length > 1) {
      this.setMySqlBatchInsertIds(builder, ret[0]);
    } else if (isObject(ret[0])) {
      // If the user specified a `returning` clause the result may be an array of objects.
      // Merge all values of the objects to our models.
      for (let i = 0, l = this.models.length; i < l; ++i) {
        this.models[i].$setDatabaseJson(ret[i]);
      }
    } else {
      // If the return value is not an array of objects, we assume it is an array of identifiers.
      for (let i = 0, l = this.models.length; i < l; ++i) {
        const model = this.models[i];

        // Don't set the id if the model already has one. MySQL and Sqlite don't return the correct
        // primary key value if the id is not generated in db, but given explicitly.
        if (!model.$id()) {
          model.$id(ret[i]);
        }
      }
    }

    return this.models;
  }

  setMySqlBatchInsertIds(builder, firstId) {
    const increment = this.autoIncrementIncrement;

    // `onConflict()` may skip or update rows, which breaks the id sequence.
    if (increment === null || builder.has(/onConflict/) || !firstId) {
      return;
    }

    for (let i = 0, l = this.models.length; i < l; ++i) {
      this.models[i].$id(addToId(firstId, i * increment));
    }
  }

  onAfter2(builder, models) {
    const result = this.isArray ? models : models[0] || null;
    return callAfterInsert(builder, this.models, result);
  }

  toFindOperation() {
    return null;
  }

  clone() {
    const clone = super.clone();

    clone.models = this.models;
    clone.isArray = this.isArray;
    clone.autoIncrementIncrement = this.autoIncrementIncrement;

    return clone;
  }
}

// The id can be a string or a BigInt when the driver is configured to
// return big numbers that way.
function addToId(id, amount) {
  if (typeof id === 'number') {
    return id + amount;
  } else if (typeof id === 'bigint') {
    return id + BigInt(amount);
  } else {
    return String(BigInt(id) + BigInt(amount));
  }
}

function callBeforeInsert(builder, models) {
  const maybePromise = callInstanceBeforeInsert(builder, models);
  return after(maybePromise, () => callStaticBeforeInsert(builder));
}

function callInstanceBeforeInsert(builder, models) {
  return mapAfterAllReturn(models, (model) => model.$beforeInsert(builder.context()), models);
}

function callStaticBeforeInsert(builder) {
  const args = StaticHookArguments.create({ builder });
  return builder.modelClass().beforeInsert(args);
}

function callAfterInsert(builder, models, result) {
  const maybePromise = callInstanceAfterInsert(builder, models);
  return after(maybePromise, () => callStaticAfterInsert(builder, result));
}

function callInstanceAfterInsert(builder, models) {
  return mapAfterAllReturn(models, (model) => model.$afterInsert(builder.context()), models);
}

function callStaticAfterInsert(builder, result) {
  const args = StaticHookArguments.create({ builder, result });
  const maybePromise = builder.modelClass().afterInsert(args);

  return after(maybePromise, (maybeResult) => {
    if (maybeResult === undefined) {
      return result;
    } else {
      return maybeResult;
    }
  });
}

module.exports = {
  InsertOperation,
};
