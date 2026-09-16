# Project guidance

Use Bun for dependency installation, scripts, and application execution.
Use TypeScript 7 for type-checking, Oxlint for linting, and Oxfmt for formatting.
Run `bun run check` after changes and `bun run start` after changing runtime setup.
Use `bun run format` and `bun run lint:fix` to apply formatting and safe lint fixes.

`bun install` runs `effect-tsgo patch` and `lefthook install` through the `prepare`
script. This enables Effect diagnostics in the TypeScript compiler and workspace
language server, and installs the Git hooks. Before each commit, Lefthook runs
dependency boundary, type, lint, and formatting checks in parallel across the working tree.
The hook checks files without modifying or staging them. Fix failures before
committing; `bun run lefthook run pre-commit --force` runs the same checks manually,
even when no files are staged.
Keep these diagnostics enabled in `tsconfig.base.json`: the pinned Oxlint version is
newer than the versions supported by the Effect Oxlint patch, so Effect checks
currently run through TypeScript. Check compatibility before changing this setup.

## Workspace layout

- `packages/*`: portable shared packages. Effect is their only external dependency.
  They may depend on other shared packages with `workspace:*`, but never hosts or
  apps. This applies to all dependency sections; development tools live at the root.
- `hosts/*`: runtime composition and adapters, such as the Bun host in `hosts/local`.
  Hosts may install their runtime's dependencies and consume shared packages.
- `apps/*`: user-facing clients, such as future web or desktop applications. Apps
  may install UI dependencies and consume shared packages.

Each workspace has its own manifest, source exports or entry point, `tsconfig.json`
extending `tsconfig.base.json`, and `typecheck` script. Shared packages inherit no
runtime-specific global types; hosts and apps opt into their own environments.
Root `tsconfig.json` checks repository scripts; `bun run typecheck` checks both
those scripts and every workspace. Use declared package names for cross-workspace
imports, not relative paths into another workspace.

Use the root Bun catalog for Effect package versions and `workspace:*` for local
package links. Run `bun install` at the repository root after manifest changes.
`bun run check:packages` checks shared-package dependency declarations.

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
- Domain design: `docs/core-model.md` and `docs/effect-capability-map.md`.
  The capability map records an earlier review; verify version-specific claims
  against the installed release and vendored source.

## Vendored repositories

`repos/` contains upstream Git subtrees for reference. Treat their contents as
read-only unless explicitly asked to update them. Their own build commands and
contributor instructions apply to upstream development, not this application.

Import application code from installed packages such as `effect` and
`@effect/platform-bun`, never from `repos/`. Keep vendored repositories out of
application type-checking, test discovery, formatting, and linting. When adding
those tools, scope them to application files.
