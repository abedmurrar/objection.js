// Error message tests for `stream()`. See scripts/typings-errors.js.
import { Model } from '../../';

class Person extends Model {
  static tableName = 'persons';

  id!: number;
}

// Queries that return one model, a page or a count can't be streamed.
// @error: The 'this' context of type
Person.query().first().stream();
// @error: The 'this' context of type
Person.query().findById(1).stream();
// @error: The 'this' context of type
Person.query().page(0, 10).stream();
// @error: The 'this' context of type
Person.query().patch({ id: 1 }).stream();
