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

## Constructors and layers

Use Effect's public library pattern across shared packages:

- `make(...)` constructs a module's primary value or service implementation.
  Named secondary constructors use `makeRunner`, `makeSchema`, or another
  specific `make...` name. Pure construction returns a value; effectful
  construction returns a lazy Effect with explicit errors and dependencies.
- Service implementations expose a public `make` and a `layer` that delegates
  to it. Keep initialization and validation in the constructor. `Service.of`
  type-checks the implementation; it does not initialize or provide it.
- Use `layer` for the main layer and `layer...` for named variants or
  compositions. Use `Layer.provide` for internal dependencies and
  `Layer.provideMerge` when consumers also need those services.
- Acquire stable dependencies during construction. Resolve request identity,
  the active transaction, and other invocation context during operations.
  Scoped resources must remain within their acquisition scope.
- Keep operation names such as `createWorkspace`, `resolve`, and `decode`.
  Constructing an Effect that performs an operation does not make that
  operation a constructor.
- Contracts and composition-only modules do not need artificial constructors.
  Host-owned service tags have no default implementation here. HTTP declarations
  use Effect's `HttpApi.make` and `HttpApiGroup.make`; HTTP registration uses
  `HttpApiBuilder.group` and layer composition directly.

Mark public constructor documentation with `@category constructors` and layer
exports with `@category layers`. Add configuration and acquisition variants only
when they have a real use case. [Core's README](./core/README.md) provides the
service inventory and examples; each protocol package documents its own surface.

## Package boundaries

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
core's application services with only public outcomes. It also holds the host
contracts: workspace storage, sign-in, credential resolution, and the workspace
directory. `@amends/api-http` declares the HTTP contract shared by servers and
browser clients, and `@amends/server-http` implements it over the gateway,
including the contract's bearer authentication over credential resolution.
Additional protocols add their own contract and handler packages over the same
gateway, adapting the same credential resolution to their own authentication.
