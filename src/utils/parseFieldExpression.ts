// A named import: `import * as` of a JavaScript module wraps it in an object
// of getters (tsc's __importStar), which is slow to call through.
import { parse as parseJsonFieldExpression } from '../queryBuilder/parsers/jsonFieldExpressionParser';

// One step of the JSON path of a field expression: `[1]` is an array access
// and `.a` or `["a"]` an object access.
interface FieldExpressionAccess {
  readonly type: 'object' | 'array';
  readonly ref: string | number;
}

// A parsed field expression like `Table.column:a[1]`. The parsed expressions
// are cached and frozen.
interface ParsedFieldExpression {
  readonly columnName: string;
  readonly access: readonly FieldExpressionAccess[];
  readonly column: string;
  readonly table: string | null;
}

// What the parser returns. `preprocessParsedExpression` adds the rest.
interface ParserOutput {
  columnName: string;
  access: FieldExpressionAccess[];
  column?: string;
  table?: string | null;
}

const cache = new Map<string, ParsedFieldExpression>();

function parseFieldExpression(expr: string): ParsedFieldExpression {
  let parsedExpr = cache.get(expr);

  if (parsedExpr !== undefined) {
    return parsedExpr;
  } else {
    const parserOutput = parseJsonFieldExpression(expr) as ParserOutput;
    parsedExpr = preprocessParsedExpression(parserOutput);

    // We don't take a copy of the parsedExpr each time we
    // use if from cache. Instead to make sure it's never
    // mutated we deep-freeze it.
    parsedExpr = freezeParsedExpr(parsedExpr);

    cache.set(expr, parsedExpr);
    return parsedExpr;
  }
}

function preprocessParsedExpression(parsedExpr: ParserOutput): ParsedFieldExpression {
  const columnParts = parsedExpr.columnName.split('.').map((part) => part.trim());
  parsedExpr.column = columnParts[columnParts.length - 1];

  if (columnParts.length >= 2) {
    parsedExpr.table = columnParts.slice(0, columnParts.length - 1).join('.');
  } else {
    parsedExpr.table = null;
  }

  return parsedExpr as ParsedFieldExpression;
}

function freezeParsedExpr(parsedExpr: ParsedFieldExpression): ParsedFieldExpression {
  for (const access of parsedExpr.access) {
    Object.freeze(access);
  }

  Object.freeze(parsedExpr.access);
  Object.freeze(parsedExpr);

  return parsedExpr;
}

export type { FieldExpressionAccess, ParsedFieldExpression };
export { parseFieldExpression };
