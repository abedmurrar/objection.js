# Releasing `@abedmurrar/objection`

Releases are published to npm by GitHub Actions when a version tag is pushed. Nothing is published from a laptop.

## Versions

The package follows [semver](https://semver.org). `4.0.0` is the first stable release, after `4.0.0-alpha.0` and the `4.0.0-beta.N` prereleases. Releases use `npm run release -- patch` for fixes and `npm run release -- minor` for new features. A prerelease of the next version, like `npm run release -- 4.1.0-beta.0`, goes to `next`.

| Version                      | npm dist-tag | Install with                             |
| ---------------------------- | ------------ | ---------------------------------------- |
| prerelease (`4.0.0-alpha.1`) | `next`       | `npm install @abedmurrar/objection@next` |
| release (`4.0.0`)            | `latest`     | `npm install @abedmurrar/objection`      |

Breaking changes need a major version, including breaking changes to the TypeScript types.

## Changelog

Every change that users can notice gets a line under `## Unreleased` in [doc/release-notes/changelog.md](doc/release-notes/changelog.md), in the same commit as the change. Use the existing groups: `### Security`, `### Breaking changes` and `### What's new`. Breaking changes also get a section in [doc/release-notes/migration.md](doc/release-notes/migration.md) with a before and after.

The release script turns `## Unreleased` into `## <version> (<date>)`. The GitHub release gets the notes of that section.

## One-time setup

1. In the GitHub repository `abedmurrar/objection.js`, enable GitHub Actions (forks have them turned off).
2. On npmjs.com, signed in as [`abedmurrar`](https://www.npmjs.com/~abedmurrar), open the settings of `@abedmurrar/objection` and add a [trusted publisher](https://docs.npmjs.com/trusted-publishers): GitHub Actions, user `abedmurrar`, repository `objection.js`, workflow `release.yml`, no environment. It works on GitHub-hosted runners, with npm 11.5.1 or later.

The `release` workflow then publishes with a short-lived token that npm issues for that workflow run, so no npm token is stored in GitHub. Provenance is created for each release, which needs the repository to be public and the `repository` URL in `package.json` to stay `https://github.com/abedmurrar/objection.js`. The trusted publisher's fields are case-sensitive, and the workflow name includes `.yml`. Once publishing works this way, the package can be set to require 2FA and disallow tokens.

## Making a release

1. Make sure `main` has everything that should be released, and that CI is green on it.
2. Prepare the release. This checks lint, types and unit tests, bumps the version in `package.json`, dates the changelog, and makes a commit and a tag. It doesn't push anything.

   ```sh
   npm run release -- 4.0.0-alpha.0   # an exact version
   npm run release -- prerelease      # 4.0.0-alpha.0 -> 4.0.0-alpha.1
   npm run release -- major           # 4.0.0-alpha.3 -> 4.0.0
   npm run release -- prerelease --dry-run
   ```

3. Push the commit and the tag:

   ```sh
   git push origin main --follow-tags
   ```

4. The `release` workflow runs all tests (SQLite, Postgres, MySQL 8.4 and MariaDB 10.6 and 11.4, on Node.js 24 and 26), checks that the tag matches `package.json`, publishes to npm with provenance under the dist-tag from the table above, and creates the GitHub release.

If the workflow fails before publishing, fix the problem on `main`, delete the tag (`git push origin :refs/tags/v<version>` and `git tag -d v<version>`), and release the next version. A published version can't be republished.
