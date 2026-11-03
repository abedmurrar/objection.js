# Koa typescript example project

This is an example project that targets Node.js 24 and up. The project is a simple Koa server with a REST API that demonstrates the basic functionalities of objection like models, queries, relations, eager loading and graph inserts.

The models use the TypeScript patterns of the fork: the types of the relation properties are inferred from `relationMappings`, so they aren't declared in the classes. See [TypeScript](https://abedmurrar.github.io/objection.js/fork/typescript).

Note that this is not an example of how to build a web server. It's an example of how to use objection in a web server. All other aspects are kept as simple and minimal as possible.

The example depends on `@abedmurrar/objection` under the name `objection` (`"objection": "npm:@abedmurrar/objection@^4.0.3"`), so the code imports it from `'objection'`.

# Install and run

```sh
git clone git@github.com:abedmurrar/objection.js.git objection
cd objection/examples/koa-ts
npm install
npm start
```

If `npm start` fails to load sqlite3 with a `GLIBC_2.38` error, your Linux has an older glibc than the prebuilt binary needs. Build sqlite3 from source with `npm rebuild sqlite3 --build-from-source`.

`npm start` keeps the server running. Run the example requests in another terminal:

```sh
node client.js
```
