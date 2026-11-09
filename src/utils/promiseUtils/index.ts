import { after as afterImpl } from './after';
import { afterReturn as afterReturnImpl } from './afterReturn';
import { isPromise as isPromiseImpl } from './isPromise';
import { promiseMap } from './map';
import { mapAfterAllReturn as mapAfterAllReturnImpl } from './mapAfterAllReturn';

// Re-exporting imported bindings makes tsc define the exports as getters,
// which puts this module's exports object in V8's slow dictionary mode and
// makes every call through it several times slower. Local constants are
// exported as plain properties instead.
const isPromise = isPromiseImpl;
const after = afterImpl;
const afterReturn = afterReturnImpl;
const mapAfterAllReturn = mapAfterAllReturnImpl;
const map = promiseMap;

export { after, afterReturn, isPromise, map, mapAfterAllReturn };
