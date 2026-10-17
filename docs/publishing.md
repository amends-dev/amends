# Publishing

The packages that other developers use, the contracts `@amends-dev/harness`, `@amends-dev/sandbox`,
and `@amends-dev/channel`, and their [sandbox and harness adapters](../adapters/README.md), are
published to npm from this repository, at
[amends-dev/amends](https://github.com/amends-dev/amends). The repository's manifests keep pointing
at sources, which the workspace consumes as they are; what npm gets is a package's distribution,
which `bun run dist` builds and checks. [Changesets](https://github.com/changesets/changesets)
versions the packages and publishes their distributions, from the release workflow.

## The distribution

`bun run dist build packages/harness` compiles the package's sources with its
`tsconfig.build.json` into `dist/`: JavaScript with the import extensions rewritten, declarations,
and source maps. Beside them it writes the distribution's manifest, from the repository's: the
same fields, with `exports` pointing at the compiled files, `workspace:` and `catalog:` versions
resolved as Bun publishes them, and without the scripts and development dependencies. The README
and the LICENSE go with it. `dist/` is ignored by Git, lint, and formatting. Without a directory,
`bun run dist build` builds every published package.

`bun run dist check packages/harness` builds the package and the workspace packages it depends on,
then typechecks and runs a project that depends on the distribution as one that installed it from
npm would: the distributions copied into its `node_modules`, and its other dependencies, Effect
among them, installed from npm at the newest versions the distributions allow, under TypeScript's
`bundler` and `nodenext` resolutions, and on Bun and Node. Without a directory, it checks every
published package, as CI does for each pull request. It imports each package and runs nothing else
of it, so a change in Effect that breaks a call shows in the weekly check against the newest
Effect, which [testing](testing.md#continuous-integration) describes.
`npm pack --dry-run packages/harness/dist` lists what npm would get.

## Versions

The published packages release in lines. They share a version's major and minor, `0.3`, so a
package works with every other on its line, and a fix releases its own package alone, as `0.3.4`.
A package that starts a line, with a minor or, from 1.0, a major release, starts it for all of
them: they all move to `0.4.0` together. Before 1.0, a breaking change is a minor release.

A published package depends on another with `workspace:^`, which its distribution turns into a
caret range of that package's version, `^0.3.0`, which every later fix on the line satisfies. So a
fix to `@amends-dev/sandbox` releases no other package. `bun run check:packages` fails when the
published packages are on different lines, when one links to another with a range other than
`workspace:^`, or when one's `publishConfig.directory` is not `dist`.

## Releasing

A pull request that changes a published package adds a changeset: run `bun changeset`, choose the
packages and their bumps, describe the change as its readers need it, and commit the file it writes
under `.changeset/`. A change that no published package's users can see needs none.

The [release workflow](../.github/workflows/release.yml) runs on every push to main. While
changesets are pending, it keeps a pull request named "Release the packages" open, made by
`bun run changeset-version`: it adds a changeset for the packages a new line would leave behind,
then Changesets writes the versions and each package's `CHANGELOG.md`. Merging that pull request
publishes: `bun run changeset-publish` builds every distribution, and Changesets publishes each
package whose version npm does not have yet, the packages it depends on first, from the
`publishConfig.directory` its manifest names. It tags each `@amends-dev/<name>@<version>`, and the
workflow creates its GitHub release.

The workflow publishes through npm's
[trusted publishing](https://docs.npmjs.com/trusted-publishers): npm trusts `release.yml` in this
repository's `npm` environment, which only main may use, so no npm token is stored anywhere, and
each version carries provenance that links it to the commit and run that built it.
[`stacks/github.ts`](../stacks/github.ts) declares that environment, the token the workflow opens
the release pull request with, and the ruleset that lets main change only through pull requests
whose checks pass.

## A new package

npm trusts a workflow for a package only once the package exists, so a new package's first version
is published by a maintainer, with two-factor authentication. Give it the current line's `.0`
version, and once it is merged:

1. From main, log in with `npm login` and run `bun run changeset-publish`, which publishes only the
   versions npm does not have, then push the tag it made with `git push origin --tags`.
2. Trust the workflow to publish it, with npm 11.15 or later:

   ```sh
   npm trust github @amends-dev/<name> --file release.yml --repository amends-dev/amends --environment npm --allow-publish --yes
   ```

3. In the package's settings on npm, require two-factor authentication and disallow tokens, so
   that only a maintainer or the workflow can publish it.

The release run that the merge starts fails on the new package, since npm cannot trust the workflow
for a package it does not have; once a maintainer has published it, later runs find it published.

## Conventions

- A published package's manifest carries `version`, `description`, `license` (MIT), `homepage`,
  `repository` with its `directory`, `bugs`, `keywords`, and `publishConfig` with `access: public`
  and `directory: dist`. It is not `private`; what npm gets is its distribution, never the
  repository's manifest.
- Effect is a peer dependency, declared `catalog:` as every Effect dependency is, which the
  distribution turns into the caret range of the catalog's version.
- Every export carries `@since` with the version that introduced it, which starts at the first
  published version, and `@category`, for the [documentation](#the-documentation) generated from
  them.
- An export's doc opens with a sentence that says what it is. What a reader needs beyond it goes
  under `**Details**`, and a module's main export shows its use under `**Example** (what it
shows)`, as Effect's documentation does.
- Each package has a `LICENSE`, a `README.md` that opens with install and usage, and a
  `tsconfig.build.json` extending the base configuration with emit turned on.

## The documentation

The [site](../apps/site/README.md) builds each package's documentation for
`amends.dev/docs`: its README as the package's guide, and an API reference that `@effect/docgen`
generates from its doc comments, a page for each module, leaving out `internal` modules. The site
lists every package whose manifest is published, so a new one appears there without changes to
the site. Its build runs docgen, which typechecks the examples in doc comments, so an export
without `@since` or an example that no longer compiles fails the build, in CI too.
