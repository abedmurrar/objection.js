import { uniqBy } from '../../utils/objectUtils';
import { Selection } from '../operations/select/Selection';
import { createModifier } from '../../utils/createModifier';
import { map as mapPromise } from '../../utils/promiseUtils';
import { ValidationErrorType } from '../../model/ValidationError';
import type { RelationExpression } from '../RelationExpression';
import type { Relation, RelationModelClass } from '../../relations/Relation';
import type { GraphOptions, Model, ModelClass, QueryBuilder } from '../operations/types';

import { TableTree } from './TableTree';
import { JoinResultParser } from './JoinResultParser';
import { ID_LENGTH_LIMIT } from './utils';
import type { TableNode } from './TableNode';

// A row of the joined query: a value for each column alias.
type FlatRow = Record<string, unknown>;

// A model created from the joined rows. Its relation properties are set here.
type JoinModel = Model;

// `ManyToManyRelation` sets `isObjectionManyToManyRelation` on its prototype.
type JoinRelation = Relation & { readonly isObjectionManyToManyRelation?: boolean };

// The model classes and query builders are still JavaScript. `ModelClass` and
// `QueryBuilder` of the operations have the parts that the operations use, and
// these are the other parts that the joins use. They come first, so that
// `query()` and the one argument `aliasFor()` resolve to them.

type JoinModelClass = {
  getRelationNames(): string[];
  getRelationUnsafe(relationName: string | null): JoinRelation | null;
  fromDatabaseJson(row: FlatRow): JoinModel;
  fetchTableMetadata(opt: { parentBuilder: QueryBuilder }): Promise<unknown>;
  tableMetadata(opt: { table: string }): { columns: string[] } | null | undefined;
  query(): JoinQueryBuilder;
} & ModelClass;

type JoinQueryBuilder = {
  aliasFor(modelClass: RelationModelClass | null): string | null | undefined;
  tableNameFor(modelClass: RelationModelClass): string;
  findAllSelections(): Selection[];
  modify(modifier: Relation['modify']): JoinQueryBuilder;
} & QueryBuilder;

// The options of `RelationJoiner`, the `withGraphJoined()` options.
interface JoinOptions {
  joinOperation: string;
  minimize: boolean;
  separator: string;
  aliases: Record<string, string>;
}

// The modifiers of `withGraphJoined()`, by name.
type Modifiers = Record<string, unknown>;

// The query of each table node that has the selects of the user.
type UserSelectQueries = Map<TableNode, JoinQueryBuilder>;

/**
 * Given a relation expression, builds a query using joins to fetch it.
 */
class RelationJoiner {
  declare rootModelClass: JoinModelClass;
  declare expression: RelationExpression | null;
  declare modifiers: Modifiers | null;
  declare options: JoinOptions;
  declare tableTree: TableTree | null;
  declare internalSelections: Selection[] | null;

  constructor({ modelClass }: { modelClass: ModelClass }) {
    this.rootModelClass = modelClass as JoinModelClass;

    // The relation expression to join.
    this.expression = null;

    // Explicit modifiers for the relation expression.
    this.modifiers = null;

    this.options = defaultOptions();
    this.tableTree = null;
    this.internalSelections = null;
  }

  setExpression(expression: RelationExpression): this {
    if (!this.expression) {
      this.expression = expression;
    }

    return this;
  }

  setModifiers(modifiers: Modifiers): this {
    if (!this.modifiers) {
      this.modifiers = modifiers;
    }

    return this;
  }

  setOptions(options: Partial<JoinOptions> & GraphOptions): this {
    this.options = Object.assign(this.options, options);
    return this;
  }

  /**
   * Fetches the column information needed for building the select clauses.
   *
   * This must be called before calling `build(builder, true)`. `build(builder, false)`
   * can be called without this since it doesn't build selects.
   */
  fetchColumnInfo(builder: QueryBuilder): PromiseLike<unknown[]> {
    const tableTree = this._getTableTree(builder);
    const allModelClasses = new Set(tableTree.nodes.map((node) => node.modelClass));

    return mapPromise(
      Array.from(allModelClasses),
      (modelClass: JoinModelClass) => modelClass.fetchTableMetadata({ parentBuilder: builder }),
      {
        concurrency: this.rootModelClass.getConcurrency(builder.unsafeKnex()),
      },
    );
  }

  // The callers have the operations' `QueryBuilder`. The overload takes it as
  // the `JoinQueryBuilder` it is.
  build(builder: QueryBuilder, buildSelects?: boolean): void;
  build(builder: JoinQueryBuilder, buildSelects = true): void {
    const rootTableNode = this._getTableTree(builder).rootNode;
    const userSelectQueries: UserSelectQueries = new Map([[rootTableNode, builder]]);

    for (const tableNode of rootTableNode.childNodes) {
      this._buildJoinsForNode({ builder, tableNode, userSelectQueries });
    }

    if (buildSelects) {
      this._buildSelects({ builder, tableNode: rootTableNode, userSelectQueries });
    }
  }

  parseResult(builder: QueryBuilder, flatRows: unknown): unknown {
    const parser = JoinResultParser.create({
      tableTree: this._getTableTree(builder),
      omitColumnAliases: this.internalSelections!.map((it) => it.alias),
    });

    return parser.parse(flatRows);
  }

  _getTableTree(builder: QueryBuilder): TableTree {
    if (!this.tableTree) {
      // Create the table tree lazily.
      this.tableTree = TableTree.create({
        rootModelClass: this.rootModelClass,
        rootTableAlias: builder.tableRef(),
        expression: this.expression!,
        options: this.options,
      });
    }

    return this.tableTree;
  }

  _buildJoinsForNode({
    builder,
    tableNode,
    userSelectQueries,
  }: {
    builder: JoinQueryBuilder;
    tableNode: TableNode;
    userSelectQueries: UserSelectQueries;
  }): void {
    const subqueryToJoin = createSubqueryToJoin({
      builder,
      tableNode,
      modifiers: this.modifiers,
    });

    const userSelectQuery = subqueryToJoin.clone();

    // relation.join applies the relation modifier that can
    // also contain selects.
    userSelectQuery.modify(tableNode.relation!.modify);

    // Save the query that contains the user specified selects
    // for later use.
    userSelectQueries.set(tableNode, userSelectQuery);

    tableNode.relation!.join(builder, {
      joinOperation: this.options.joinOperation,

      ownerTable: tableNode.parentNode!.alias,
      relatedTableAlias: tableNode.alias,
      joinTableAlias: tableNode.getJoinTableAlias(builder),

      relatedJoinSelectQuery: ensureIdAndRelationPropsAreSelected({
        builder: subqueryToJoin,
        tableNode,
      }),
    });

    for (const childNode of tableNode.childNodes) {
      this._buildJoinsForNode({ builder, tableNode: childNode, userSelectQueries });
    }
  }

  _buildSelects({
    builder,
    tableNode,
    userSelectQueries,
  }: {
    builder: JoinQueryBuilder;
    tableNode: TableNode;
    userSelectQueries: UserSelectQueries;
  }): void {
    const { selections, internalSelections } = getSelectionsForNode({
      builder,
      tableNode,
      userSelectQueries,
    });

    for (const selection of selections) {
      // The selections that are added here all have an alias.
      checkAliasLength(tableNode.modelClass, selection.name!);
    }

    // Save the selections that were added internally (not by the user)
    // so that we can later remove the corresponding properties when
    // parsing the result.
    this.internalSelections = internalSelections;

    builder.select(selectionsToStrings(selections));
  }
}

function defaultOptions(): JoinOptions {
  return {
    joinOperation: 'leftJoin',
    minimize: false,
    separator: ':',
    aliases: {},
  };
}

function createSubqueryToJoin({
  builder,
  tableNode,
  modifiers,
}: {
  builder: JoinQueryBuilder;
  tableNode: TableNode;
  modifiers: Modifiers | null;
}): JoinQueryBuilder {
  const { relation, expression, modelClass } = tableNode;
  const modifierQuery = modelClass.query().childQueryOf(builder);

  for (const modifierName of expression.node.$modify) {
    const modifier = createModifier({
      modifier: modifierName,
      modelClass,
      modifiers,
    });

    try {
      modifier(modifierQuery);
    } catch (err) {
      if (err instanceof modelClass.ModifierNotFoundError) {
        throw modelClass.createValidationError({
          type: ValidationErrorType.RelationExpression,
          message: `could not find modifier "${modifierName}" for relation "${relation!.name}"`,
        });
      } else {
        throw err;
      }
    }
  }

  return modifierQuery;
}

function ensureIdAndRelationPropsAreSelected({
  builder,
  tableNode,
}: {
  builder: JoinQueryBuilder;
  tableNode: TableNode;
}): JoinQueryBuilder {
  const tableRef = builder.tableRef();

  const cols = [
    ...builder.modelClass().getIdColumnArray(),
    ...tableNode.relation!.relatedProp.cols,
    ...tableNode.childNodes.reduce<string[]>(
      (cols, childNode) => [...cols, ...childNode.relation!.ownerProp.cols],
      [],
    ),
  ];

  const selectStrings = uniqBy(cols)
    .filter((col: string) => !builder.hasSelectionAs(col, col))
    .map((col: string) => `${tableRef}.${col}`);

  return builder.select(selectStrings);
}

function getSelectionsForNode({
  builder,
  tableNode,
  userSelectQueries,
}: {
  builder: JoinQueryBuilder;
  tableNode: TableNode;
  userSelectQueries: UserSelectQueries;
}): { selections: Selection[]; internalSelections: Selection[] } {
  // Every node has a query: `build()` and `_buildJoinsForNode()` add them.
  const userSelectQuery = userSelectQueries.get(tableNode)!;
  const userSelections = userSelectQuery.findAllSelections();
  const userSelectedAllColumns = isSelectAllSelectionSet(userSelections);

  let selections: Selection[] = [];
  let internalSelections: Selection[] = [];

  if (tableNode.parentNode) {
    selections = mapUserSelectionsFromSubqueryToMainQuery({ userSelections, tableNode });

    if (userSelectedAllColumns && tableNode.relation!.isObjectionManyToManyRelation) {
      const extraSelections = getJoinTableExtraSelectionsForNode({ builder, tableNode });
      selections = selections.concat(extraSelections);
    }
  }

  if (userSelectedAllColumns) {
    const allColumnSelections = getAllColumnSelectionsForNode({ builder, tableNode });
    selections = allColumnSelections.concat(selections);
  } else {
    const idSelections = getIdSelectionsForNode({ tableNode });

    for (const idSelection of idSelections) {
      // The id selections have a column.
      if (!userSelectQuery.hasSelectionAs(idSelection.column!, idSelection.column!)) {
        selections.push(idSelection);
        internalSelections.push(idSelection);
      }
    }
  }

  for (const childNode of tableNode.childNodes) {
    const childResult = getSelectionsForNode({ builder, tableNode: childNode, userSelectQueries });

    selections = selections.concat(childResult.selections);
    internalSelections = internalSelections.concat(childResult.internalSelections);
  }

  return {
    selections,
    internalSelections,
  };
}

function mapUserSelectionsFromSubqueryToMainQuery({
  userSelections,
  tableNode,
}: {
  userSelections: Selection[];
  tableNode: TableNode;
}): Selection[] {
  return userSelections.filter(isNotSelectAll).map((selection) => {
    // A user selection that isn't `*` has a name.
    return new Selection(
      tableNode.alias,
      selection.name,
      tableNode.getColumnAliasForColumn(selection.name!),
    );
  });
}

function getJoinTableExtraSelectionsForNode({
  builder,
  tableNode,
}: {
  builder: JoinQueryBuilder;
  tableNode: TableNode;
}): Selection[] {
  return tableNode.relation!.joinTableExtras.map((extra) => {
    // A many to many relation, which has a join table.
    return new Selection(
      tableNode.getJoinTableAlias(builder)!,
      extra.joinTableCol,
      tableNode.getColumnAliasForColumn(extra.aliasCol),
    );
  });
}

function getAllColumnSelectionsForNode({
  builder,
  tableNode,
}: {
  builder: JoinQueryBuilder;
  tableNode: TableNode;
}): Selection[] {
  const table = builder.tableNameFor(tableNode.modelClass);
  const tableMeta = tableNode.modelClass.tableMetadata({ table });

  if (!tableMeta) {
    throw new Error(
      `table metadata has not been fetched for table '${table}'. Are you trying to call toKnexQuery() for a withGraphJoined query? To make sure the table metadata is fetched see the objection.initialize function.`,
    );
  }

  return tableMeta.columns.map((columnName) => {
    return new Selection(
      tableNode.alias,
      columnName,
      tableNode.getColumnAliasForColumn(columnName),
    );
  });
}

function getIdSelectionsForNode({ tableNode }: { tableNode: TableNode }): Selection[] {
  return tableNode.modelClass.getIdColumnArray().map((columnName) => {
    return new Selection(
      tableNode.alias,
      columnName,
      tableNode.getColumnAliasForColumn(columnName),
    );
  });
}

function selectionsToStrings(selections: Selection[]): string[] {
  return selections.map((selection) => {
    const selectStr = `${selection.table}.${selection.column}`;
    return `${selectStr} as ${selection.alias}`;
  });
}

function isSelectAll(selection: Selection): boolean {
  return selection.column === '*';
}

function isNotSelectAll(selection: Selection): boolean {
  return selection.column !== '*';
}

function isSelectAllSelectionSet(selections: Selection[]): boolean {
  return selections.length === 0 || selections.some(isSelectAll);
}

function checkAliasLength(modelClass: JoinModelClass, alias: string): void {
  if (alias.length > ID_LENGTH_LIMIT) {
    throw modelClass.createValidationError({
      type: ValidationErrorType.RelationExpression,
      message: `identifier ${alias} is over ${ID_LENGTH_LIMIT} characters long and would be truncated by the database engine.`,
    });
  }
}

export {
  RelationJoiner,
  type FlatRow,
  type JoinModel,
  type JoinModelClass,
  type JoinOptions,
  type JoinQueryBuilder,
  type JoinRelation,
};
