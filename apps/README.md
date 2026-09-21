# User-facing applications

This directory contains two implemented Solid workspaces:

- [ui](ui/README.md) provides components, tokens, styles, and layout without
  application or API imports.
- [web](web/README.md) composes the UI and calls the shared HTTP contract through
  its named API modules. It implements sign-in and workspace management; other
  domain pages remain placeholders.

Run the API with `bun run start` after the [local host setup](../hosts/local/README.md#run),
then run `bun run --filter @amends/web dev` in another terminal.

Apps may depend on shared packages via `workspace:*` and use UI or platform
dependencies appropriate to their target. UI source must remain independent of
application contracts, and web endpoint construction belongs in `src/api/`.
`bun run check:packages` enforces these source boundaries. Shared packages cannot import apps.

Each app needs its own `package.json`, a `typecheck` script, and a `tsconfig.json`
extending `../../tsconfig.base.json`. Enable browser, desktop, or framework types
in that app's configuration. Install dependencies from the repository root to
keep one lockfile.
