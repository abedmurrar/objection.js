import { ObjectionToKnexConvertingOperation } from './ObjectionToKnexConvertingOperation';
import { isPlainObject, isString } from '../../utils/objectUtils';
import { isModelClass } from '../../utils/resolveModel';
import type { KnexBuilder, ModelClass, OperationOptions, QueryBuilder } from './types';

const ALIAS_REGEX = /\s+as\s+/i;

interface TableAndAlias {
  table: string | null;
  alias: string | null;
}

// FromOperation corresponds to a `.from(args)` call. The call is delegated to
// knex, but we first try to parse the arguments so that we can determine which
// tables have been mentioned in a query's from clause. We only parse string
// references and not `raw` or `ref` etc. references at this point thouhg.
class FromOperation extends ObjectionToKnexConvertingOperation {
  declare table: string | null;
  declare alias: string | null;

  constructor(name: string | null, opt?: OperationOptions) {
    super(name, opt);

    this.table = null;
    this.alias = null;
  }

  onAdd(builder: QueryBuilder, args: unknown[]): boolean {
    const ret = super.onAdd(builder, args);
    const parsed = parseTableAndAlias((this.args as unknown[])[0], builder);

    if (parsed.table) {
      builder.tableName(parsed.table);
      this.table = parsed.table;
    }

    if (parsed.alias) {
      builder.aliasFor(builder.modelClass().getTableName(), parsed.alias);
      this.alias = parsed.alias;
    }

    return ret;
  }

  onBuildKnex(knexBuilder: KnexBuilder, builder: QueryBuilder): KnexBuilder {
    // Simply call knex's from method with the converted arguments.
    return knexBuilder.from.apply(knexBuilder, this.getKnexArgs(builder));
  }

  clone(): this {
    const clone = super.clone();

    clone.table = this.table;
    clone.alias = this.alias;

    return clone;
  }
}

function parseTableAndAlias(arg: unknown, builder: QueryBuilder): TableAndAlias {
  if (isModelClass(arg)) {
    return parseTableAndAliasFromString((arg as ModelClass).getTableName());
  } else if (isString(arg)) {
    return parseTableAndAliasFromString(arg);
  } else if (isPlainObject(arg)) {
    return parseTableAndAliasFromObject(arg, builder);
  } else {
    // Could not parse table and alias from the arguments.
    return {
      table: null,
      alias: null,
    };
  }
}

function parseTableAndAliasFromString(arg: string): TableAndAlias {
  if (ALIAS_REGEX.test(arg)) {
    const parts = arg.split(ALIAS_REGEX);

    return {
      table: parts[0].trim(),
      alias: parts[1].trim(),
    };
  } else {
    return {
      table: arg.trim(),
      alias: null,
    };
  }
}

function parseTableAndAliasFromObject(
  arg: Record<string, unknown>,
  builder: QueryBuilder,
): TableAndAlias {
  for (const alias of Object.keys(arg)) {
    const value = isModelClass(arg[alias]) ? (arg[alias] as ModelClass).getTableName() : arg[alias];

    if (!isString(value)) {
      continue;
    }

    const table = value.trim();

    if (table === builder.modelClass().getTableName()) {
      return {
        alias,
        table,
      };
    }
  }

  throw new Error(
    `one of the tables in ${JSON.stringify(arg)} must be the query's model class's table.`,
  );
}

export { FromOperation };
