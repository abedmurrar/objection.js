'use strict';

const { isObject, isFunction } = require('../utils/objectUtils');
const { isKnexRaw } = require('../utils/knexUtils');

// Where clauses objection adds on its own, like the owner condition of a relation
// query or the id condition of `$query()`, are tagged with a "where scope". When
// a query has where clauses from more than one scope, the clauses of each scope
// are wrapped in parentheses so that an `orWhere` in one scope can't escape the
// conditions of the others. Without this, `$relatedQuery('pets').where(a).orWhere(b)`
// would produce `owner and a or b` and match other owners' pets.
//
// The scopes are only used when the knex query is built. The operation tree is
// never modified.

const WhereSelector = /^(where|orWhere|andWhere|find\w+)/;

// Where operations that only ever produce a single predicate or predicates
// joined with `and`. A scope that only contains these (and no raw arguments)
// doesn't need to be wrapped in parentheses.
const AND_ONLY_OPERATIONS = new Set([
  'where',
  'andWhere',
  'whereNot',
  'andWhereNot',
  'whereIn',
  'whereNotIn',
  'whereNull',
  'whereNotNull',
  'whereBetween',
  'whereNotBetween',
  'whereExists',
  'whereNotExists',
  'whereColumn',
  'andWhereColumn',
  'whereNotColumn',
  'andWhereNotColumn',
  'whereLike',
  'whereILike',
  'whereWrapped',
  'whereComposite',
  'whereInComposite',
  'whereJsonSupersetOf',
  'whereJsonSubsetOf',
  'whereJsonNotSupersetOf',
  'whereJsonNotSubsetOf',
  'whereJsonHasAny',
  'whereJsonHasAll',
  'whereJsonNotArray',
  'whereJsonNotObject',
  'whereJsonObject',
  'whereNotJsonObject',
  'whereJsonPath',
  'findById',
  'findByIds',
]);

function withWhereScope(builder, callback) {
  const previous = builder._whereScope;
  // A fresh object works as a unique token.
  builder._whereScope = {};

  try {
    return callback();
  } finally {
    builder._whereScope = previous;
  }
}

function effectiveWhereScope(op) {
  while (op) {
    if (op.whereScope !== null) {
      return op.whereScope;
    }

    op = op.parentOperation;
  }

  return null;
}

// Returns null if no where clauses need to be grouped. Otherwise returns an
// object that tells, for each operation, whether the operation is built as
// part of a group.
function createWhereGrouping(builder) {
  const scopes = new Map();

  builder.forEachOperation(WhereSelector, (op) => {
    if (!hasWhereAncestor(op)) {
      const scope = effectiveWhereScope(op);
      const ops = scopes.get(scope) || [];

      ops.push(op);
      scopes.set(scope, ops);
    }
  });

  if (scopes.size < 2) {
    return null;
  }

  const groupByFirstOp = new Map();
  const groupedOps = new Set();

  for (const ops of scopes.values()) {
    if (ops.every(isAndOnlyTree)) {
      continue;
    }

    groupByFirstOp.set(ops[0], ops);

    for (const op of ops) {
      groupedOps.add(op);
      op.forEachDescendantOperation((it) => {
        groupedOps.add(it);
      });
    }
  }

  if (groupedOps.size === 0) {
    return null;
  }

  return {
    isGrouped(op) {
      return groupedOps.has(op);
    },

    // Builds the whole group if `op` is the first operation of a group.
    build(op, knexBuilder) {
      const ops = groupByFirstOp.get(op);

      if (!ops) {
        return knexBuilder;
      }

      return knexBuilder.where(function () {
        let groupBuilder = this;

        for (const groupOp of ops) {
          groupBuilder = buildOperationTree(builder, groupOp, groupBuilder);
        }
      });
    },
  };
}

function buildOperationTree(builder, op, knexBuilder) {
  const ops = [op];

  op.forEachDescendantOperation((it) => {
    ops.push(it);
  });

  for (const it of ops) {
    if (it.hasOnBuildKnex()) {
      knexBuilder =
        builder.callOperationMethod(it, 'onBuildKnex', [knexBuilder, builder]) || knexBuilder;
    }
  }

  return knexBuilder;
}

function hasWhereAncestor(op) {
  for (let parent = op.parentOperation; parent; parent = parent.parentOperation) {
    if (WhereSelector.test(parent.name)) {
      return true;
    }
  }

  return false;
}

function isAndOnlyTree(op) {
  if (!isAndOnly(op)) {
    return false;
  }

  let andOnly = true;

  op.forEachDescendantOperation((it) => {
    if (it.hasOnBuildKnex() && !isAndOnly(it)) {
      andOnly = false;
      return false;
    }
  });

  return andOnly;
}

function isAndOnly(op) {
  return AND_ONLY_OPERATIONS.has(op.name) && !containsRaw(op.args);
}

function containsRaw(value) {
  if (Array.isArray(value)) {
    return value.some(containsRaw);
  } else if (!isObject(value)) {
    return false;
  } else if (value.isObjectionReferenceBuilder) {
    // A reference is always a single (possibly casted) column or json path.
    return false;
  } else if (isKnexRaw(value) || isFunction(value.toKnexRaw)) {
    // Raw sql (and anything that is converted into it) can contain anything.
    return true;
  } else if (value.isObjectionQueryBuilderBase || isFunction(value.toSQL)) {
    // Subqueries are always wrapped in parentheses.
    return false;
  } else if (Object.getPrototypeOf(value) === Object.prototype) {
    return Object.values(value).some(containsRaw);
  } else {
    return false;
  }
}

module.exports = {
  withWhereScope,
  effectiveWhereScope,
  createWhereGrouping,
};
