// Type assertion helpers for the typings tests.
//
// Assignability checks like `const x: Person[] = await query` can't detect `any`
// or types that are wider than expected. Use these instead:
//
//   type _ = Expect<Equal<typeof result, Person[]>>;
//   expectType<Person[]>()(await query);

export type IsAny<T> = 0 extends 1 & T ? true : false;

export type IsUnknown<T> = unknown extends T ? (IsAny<T> extends true ? false : true) : false;

export type IsNever<T> = [T] extends [never] ? true : false;

// Exact type equality. `any` is only equal to `any`.
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export type Expect<T extends true> = T;

export type Not<T extends boolean> = T extends true ? false : true;

// Flattens intersections so that types built from intersections can be
// compared with `Equal` against plain object types.
export type Flatten<T> = T extends object ? { [K in keyof T]: T[K] } : T;

// Asserts that the type of the argument is exactly `E`.
//
//   expectType<Person[]>()(await Person.query());
export function expectType<E>() {
  return <A>(_value: A, ..._mismatch: Equal<E, A> extends true ? [] : ['type mismatch', A]) => {};
}
