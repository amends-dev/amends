# amends-v2

A Bun and TypeScript monorepo using Effect **4.0.0-rc.115**, the latest `rc`
published when this setup was created on September 16, 2026. The root workspace
catalog pins Effect versions, and `bun.lock` records all resolved dependencies.

```bash
bun install --frozen-lockfile
bun run start
bun run check
```

`bun run start` runs the local Bun host's persistent two-workspace demonstration,
and `bun run dev` reruns it when files change. Each demonstration creates two new
workspaces and exercises invitation, acceptance, limited access, and revocation.
See the [local host guide](hosts/local/README.md) for individual commands, storage
configuration, and the trusted local identity boundary.

## Workspace layout

```text
packages/
  core/             @amends/core: portable journal and workspace domain services
hosts/
  local/            @amends/host-local: Bun runtime entry point
apps/               future user-facing clients, such as web and desktop
scripts/            repository tooling
repos/effect/       upstream Effect reference source
```

[Bun workspaces](https://bun.com/docs/pm/workspaces) discover packages under
`packages/*`, `hosts/*`, and `apps/*`. Each workspace has its own manifest,
TypeScript configuration, and scripts. One install and lockfile serve the repository.

Shared packages may depend only on `effect` and other packages under `packages/`.
Internal dependencies use `workspace:*`; Effect dependencies use `catalog:`.
The restriction covers dependencies, devDependencies, peerDependencies, and
optionalDependencies. `bun run check:packages` validates these declarations.
Keep development tooling in the root package and platform dependencies in hosts
or apps. Shared packages cannot depend on hosts or apps.

`tsconfig.base.json` supplies strict TypeScript and Effect tooling settings with
no runtime globals. Hosts and apps enable their own runtime types. The root
`tsconfig.json` checks repository scripts and core tests, and `bun run typecheck`
also runs each workspace's `typecheck` script. Workspace exports point to TypeScript source,
which Bun and future application bundlers can consume directly.

The journal and execution-log design is described in [docs/journal.md](docs/journal.md).
Run core and persistent-host checks with `bun test packages/core/test hosts/local/test`.

For a new workspace, add a manifest, source files, and a TypeScript configuration
extending `../../tsconfig.base.json`, plus a `typecheck` script. Then run
`bun install` from the root. See [packages](packages/README.md),
[hosts](hosts/README.md), and [apps](apps/README.md) for their responsibilities.

## Development tools

The project pins TypeScript **7.0.2**, Oxlint **1.83.0**, Oxfmt **0.68.0**,
`oxlint-tsgolint` **7.0.2001**, and `@effect/tsgo` **0.45.0**. These were the
latest stable tooling releases available when configured.

| Command                  | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `bun run typecheck`      | TypeScript 7 checks plus Effect diagnostics           |
| `bun run lint`           | Oxlint with type-aware rules; warnings fail the check |
| `bun run lint:fix`       | Apply safe lint fixes                                 |
| `bun run format`         | Format project files with Oxfmt                       |
| `bun run format:check`   | Check formatting without writing files                |
| `bun run check`          | Validate dependencies, types, lint, and formatting    |
| `bun run check:packages` | Validate shared-package dependency boundaries         |

Following the [Effect devtools guide](https://effect.website/docs/v4/getting-started/devtools),
`bun install` runs `effect-tsgo patch` via `prepare`. This patches the local
TypeScript compiler and language server to provide Effect diagnostics, quick
info, completions, and refactors. Floating Effects are reported as errors.

`@effect/tsgo@0.45.0` supports TypeScript 7.0.2, but its Oxlint integration only
supports Oxlint 1.81.0 and 1.82.0. To use the latest Oxlint, this project keeps
Effect diagnostics enabled in TypeScript and uses stock Oxlint for general
type-aware linting. Do not add `--oxlint` to the patch command or disable the
TypeScript Effect diagnostics until the pinned versions support that integration.
See the [supported versions](https://github.com/Effect-TS/tsgo#supported-package-versions)
when upgrading.

VS Code settings select the workspace TypeScript 7 SDK and configure Oxc format
and fix actions on save. Install the recommended Oxc extension and select the
workspace TypeScript version if prompted. The recommended Effect extension adds
debugger features; the project's `@effect/tsgo` dependency supplies the language
service. Vendored files under `repos/` are excluded from all project checks.

## Pre-commit checks

[Lefthook](https://lefthook.dev/) **2.1.14** runs dependency boundary, type, lint,
and formatting checks in parallel before each commit, using `lefthook.yml`.
`bun install` installs the Git hook through the project's `prepare` script,
alongside the Effect TypeScript patch.

The checks cover the current working tree, including unstaged changes, and keep
the existing exclusions for `repos/` and generated files. They do not rewrite or
stage files. A failing check blocks the commit; use `bun run format` or
`bun run lint:fix` for automatic fixes, then review and stage the changes.

Run the hook manually, even when no files are staged, with:

```bash
bun run lefthook run pre-commit --force
```

## Effect source reference

Following [Effect's Git subtree guide](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/),
`repos/effect` contains a squashed subtree of
[`Effect-TS/effect`](https://github.com/Effect-TS/effect) at tag
`effect@4.0.0-rc.115`, commit `4a05d4914fa2327a42bd75fe77c22c188becf3b4`.
The tag matches the installed packages, so the local examples describe the APIs
available to the application. A normal Git clone includes this source; no
submodule initialization or upstream dependency installation is required.

Read [AGENTS.md](AGENTS.md) and [Effect's LLM guide](repos/effect/LLMS.md) before
writing Effect code. Import from installed packages, and use `repos/effect` as
read-only reference material. TypeScript and VS Code exclude `repos/` from the
application project and normal editor suggestions/search.

## Updating Effect

Choose a published release candidate available for the Effect packages in use.
Update their exact versions in the root `package.json` under `workspaces.catalog`,
then install to update all workspace resolutions:

```bash
bun install
```

Commit the dependency changes and finish any other pending work first;
`git subtree pull` requires a clean working tree. Then pull the matching tag,
replacing `<version>` with the catalog's exact Effect version:

```bash
git subtree pull --prefix=repos/effect \
  https://github.com/Effect-TS/effect.git 'effect@<version>' --squash
bun run typecheck
bun run start
```

Update the version and commit recorded above after upgrading. Keep package and
subtree updates together when sharing changes.
