# amends-v2

A Bun and TypeScript monorepo with a shared Solid application for web and Tauri desktop, an HTTP API, and workspace
services backed by PostgreSQL. The root workspace catalog pins Effect
**4.0.0**, and `bun.lock` records resolved dependencies.

From the repository root:

```bash
bun install --frozen-lockfile
createdb amends
AMENDS_DATABASE_URL=postgresql://localhost/amends bun run start
```

`bun run start` keeps the local API running at `http://127.0.0.1:8787`;
`bun run dev` restarts it when files change. Both require `AMENDS_DATABASE_URL`, a
PostgreSQL database the host may create its tables in; startup applies the schema
but does not create the database. The server creates workspaces only when requested
through the API.

Run `bun run --filter @amends/web dev` and open `http://127.0.0.1:4321/`, or run
`bun run --filter @amends/desktop dev` to open the Tauri app after installing its
[native prerequisites](apps/desktop/README.md#run-and-verify). Both independently compose headless client state and UI components in their own route trees. Guests see the email/code sign-in page. Successful and restored sessions are validated
before protected routes render. Workspace pages remain placeholders.
The API independently exposes OpenAPI at `/openapi.json` and documentation at `/docs`;
development sign-in prints the one-time code in the host terminal.

See the [local host guide](hosts/local/README.md) for storage configuration and
development authentication, and the [web guide](apps/web/README.md) for app commands.
Workspace creation, invitations, membership, roles, and ownership transfer are
implemented in the backend. Their former web screens have been removed during the
frontend reset. Notification reads and live workspace changes have
[known limitations](docs/current-status.md); task, thread, and agent execution
remain design work. The [documentation index](docs/README.md) separates current
guides from proposals and historical references.

## Workspace layout

```text
packages/
  core/               @amends/core: portable journal and workspace domain services
  gateway/            @amends/gateway: workspace entry and host contracts
  api-http/           @amends/api-http: shared HTTP contract
  server-http/        @amends/server-http: HTTP handlers and authentication
  storage-conformance/ @amends/storage-conformance: test suites every storage adapter runs
  cluster/            @amends/cluster: jobs on Effect Cluster, with their retries and pruning
  connection/      @amends/connection: integrations, connections, and the model catalog
  harness/         @amends/harness: the harness contract, its stream format, and the bridge
  sandbox/         @amends/sandbox: the sandbox provider contract and its suites
  toolkit/            @amends/toolkit: tool sources, such as MCP servers and HTTP APIs
adapters/
  storage-postgresql/ @amends/storage-postgresql: PostgreSQL storage and directory
  storage-memory/     @amends/storage-memory: in-memory reference storage and directory
  harness-amends/  @amends/harness-amends: amends's own agent over Effect AI
  harness-opencode/   @amends/harness-opencode: opencode behind its bridge in a sandbox
  sandbox-local/   @amends/sandbox-local: sandboxes as local directories, for development
  sandbox-daytona/ @amends/sandbox-daytona: sandboxes on Daytona
hosts/
  local/              @amends/host-local: Bun runtime entry point
apps/
  icons/              @amends/icons: generated Solid icons, SVGs, and searchable metadata
  ui/                 @amends/ui: the Lunacy design system, screens, and Storybook
  client/             @amends/client: headless sessions, API/query state, and route helpers
  web/                @amends/web: browser routes and client/UI composition
  desktop/            @amends/desktop: Tauri 2 routes and client/UI composition
docs/                 implementation guides, design intent, and known limitations
design-system/        design references and historical token handoff
scripts/              repository tooling
repos/effect/         upstream Effect reference source
```

[Bun workspaces](https://bun.com/docs/pm/workspaces) discover packages under
`packages/*`, `adapters/*`, `hosts/*`, and `apps/*`. Each workspace has its own manifest,
TypeScript configuration, and scripts. One install and lockfile serve the repository.

Shared packages may depend only on `effect`, `@effect/vitest` for test suites a package
ships, and other packages under `packages/`. Internal dependencies use `workspace:*`;
Effect dependencies use `catalog:`.
The restriction covers dependencies, devDependencies, peerDependencies, and
optionalDependencies. `bun run check:packages` validates these declarations.
Keep shared-package development tooling at the root and external-system dependencies
in adapters, hosts, or apps. Shared packages cannot depend on adapters, hosts, or apps.

`tsconfig.base.json` supplies strict TypeScript and Effect tooling settings with
no runtime globals. Hosts and apps enable their own runtime types. The root
`tsconfig.json` checks repository scripts, shared-package tests, and the Vitest
configuration. `bun run typecheck` also runs each workspace's `typecheck` script.
Workspace exports point to TypeScript source,
which Bun and the web app's Vite build consume directly.

The journal and execution-log design is described in [docs/journal.md](docs/journal.md).
Run all tests with `bun run test`, or focus on core and the host with
`bun run test packages/core/test hosts/local/test`. Tests use `@effect/vitest`;
see [the testing guide](docs/testing.md) for conventions and database fixtures.

For a new workspace, add a manifest, source files, and a TypeScript configuration
extending `../../tsconfig.base.json`, plus a `typecheck` script. Then run
`bun install` from the root. See [packages](packages/README.md), [adapters](adapters/README.md),
[hosts](hosts/README.md), and [apps](apps/README.md) for their responsibilities.

## Development tools

The project pins TypeScript **7.0.2**, Oxlint **1.83.0**, Oxfmt **0.68.0**,
`oxlint-tsgolint` **7.0.2001**, and `@effect/tsgo` **0.45.0**. The root
`package.json` is the source of truth for these pins.

| Command                  | Purpose                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `bun run typecheck`      | TypeScript 7 checks plus Effect diagnostics                                             |
| `bun run lint`           | Oxlint with type-aware rules; warnings fail the check                                   |
| `bun run lint:fix`       | Apply safe lint fixes                                                                   |
| `bun run format`         | Format project files with Oxfmt                                                         |
| `bun run format:check`   | Check formatting without writing files                                                  |
| `bun run check`          | Validate dependencies, generated icons, types, lint, and formatting                     |
| `bun run check:icons`    | Verify generated icons without writing files                                            |
| `bun run check:packages` | Validate shared-package dependency boundaries                                           |
| `bun run dist`           | Build, check, or publish a package's distribution; see [publishing](docs/publishing.md) |
| `bun run test`           | Run backend, PostgreSQL, and all frontend workspace tests                               |

Following the [Effect devtools guide](https://effect.website/docs/v4/getting-started/devtools),
`bun install` runs `effect-tsgo patch` via `prepare`. This patches the local
TypeScript compiler and language server to provide Effect diagnostics, quick
info, completions, and refactors. Floating Effects are reported as errors.

`@effect/tsgo@0.45.0` supports TypeScript 7.0.2, but its Oxlint integration only
supports Oxlint 1.81.0 and 1.82.0. With the pinned Oxlint version, this project keeps
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

[Lefthook](https://lefthook.dev/) **2.1.14** runs dependency boundary, generated-icon, type, lint,
and formatting checks in parallel before each commit, using `lefthook.yml`.
`bun install` installs the Git hook through the project's `prepare` script,
alongside the Effect TypeScript patch.

The checks cover the current working tree, including unstaged changes, and keep
the existing exclusions for `repos/` and build output. They do not rewrite or
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
`effect@4.0.0`, commit `67ba4e46a11ccda0b6761578bfd22c04ae00167d`.
The tag matches the installed packages, so the local examples describe the APIs
available to the application. A normal Git clone includes this source; no
submodule initialization or upstream dependency installation is required.

Read [AGENTS.md](AGENTS.md) and [Effect's LLM guide](repos/effect/LLMS.md) before
writing Effect code. Import from installed packages, and use `repos/effect` as
read-only reference material. TypeScript and VS Code exclude `repos/` from the
application project and normal editor suggestions/search.

## Updating Effect

Choose a published stable release available for the Effect packages in use.
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
bun run check
bun run test
```

Update the version and commit recorded above after upgrading. Keep package and
subtree updates together when sharing changes. Recheck the affected APIs against
the matching source and perform the [temporary-port startup check](hosts/local/README.md#verify).
Journal payloads use SchemaBinary. The [codec fixtures](packages/core/test/journal/codec.test.ts)
check representative bytes captured on rc.115 independently of the current encoder.
Preserve those fixtures across upgrades; [coverage remains partial](docs/current-status.md#payload-format-compatibility),
and round-trip tests alone do not establish compatibility for other payloads.
