# Project guidance

Use Bun for dependency installation, scripts, and application execution.
Use TypeScript 7 for type-checking, Oxlint for linting, and Oxfmt for formatting.
Run `bun run check` after changes and `bun run test` after changing behavior.
Tests use `@effect/vitest` through Vitest running on Bun. Use `it.effect` for Effect
programs, `it.live` only for integrations that need live clocks, and plain `it`
for synchronous assertions and Promise-based UI or subprocess tests. Test helpers
return Effects; do not run them with `Effect.runPromise` or `Effect.runSync`.
Use `TestClock` and explicit concurrency signals, and scope acquired resources.
See [docs/testing.md](docs/testing.md) for commands, fixtures, and examples.
`bun run start` serves the local host on port 8787 and keeps running; it requires
`AMENDS_DATABASE_URL`, a PostgreSQL database URL. After changing runtime setup,
create a temporary database, start the host in the background with `AMENDS_PORT=0`
and `AMENDS_DATABASE_URL` naming it, confirm the "Listening on" line, stop it, and
drop the database. The host tests also spawn the server entry point. Use
`bun run format` and `bun run lint:fix` to apply formatting and safe lint fixes.

`bun install` runs `effect-tsgo patch` and `lefthook install` through the `prepare`
script. This enables Effect diagnostics in the TypeScript compiler and workspace
language server, and installs the Git hooks. Before each commit, Lefthook runs
dependency boundary, generated-icon, type, lint, and formatting checks in parallel across the working tree.
The hook checks files without modifying or staging them. Fix failures before
committing; `bun run lefthook run pre-commit --force` runs the same checks manually,
even when no files are staged. CI runs these checks, the tests, and the frontend builds
as parallel jobs; see [continuous integration](docs/testing.md#continuous-integration).
Keep these diagnostics enabled in `tsconfig.base.json`: the pinned Oxlint version is
newer than the versions supported by the Effect Oxlint patch, so Effect checks
currently run through TypeScript. Check compatibility before changing this setup.

## Workspace layout

- `packages/*`: portable shared packages. Effect is their only external dependency,
  besides `@effect/vitest` for test suites a package ships from the root catalog.
  They may depend on other shared packages with `workspace:*`, but never hosts or
  apps. This applies to all dependency sections; development tools live at the root.
  `core` operates within one workspace with a trusted actor; its application
  services are the operations. `gateway` is how a host enters core: it bootstraps
  a workspace and resolves an authenticated identity into the actor, and it holds
  the host contracts for storage, sign-in, credential resolution, and the workspace
  directory. `api-http` is the HTTP contract shared by servers and clients, and
  `server-http` implements it over the gateway, including its authentication. Another protocol adds its own contract and handler packages
  over the same gateway rather than new gateway methods. `storage-conformance` holds
  the test suites every storage adapter runs against itself through a harness; behavior
  core relies on belongs there, and adapter tests keep only what one adapter stores or
  fails differently.
- `adapters/*`: implementations of gateway contracts over one external system, with
  that system's dependencies. `storage-postgresql` implements workspace storage and
  the workspace directory over PostgreSQL with Drizzle and `@effect/sql-pg`, one column
  per record field, except a thread activity's kind-specific `details`, stored as JSON;
  `storage-memory` implements them in process memory as the reference
  implementation of the storage contracts, with no dependencies. Both follow one shape:
  a module per store over a workspace binding, merged at the edge.
  Hosts compose adapters and implement no storage themselves; shared packages never
  depend on adapters.
- `hosts/*`: runtime composition, such as the Bun host in `hosts/local`, which serves
  the HTTP API over the PostgreSQL adapter at `AMENDS_DATABASE_URL`, with development
  sign-in and credentials.
  Hosts may install their runtime's dependencies and consume shared packages. A host
  implements gateway contracts and serves protocol handler packages; it does not
  depend on a protocol's contract package, which is for clients. A host's tests may
  take a contract as a development dependency to act as a client.
- `apps/*`: user-facing clients and shared UI. `icons` holds canonical drawings and generated
  Solid icons, raw SVGs, and a separate metadata catalog; apps and UI packages may consume it.
  `ui` holds shared visual foundations, primitives, and compositions with a
  standalone Storybook workshop. Introduce and verify one foundation or component
  at a time. It is UI-only and must not depend on client state, routing, or API
  contracts. `client` owns headless session lifetime, typed API access, query state,
  and pure route helpers. Client and UI must not depend on each other in any dependency
  section or source import. `web` and `desktop` import them independently and own route
  trees, page composition, API URL, and persistence configuration. `desktop` owns the
  Tauri shell; platform APIs stay in the entry apps.
  The legacy UI implementation and `design-system` package were removed; the current
  `ui` package is the renamed shared workshop. Apps may install UI
  dependencies and consume shared packages. Run desktop's `check:native` after
  changing Rust or Tauri configuration; root checks cover its TypeScript only.

Each workspace has its own manifest, source exports or entry point, `tsconfig.json`
extending `tsconfig.base.json`, and `typecheck` script. Shared packages inherit no
runtime-specific global types; hosts and apps opt into their own environments.
Root `tsconfig.json` checks repository scripts, shared-package tests, and the Vitest
configuration; `bun run typecheck` checks these and every workspace. Use declared
package names for cross-workspace imports, not relative paths into another workspace.

Use the root Bun catalog for Effect package versions and `workspace:*` for local
package links. Run `bun install` at the repository root after manifest changes.
`bun run check:packages` checks shared-package dependency declarations.

## Documentation

[docs/README.md](docs/README.md) indexes current guides, design intent, and historical
references. Update affected READMEs and guides when changing commands, configuration,
contracts, behavior, or test setup. Check claims against implementation and tests;
an agreed design or a passing round-trip test does not establish an implemented
feature or compatibility across dependency upgrades.

Keep [known limitations](docs/current-status.md) aligned with the owning source and
guides. Remove a limitation when its implementation and relevant verification are
complete. Preserve the status of proposals and historical notes instead of presenting
them as current behavior. Check relative links and heading anchors after moving or
renaming documentation. `CLAUDE.md` is a symlink to this file; keep one guidance source.

## Effect

This project uses Effect v4 release candidates. The root `package.json` workspace
catalog and `bun.lock` define the installed versions; keep Effect dependencies and the vendored source
on the same release when upgrading.

Before writing Effect code, read `repos/effect/LLMS.md`, then inspect the relevant
implementation, examples, and tests in `repos/effect`. Use this matching source
to verify APIs rather than guessing from prior versions or web snippets.

- Core modules and tests: `repos/effect/packages/effect/src` and
  `repos/effect/packages/effect/test`.
- Usage examples: `repos/effect/ai-docs/src`.
- Bun integration: `repos/effect/packages/platform/bun`.
- Domain design: `docs/core-model.md`.

## Vendored repositories

`repos/` contains upstream Git subtrees for reference. Treat their contents as
read-only unless explicitly asked to update them. Their own build commands and
contributor instructions apply to upstream development, not this application.

Import application code from installed packages such as `effect` and
`@effect/platform-bun`, never from `repos/`. Keep vendored repositories out of
application type-checking, test discovery, formatting, and linting. When adding
those tools, scope them to application files.
