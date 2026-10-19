// Error message tests. See scripts/typings-errors.js.
import { Model } from '../../';

class Person extends Model {
  firstName!: string;
}

async () => {
  // @error: Property 'lastName' does not exist on type 'Person'
  (await Person.query())[0].lastName;
};
