# Shared packages

Each `packages/<name>/` directory is an independent Bun workspace containing
portable application code. Effect is the only external dependency allowed in
these packages. They may also depend on other workspaces in this directory using
`workspace:*`. Host and app packages cannot be dependencies of shared packages.

Keep development tooling at the repository root. The restriction applies to
dependencies, devDependencies, peerDependencies, and optionalDependencies.
`bun run check:packages` checks these manifests and runs before commits.

Packages extend `../../tsconfig.base.json` and do not receive Bun, Node, or browser
globals. Use Effect services to describe runtime requirements and implement
platform adapters in `hosts/` or `apps/`.

Use `effect: "catalog:"` to share the root Effect version. Export source through
`package.json` and import other packages by their declared workspace names;
do not use relative paths across workspace boundaries.

`@amends/core` exports the journal, identity, authorization, and workspace contracts
and services. `WorkspaceCore.layer` composes the current domain projections and
permission definitions from host-provided workspace storage views.
