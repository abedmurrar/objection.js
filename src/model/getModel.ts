import type * as ModelModule from './Model';

// A small helper method for cached lazy-importing of the Model class.
let Model: typeof ModelModule.Model | undefined;
const getModel = (): typeof ModelModule.Model =>
  Model || (Model = (require('./Model') as typeof ModelModule).Model);

export { getModel };
