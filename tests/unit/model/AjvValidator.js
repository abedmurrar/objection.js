const addFormats = require('ajv-formats');
const { AjvValidator, Model } = require('../../../');
const expect = require('expect.js');

function modelClass(tableName, schema) {
  return class TestModel extends Model {
    static get tableName() {
      return tableName;
    }
    static get jsonSchema() {
      return schema;
    }
  };
}

describe('AjvValidator', () => {
  describe('patch validator', () => {
    const schema = {
      definitions: {
        TestRef1: {
          type: 'object',
          properties: {
            aRequiredProp1: { type: 'string' },
          },
          required: ['aRequiredProp1'],
        },
        TestRef2: {
          type: 'object',
          properties: {
            aRequiredProp2: { type: 'string' },
          },
          required: ['aRequiredProp2'],
        },
      },
      anyOf: [{ $ref: '#/definitions/TestRef1' }, { $ref: '#/definitions/TestRef2' }],
    };

    const schema2 = {
      type: 'object',
      discriminator: { propertyName: 'foo' },
      required: ['bar', 'foo'],
      properties: {
        bar: {
          type: 'string',
        },
      },
      oneOf: [
        {
          properties: {
            foo: { const: 'x' },
            a: { type: 'string' },
          },
          required: ['a'],
        },
        {
          properties: {
            foo: { enum: ['y', 'z'] },
            b: { type: 'string' },
          },
          required: ['b'],
        },
      ],
    };

    const schema3 = {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          format: 'date-time',
        },
      },
    };

    const schema4 = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          required: ['city'],
          properties: {
            city: {
              type: 'string',
            },
            zip: {
              type: 'string',
            },
            street: {
              type: 'string',
            },
          },
        },
      },
    };

    it('should remove required fields from definitions', () => {
      const validator = new AjvValidator({});
      const validators = validator.getValidator(modelClass('test', schema), schema, true);
      const definitions = Object.entries(validators.schema.definitions);

      expect(definitions.length).to.be(2);
      definitions.forEach((d) => expect(d.required).to.be(undefined));
    });

    it('should not remove required fields if there is a discriminator', () => {
      const validator = new AjvValidator({
        options: {
          discriminator: true,
        },
      });
      const validators = validator.getValidator(modelClass('test', schema2), schema2, true);
      expect(validators.schema.required).to.eql(['foo']);
    });

    it('should add ajv formats by default', () => {
      expect(() => {
        const validator = new AjvValidator({});
        validator.getValidator(modelClass('test', schema3), schema3, true);
      }).to.not.throwException();
    });

    it('should remove required fields in inner properties', () => {
      const validator = new AjvValidator({});
      const validators = validator.getValidator(modelClass('test', schema4), schema4, true);
      expect(validators.schema.properties.address.properties).to.not.be(undefined);
      expect(validators.schema.properties.address.required).to.be(undefined);
    });

    it('should not throw errors when adding formats in onCreateAjv hook', () => {
      expect(() => {
        new AjvValidator({
          onCreateAjv: (ajv) => {
            addFormats(ajv);
          },
        });
      }).to.not.throwException();
    });

    it('should handle empty definitions', () => {
      const emptyDefinitionsSchema = {
        type: 'object',
        required: ['a'],
        definitions: {},
        additionalProperties: false,
        properties: {
          a: { type: 'string' },
        },
      };
      const validator = new AjvValidator({});
      validator.getValidator(
        modelClass('test', emptyDefinitionsSchema),
        emptyDefinitionsSchema,
        true,
      );
    });
  });

  describe('patch validation schemas', () => {
    function patchValidator(schema) {
      return new AjvValidator({}).getValidator(modelClass('test', schema), schema, true);
    }

    it('should keep required fields inside not', () => {
      const schema = {
        oneOf: [{ not: { required: ['a'] } }],
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.oneOf).to.eql([{ not: { required: ['a'] } }]);
      expect(validate({ b: 'str' })).to.be(true);
      expect(validate({ a: 'str' })).to.be(false);
    });

    it('should keep top-level not schemas intact', () => {
      const schema = {
        type: 'object',
        required: ['a'],
        not: { required: ['b', 'c'] },
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          c: { type: 'string' },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.required).to.be(undefined);
      expect(validate.schema.not).to.eql({ required: ['b', 'c'] });
      expect(validate({ b: 'str' })).to.be(true);
      expect(validate({ b: 'str', c: 'str' })).to.be(false);
    });

    it('should remove required fields in inner properties of nullable objects', () => {
      const schema = {
        type: 'object',
        properties: {
          address: {
            type: ['object', 'null'],
            required: ['city'],
            properties: {
              city: { type: 'string' },
              zip: { type: 'string' },
              inner: {
                type: 'object',
                required: ['a'],
                properties: { a: { type: 'string' } },
              },
            },
          },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.properties.address.required).to.be(undefined);
      expect(validate.schema.properties.address.properties.inner.required).to.be(undefined);
      expect(validate({ address: { zip: '123', inner: {} } })).to.be(true);
      expect(validate({ address: null })).to.be(true);
      expect(validate({ address: { zip: 123 } })).to.be(false);
    });

    it('should remove required fields in inner properties of untyped schemas', () => {
      const schema = {
        required: ['address'],
        properties: {
          address: {
            required: ['city'],
            properties: {
              city: { type: 'string' },
              zip: { type: 'string' },
            },
          },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.required).to.be(undefined);
      expect(validate.schema.properties.address.required).to.be(undefined);
      expect(validate({ address: { zip: '123' } })).to.be(true);
      expect(validate({ address: { zip: 123 } })).to.be(false);
    });

    it('should keep properties named like schema keywords in untyped schemas', () => {
      const schema = {
        properties: {
          required: { type: 'string' },
          not: { type: 'string' },
          anyOf: { type: 'string' },
          properties: { type: 'string' },
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.properties).to.eql(schema.properties);
      expect(validate({ required: 'a', not: 'b', anyOf: 'c', properties: 'd' })).to.be(true);
      expect(validate({ required: 1 })).to.be(false);
      expect(validate({ not: 1 })).to.be(false);
      expect(validate({ anyOf: 1 })).to.be(false);
      expect(validate({ properties: 1 })).to.be(false);
    });
    for (const prop of ['anyOf', 'oneOf']) {
      it(`should not require patches to match other ${prop} options if one only has required`, () => {
        const schema = {
          [prop]: [{ required: ['a'] }, { required: ['b'], properties: { b: { type: 'number' } } }],
          properties: {
            a: { type: 'string' },
            b: {},
          },
        };
        const validate = patchValidator(schema);
        expect(validate.schema[prop]).to.be(undefined);
        expect(validate({ a: 'str', b: 'str' })).to.be(true);
        expect(validate({ b: 1 })).to.be(true);
        expect(validate({ a: 1 })).to.be(false);
      });

      it(`should not require nested objects to match other ${prop} options if one only has required`, () => {
        const schema = {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              [prop]: [
                { required: ['a'] },
                { required: ['b'], properties: { b: { type: 'number' } } },
              ],
              properties: {
                a: { type: 'string' },
                b: {},
              },
            },
          },
        };
        const validate = patchValidator(schema);
        expect(validate.schema.properties.data[prop]).to.be(undefined);
        expect(validate({ data: {} })).to.be(true);
        expect(validate({ data: { b: 1 } })).to.be(true);
        expect(validate({ data: { b: 'str' } })).to.be(true);
        expect(validate({ data: { a: 1 } })).to.be(false);
      });
    }

    it('should keep allOf options that still have constraints', () => {
      const schema = {
        allOf: [{ required: ['a'] }, { required: ['b'], properties: { b: { type: 'number' } } }],
      };
      const validate = patchValidator(schema);
      expect(validate.schema.allOf).to.eql([{ properties: { b: { type: 'number' } } }]);
      expect(validate({ b: 'str' })).to.be(false);
    });

    it('should keep boolean schemas', () => {
      const schema = {
        type: 'object',
        required: ['a'],
        properties: {
          a: { type: 'string' },
          b: false,
          c: true,
          d: { anyOf: [false, { type: 'string', required: ['x'] }] },
          e: { if: { type: 'string' }, then: false },
        },
        definitions: {
          f: false,
        },
      };
      const validate = patchValidator(schema);
      expect(validate.schema.properties.b).to.be(false);
      expect(validate.schema.properties.c).to.be(true);
      expect(validate.schema.properties.d.anyOf).to.eql([false, { type: 'string' }]);
      expect(validate.schema.properties.e.then).to.be(false);
      expect(validate.schema.definitions.f).to.be(false);
      expect(validate({ a: 'str', c: 1, d: 'str', e: 1 })).to.be(true);
      expect(validate({ b: 1 })).to.be(false);
      expect(validate({ d: 1 })).to.be(false);
      expect(validate({ e: 'str' })).to.be(false);
    });

    const schemaBis = {
      $defs: {
        TestRef1: {
          type: 'object',
          properties: {
            aRequiredProp1: { type: 'string' },
          },
          required: ['aRequiredProp1'],
        },
        TestRef2: {
          type: 'object',
          properties: {
            aRequiredProp2: { type: 'string' },
          },
          required: ['aRequiredProp2'],
        },
      },
      anyOf: [{ $ref: '#/$defs/TestRef1' }, { $ref: '#/$defs/TestRef2' }],
    };

    it('should remove required fields from $defs', () => {
      const validator = new AjvValidator({ onCreateAjv: () => {} });
      const validators = validator.getValidator(modelClass('test', schemaBis), schemaBis, true);
      const $defs = Object.values(validators.schema.$defs);

      expect($defs.length).to.be(2);
      $defs.forEach((d) => expect(d.required).to.be(undefined));
    });

    it('should handle empty $defs', () => {
      const emptyDefinitionsSchema = {
        type: 'object',
        required: ['a'],
        $defs: {},
        additionalProperties: false,
        properties: {
          a: { type: 'string' },
        },
      };
      const validator = new AjvValidator({ onCreateAjv: () => {} });
      validator.getValidator(
        modelClass('test', emptyDefinitionsSchema),
        emptyDefinitionsSchema,
        true,
      );
    });
  });
});
