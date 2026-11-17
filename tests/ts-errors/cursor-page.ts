// Error message tests for `cursorPage()`. See scripts/typings-errors.js.
import { Model } from '../../';

class Person extends Model {
  static tableName = 'persons';

  id!: number;
}

// @error: Argument of type 'string' is not assignable to parameter of type 'number'
Person.query().cursorPage('20');
// @error: Argument of type 'number' is not assignable to parameter of type 'string'
Person.query().cursorPage(20, 5);
// A page can't be streamed.
// @error: The 'this' context of type
Person.query().cursorPage(20).stream();
