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

`@amends/core` composes one workspace's core. Its root export holds the
composition: `layer` builds the application operations over the journal,
authorization, and permission catalog; `HostServices` is the storage and
cryptography a host must supply, derived from that layer; and `Operations` is
the set of application services a gateway may run. Domains are subpath exports:
`@amends/core/journal`, `@amends/core/identity`, `@amends/core/authorization`,
and `@amends/core/workspace`, each with its records, facts, stores, projections,
and operations. Member and invitation operations include listing: members you
may read, and every invitation for holders of `invitation.manage`.

`@amends/gateway` is how hosts enter core: it bootstraps workspaces, binds one
workspace's storage, resolves an authenticated identity into the actor, and runs
core's application services with only public outcomes. `@amends/api-http` declares the HTTP contract
shared by servers and browser clients, and `@amends/server-http` implements it
over the gateway. Additional protocols add their own contract and handler
packages over the same gateway.
