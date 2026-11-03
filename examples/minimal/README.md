# Minimal example project.

This example has the bare minimum to get you running queries and testing out things with objection. If you want to see a more realistic example, with multiple models, relations, a REST API etc. check out the [koa example](https://github.com/abedmurrar/objection.js/tree/main/examples/koa)

The example depends on `@abedmurrar/objection` under the name `objection` (`"objection": "npm:@abedmurrar/objection@^4.0.3"`), so the code imports it from `'objection'`.

# Install and run

```sh
git clone git@github.com:abedmurrar/objection.js.git objection
cd objection/examples/minimal
npm install
npm start
```

If `npm start` fails to load sqlite3 with a `GLIBC_2.38` error, your Linux has an older glibc than the prebuilt binary needs. Build sqlite3 from source with `npm rebuild sqlite3 --build-from-source`.
