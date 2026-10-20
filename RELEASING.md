# Releasing `@amurrar/objection`

Releases are published to npm by GitHub Actions when a version tag is pushed. Nothing is published from a laptop.

## Versions

The package follows [semver](https://semver.org). Until 4.0 is done, releases are prereleases: `4.0.0-alpha.0`, `4.0.0-alpha.1`, ... and then `4.0.0-beta.0` or `4.0.0`.

| Version                      | npm dist-tag | Install with                          |
| ---------------------------- | ------------ | ------------------------------------- |
| prerelease (`4.0.0-alpha.1`) | `next`       | `npm install @amurrar/objection@next` |
| release (`4.0.0`)            | `latest`     | `npm install @amurrar/objection`      |

Breaking changes need a major version, including breaking changes to the TypeScript types.

## Changelog

Every change that users can notice gets a line under `## Unreleased` in [doc/release-notes/changelog.md](doc/release-notes/changelog.md), in the same commit as the change. Use the existing groups: `### Security`, `### Breaking changes` and `### What's new`. Breaking changes also get a section in [doc/release-notes/migration.md](doc/release-notes/migration.md) with a before and after.

The release script turns `## Unreleased` into `## <version> (<date>)`. The GitHub release gets the notes of that section.

## One-time setup

1. On npmjs.com, signed in as [`abedmurrar`](https://www.npmjs.com/~abedmurrar), create the organization `amurrar` (Add organization → the free plan, which is for public packages). A scope has to be a user name or an organization, and `@amurrar` isn't the user name, so the organization owns the scope. The account that creates it is its owner.
2. Create an access token that can publish to the scope: a granular access token with read and write access to the `@amurrar` scope (the package doesn't exist before the first release, so it can't be selected yet). If the account uses 2FA for publishing, allow the token to bypass it.
3. In the GitHub repository `abedmurrar/objection.js`, add the token as the secret `NPM_TOKEN` (Settings → Secrets and variables → Actions).
4. Optionally, after the first release, set up [trusted publishing](https://docs.npmjs.com/trusted-publishers) for the `release.yml` workflow on the package's settings page and remove the token.

Provenance needs the GitHub repository to be public.

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

4. The `release` workflow runs all tests (SQLite, Postgres and MySQL 8.4, on node 18 to 24), checks that the tag matches `package.json`, publishes to npm with provenance under the dist-tag from the table above, and creates the GitHub release.

If the workflow fails before publishing, fix the problem on `main`, delete the tag (`git push origin :refs/tags/v<version>` and `git tag -d v<version>`), and release the next version. A published version can't be republished.
