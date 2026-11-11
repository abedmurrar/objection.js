# Validation

[JSON schema](https://json-schema.org/) validation can be enabled by setting the [jsonSchema](/api/model/static-properties.html#static-jsonschema) property of a model class. The validation is ran each time a [Model](/api/model/) instance is created.

You rarely need to call [\$validate](/api/model/instance-methods.html#validate) method explicitly, but you can do it when needed. If validation fails a [ValidationError](/api/types/#class-validationerror) will be thrown. Since we use Promises, this usually means that a promise will be rejected with an instance of [ValidationError](/api/types/#class-validationerror).

See [the recipe book](/recipes/custom-validation.html) for instructions if you want to use some other validation library.

## Examples

All these will trigger the validation:

```js
Person.fromJson({ firstName: 'jennifer', lastName: 'Lawrence' });
await Person.query().insert({ firstName: 'jennifer', lastName: 'Lawrence' });
await Person.query()
  .update({ firstName: 'jennifer', lastName: 'Lawrence' })
  .where('id', 10);

// Patch operation ignores the `required` property of the schema
// and only validates the given properties. This allows a subset
// of model's properties to be updated.
await Person.query()
  .patch({ age: 24 })
  .where('age', '<', 24);

await Person.query().insertGraph({
  firstName: 'Jennifer',
  pets: [
    {
      name: 'Fluffy'
    }
  ]
});

await Person.query().upsertGraph({
  id: 1,
  pets: [
    {
      name: 'Fluffy II'
    }
  ]
});
```

Validation errors provide detailed error message:

```js
try {
  await Person.query().insert({ firstName: 'jennifer' });
} catch (err) {
  console.log(err instanceof objection.ValidationError); // --> true
  console.log(err.data); // --> {lastName: [{message: "must have required property 'lastName'", ...}]}
}
```

Error parameters returned by [ValidationError](/api/types/#class-validationerror) could be used to provide custom error messages:

```js
try {
  await Person.query().insert({ firstName: 'jennifer' });
} catch (err) {
  let lastNameErrors = err.data.lastName;

  for (let i = 0; i < lastNameErrors.length; ++i) {
    let lastNameError = lastNameErrors[i];

    if (lastNameError.keyword === 'required') {
      console.log('This field is required!');
    } else if (lastNameError.keyword === 'minLength') {
      console.log('Must be longer than ' + lastNameError.params.limit);
    } else {
      console.log(lastNameError.message); // Fallback to default error message
    }
  }
}
```

## Validation in graph writes

[insertGraph](/api/query-builder/mutate-methods.html#insertgraph) and [upsertGraph](/api/query-builder/mutate-methods.html#upsertgraph) validate each model in the graph on its own, without its relation properties. [insert](/api/query-builder/mutate-methods.html#insert) and [patch](/api/query-builder/mutate-methods.html#patch) validate the input with the relation properties in it. So a schema rule or a [\$beforeValidate](/api/model/instance-methods.html#beforevalidate) check on a relation property gives different results:

| `Person` has                       | `insert()`, `patch()`              | `insertGraph()`, `upsertGraph()`                                                                |
| ---------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `required: ['pets']`               | passes when `pets` is given        | fails, `pets` is never there (patches in `upsertGraph()` skip `required` and pass)              |
| `properties.pets: { minItems: 2 }` | checked                            | not checked                                                                                     |
| `$beforeValidate(schema, json)`    | `json.pets` is the input array     | `json.pets` is `undefined`                                                                      |

Put rules about the related rows in the related model's schema: graph writes check it for every row they insert or update. A rule about how many related rows there are can't be checked by the validator in a graph write: check it before the query, or in a [transaction](/guide/transactions.html) after it.

This is how objection.js has always worked. It will change in 5.0, so that graph writes validate with the relations like `insert()` does.
