// Parses relation expressions at compile time, like objection does at runtime
// (lib/queryBuilder/parsers/relationExpressionParser.pegjs):
//
//   '[pets(onlyDogs).toys, mom as mother.^]'
//   { pets: { $modify: onlyDogs, toys: true }, mother: { $relation: 'mom', $recursive: true } }
//
// Both give a `GraphNode` whose children are the relations to load. Checking the
// relation names against the models is done in index.d.ts.

export interface GraphNode {
  // The name of the relation. The property name (the key of the node in
  // `children`) can be different, when an alias is used.
  rel: string;
  // The modifiers: names, or the values of `$modify` in object notation.
  mods: readonly unknown[];
  children: Graph;
  // `^`, `^N` or `$recursive`.
  recursive: boolean;
  // `*` or `$allRecursive`.
  all: boolean;
  // Object notation with a `boolean` value, which may or may not load the relation.
  maybe: boolean;
}

export type Graph = { [prop: string]: GraphNode };

export interface ParseError<Message extends string = string> {
  '~parseError': Message;
}

// The graph of an expression that isn't known at compile time.
export interface UnknownGraph {
  '~unknownGraph': true;
}

export type ParseRelationExpression<E> = string extends E
  ? UnknownGraph
  : E extends string
    ? ParseString<E>
    : E extends object
      ? string extends keyof E
        ? UnknownGraph
        : RootNode<ObjectChildren<E>, E extends { $allRecursive: true } ? true : false>
      : UnknownGraph;

type RootNode<Children extends Graph, All extends boolean = false> = {
  rel: '';
  mods: [];
  children: Children;
  recursive: false;
  all: All;
  maybe: false;
};

// Strings.

type Whitespace = ' ' | '\t' | '\r' | '\n';
type Punctuation = '[' | ']' | '(' | ')' | ',' | '.';

// Splits an expression into names and the characters `[ ] ( ) , .`. Whitespace
// only separates names.
type Tokenize<
  S extends string,
  Name extends string = '',
  Tokens extends string[] = [],
> = S extends `${infer C}${infer Rest}`
  ? C extends Whitespace
    ? Tokenize<Rest, '', AddName<Tokens, Name>>
    : C extends Punctuation
      ? Tokenize<Rest, '', [...AddName<Tokens, Name>, C]>
      : Tokenize<Rest, `${Name}${C}`, Tokens>
  : AddName<Tokens, Name>;

type AddName<Tokens extends string[], Name extends string> = Name extends ''
  ? Tokens
  : [...Tokens, Name];

type ParseString<E extends string> =
  Tokenize<E> extends infer Tokens extends string[]
    ? Tokens extends []
      ? ParseError<'Empty relation expression'>
      : Tokens extends ['*']
        ? RootNode<{}, true>
        : Tokens extends ['[', ...infer Rest extends string[]]
          ? ParseList<Rest, {}> extends infer List
            ? List extends [infer Children extends Graph, infer After extends string[]]
              ? ExpectEnd<After, RootNode<Children>>
              : List
            : never
          : ParseExpression<Tokens> extends infer Expr
            ? Expr extends [
                infer Prop extends string,
                infer Node extends GraphNode,
                infer After extends string[],
              ]
              ? ExpectEnd<After, RootNode<{ [P in Prop]: Node }>>
              : Expr
            : never
    : never;

type ExpectEnd<Tokens extends string[], Result> = Tokens extends []
  ? Result
  : ParseError<`Unexpected "${Tokens[0]}" in relation expression`>;

type IsName<T> = T extends Punctuation ? false : T extends string ? true : false;

// `name(modifiers) as alias` followed by `.expression` or `.[list]`. Gives
// `[prop, node, rest]` or a `ParseError`.
type ParseExpression<Tokens extends string[]> = Tokens extends [
  infer Name extends string,
  ...infer Rest extends string[],
]
  ? IsName<Name> extends true
    ? ParseModifiers<Rest> extends infer Mods
      ? Mods extends [infer Names extends string[], infer AfterMods extends string[]]
        ? AfterMods extends ['as', infer Alias extends string, ...infer AfterAlias extends string[]]
          ? IsName<Alias> extends true
            ? ParseSub<Alias, Name, Names, AfterAlias>
            : ParseSub<Name, Name, Names, AfterMods>
          : ParseSub<Name, Name, Names, AfterMods>
        : Mods
      : never
    : ParseError<`Expected a relation name, got "${Name}"`>
  : ParseError<'Unexpected end of relation expression'>;

type ParseModifiers<Tokens extends string[]> = Tokens extends ['(', ...infer Rest extends string[]]
  ? CollectModifiers<Rest, []>
  : [[], Tokens];

type CollectModifiers<Tokens extends string[], Names extends string[]> = Tokens extends [
  infer T extends string,
  ...infer Rest extends string[],
]
  ? T extends ')'
    ? [Names, Rest]
    : T extends ','
      ? CollectModifiers<Rest, Names>
      : IsName<T> extends true
        ? CollectModifiers<Rest, [...Names, T]>
        : ParseError<`Unexpected "${T}" in modifiers`>
  : ParseError<'Missing ")" in relation expression'>;

type Node<
  Rel extends string,
  Mods extends readonly unknown[],
  Children extends Graph,
  Recursive extends boolean = false,
  All extends boolean = false,
  Maybe extends boolean = false,
> = {
  rel: Rel;
  mods: Mods;
  children: Children;
  recursive: Recursive;
  all: All;
  maybe: Maybe;
};

type ParseSub<
  Prop extends string,
  Rel extends string,
  Mods extends string[],
  Tokens extends string[],
> = Tokens extends ['.', '[', ...infer Rest extends string[]]
  ? ParseList<Rest, {}> extends infer List
    ? List extends [infer Children extends Graph, infer After extends string[]]
      ? [Prop, Node<Rel, Mods, Children>, After]
      : List
    : never
  : Tokens extends ['.', infer Sub extends string, ...infer Rest extends string[]]
    ? Sub extends '^' | `^${number}`
      ? [Prop, Node<Rel, Mods, {}, true>, Rest]
      : Sub extends '*'
        ? [Prop, Node<Rel, Mods, {}, false, true>, Rest]
        : ParseExpression<[Sub, ...Rest]> extends infer Expr
          ? Expr extends [
              infer SubProp extends string,
              infer SubNode extends GraphNode,
              infer After extends string[],
            ]
            ? [Prop, Node<Rel, Mods, { [P in SubProp]: SubNode }>, After]
            : Expr
          : never
    : Tokens extends ['.']
      ? ParseError<'Unexpected end of relation expression'>
      : [Prop, Node<Rel, Mods, {}>, Tokens];

// The items of `[a, b]`. The commas are optional. Gives `[children, rest]` or a
// `ParseError`.
type ParseList<Tokens extends string[], Children extends Graph> = Tokens extends [
  infer T extends string,
  ...infer Rest extends string[],
]
  ? T extends ']'
    ? [Children, Rest]
    : T extends ','
      ? ParseList<Rest, Children>
      : ParseExpression<Tokens> extends infer Expr
        ? Expr extends [
            infer Prop extends string,
            infer Node extends GraphNode,
            infer After extends string[],
          ]
          ? ParseList<After, AddChild<Children, Prop, Node>>
          : Expr
        : never
  : ParseError<'Missing "]" in relation expression'>;

// A later relation with the same name replaces the earlier one, like at runtime.
type AddChild<Children extends Graph, Prop extends string, Child extends GraphNode> = {
  [P in keyof Children | Prop]: P extends Prop ? Child : Children[P & keyof Children];
};

// Object notation.

type ObjectChildren<E> = {
  [K in keyof E as K extends `$${string}`
    ? never
    : K extends string
      ? [E[K]] extends [false]
        ? never
        : K
      : never]: ObjectNode<K & string, E[K]>;
};

type ObjectNode<K extends string, V> = [V] extends [true]
  ? Node<K, [], {}>
  : [V] extends [boolean]
    ? Node<K, [], {}, false, false, true>
    : {
        rel: V extends { $relation: infer R extends string } ? R : K;
        mods: V extends { $modify: infer F } ? (F extends readonly unknown[] ? F : [F]) : [];
        children: ObjectChildren<V>;
        recursive: V extends { $recursive: true | number } ? true : false;
        all: V extends { $allRecursive: true } ? true : false;
        maybe: false;
      };
