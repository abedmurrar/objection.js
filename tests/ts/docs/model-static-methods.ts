// Examples of doc/api/model/static-methods.md.
import { type AnyQueryBuilder, Model } from '../../../';
import { expectType } from '../_utils/expect';

// `modifierNotFound()`: select a column of the JSON schema for a modifier of
// the same name, and throw for the other unknown modifiers.
class BaseModel extends Model {
  static override modifierNotFound(builder: AnyQueryBuilder, modifier: string) {
    const properties = this.jsonSchema?.properties;

    if (properties && modifier in properties) {
      builder.select(modifier);
    } else {
      super.modifierNotFound(builder, modifier);
    }
  }
}

class Person extends BaseModel {
  static override tableName = 'persons';
  static override jsonSchema = {
    type: 'object',
    properties: { id: { type: 'integer' }, name: { type: 'string' } },
  };

  id!: number;
  name!: string;
}

export function modifierNotFound() {
  expectType<void>()(Model.modifierNotFound(Person.query(), 'name'));
  return Person.query().modify('name');
}
