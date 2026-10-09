# Publishing

The packages that other developers use, `@amends/harness`, `@amends/sandbox`, and the sandbox
providers `@amends/sandbox-local` and `@amends/sandbox-daytona` so far, are published to npm from
this repository. The repository's manifests keep pointing at sources,
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
would be published. It needs an npm login with publish rights on the `@amends` scope; `npm login`
provides one, and Bun reads it.

## Conventions

- A published package's manifest carries `version`, `description`, `license` (MIT), `homepage`,
  `repository` with its `directory`, `bugs`, `keywords`, and `publishConfig.access: public`. It is
  not `private`; nothing publishes from the repository's manifests, only `bun run dist`.
- Effect is a peer dependency, declared `catalog:` as every Effect dependency is, which the
  distribution turns into the caret range of the catalog's version. A workspace dependency is
  declared `workspace:*` and becomes the caret range of that package's version.
- Every export carries `@since` with the version that introduced it, which starts at the first
  published version, and `@category`, for the documentation generated from them.
- Each package has a `LICENSE`, a `README.md` that opens with install and usage, and a
  `tsconfig.build.json` extending the base configuration with emit turned on.

## Order and versions

Publish a package after the workspace packages it depends on: `@amends/sandbox` before
`@amends/harness` and the sandbox providers. Bump a package's `version` by hand before publishing
it, and tag the commit.
