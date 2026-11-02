import { isObject, isFunction } from './objectUtils';

// The objection values that are converted into knex values: raw, ref, fn and
// value builders have `toKnexRaw`, and query builders become subqueries.
interface BuildableArg {
  toKnexRaw?: (builder: unknown) => unknown;
  isObjectionQueryBuilderBase?: boolean;
  subqueryOf(builder: unknown): { toKnexQuery(): unknown };
}

function buildArg(arg: unknown, builder: unknown): unknown {
  if (!isObject(arg)) {
    return arg;
  }

  const buildable = arg as BuildableArg;

  if (isFunction(buildable.toKnexRaw)) {
    return buildable.toKnexRaw(builder);
  } else if (buildable.isObjectionQueryBuilderBase === true) {
    return buildable.subqueryOf(builder).toKnexQuery();
  } else {
    return arg;
  }
}

export { buildArg };
