// The `childQueryOf()` options of the queries that graph operations run on
// their own: they get a copy of the parent query's context, marked internal.
const INTERNAL_CHILD_QUERY = Object.freeze({ fork: true, isInternalQuery: true });

export { INTERNAL_CHILD_QUERY };
