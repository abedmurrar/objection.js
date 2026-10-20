// Error message tests. See scripts/typings-errors.js.
import { Model } from '../../';

class Person extends Model {
  firstName!: string;
  lastName!: string;
  address?: { street: string };
}

// @error: Argument of type '"middleName"' is not assignable to parameter of type '"*" | "firstName" | "lastName" | "address" |
Person.ref('middleName');

// @error: Argument of type '"address:zip"' is not assignable to parameter of type
Person.ref('address:zip');
