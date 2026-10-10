# Publishing

The packages that other developers use, the contracts `@amends-dev/harness`, `@amends-dev/sandbox`,
and `@amends-dev/channel`, the sandbox providers `@amends-dev/sandbox-local` and
`@amends-dev/sandbox-daytona`, and the agents `@amends-dev/harness-amends` and
`@amends-dev/harness-opencode` so far, are published to npm from this repository, at
[amends-dev/amends](https://github.com/amends-dev/amends). The repository's manifests keep pointing at sources,
which the workspace consumes as they are; what npm gets is a package's distribution, which
`bun run dist` builds, checks, and publishes.

## The distribution

`bun run dist build packages/harness` compiles the package's sources with its
`tsconfig.build.json` into `dist/`: JavaScript with the import extensions rewritten, declarations,
and source maps. Beside them it writes the distribution's manifest, from the repository's: the
same fields, with `exports` pointing at the compiled files, `workspace:*` and `catalog:`
versions resolved to caret ranges of the versions the workspace uses, and without the scripts and
development dependencies. The README and the LICENSE go with it. `dist/` is ignored by Git, lint,
and formatting.

`bun run dist check packages/harness` builds the package and the workspace packages it depends on,
then typechecks and runs a project that depends on the distribution as one that installed it from
npm would: the distributions copied into its `node_modules`, Effect linked from the workspace,
under TypeScript's `bundler` and `nodenext` resolutions, and on Bun and Node. Run it before
publishing, and after changing a manifest or a build configuration.

`bun run dist publish packages/harness` builds and publishes `dist/`, with `--dry-run` to see what
would be published. It needs an npm login with publish rights on the `@amends-dev` scope;
`npm login` provides one, and Bun reads it.

## Conventions

- A published package's manifest carries `version`, `description`, `license` (MIT), `homepage`,
  `repository` with its `directory`, `bugs`, `keywords`, and `publishConfig.access: public`. It is
  not `private`; nothing publishes from the repository's manifests, only `bun run dist`.
- Effect is a peer dependency, declared `catalog:` as every Effect dependency is, which the
  distribution turns into the caret range of the catalog's version. A workspace dependency is
  declared `workspace:*` and becomes the caret range of that package's version.
- Every export carries `@since` with the version that introduced it, which starts at the first
  published version, and `@category`, for the [documentation](#the-documentation) generated from
  them.
- Each package has a `LICENSE`, a `README.md` that opens with install and usage, and a
  `tsconfig.build.json` extending the base configuration with emit turned on.

## The documentation

The [site](../apps/site/README.md) builds each package's documentation for
`amends.dev/docs`: its README as the package's guide, and an API reference that `@effect/docgen`
generates from its doc comments, a page for each module, leaving out `internal` modules. The site
lists every package whose manifest is published, so a new one appears there without changes to
the site. Its build runs docgen, which typechecks the examples in doc comments, so an export
without `@since` or an example that no longer compiles fails the build, in CI too.

## Order and versions

Publish a package after the workspace packages it depends on: `@amends-dev/sandbox` before
`@amends-dev/harness` and the sandbox providers, and both before the agents. `@amends-dev/channel`
depends on none of them. Bump a package's `version` by hand before publishing it, and tag the
commit.
