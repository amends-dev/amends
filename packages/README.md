# Shared packages

The packages here hold amends's portable code: the workspace domain, the contracts hosts and
integrations implement, and the HTTP API. They run on Effect alone, with no runtime of their own,
so a Bun host, a browser, or another runtime can use them. Implementations over an external system
live in [adapters](../adapters/README.md), runtime composition in [hosts](../hosts/README.md), and
the user interface in [apps](../apps/README.md).

| Package                              | What it is                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| [`core`](core/README.md)             | One workspace's domain: its journal, authorization, and operations.                  |
| [`gateway`](gateway/README.md)       | How a host enters core, and what a host implements: storage, sign-in, the directory. |
| [`http`](http/README.md)             | The HTTP API: the contract clients call and its server, over the gateway.            |
| [`sync`](sync/README.md)             | Keeps a browser's workspace in sync: actions, changes, rejections, eventlog events.  |
| [`cluster`](cluster/README.md)       | Jobs, the work outside requests, on Effect Cluster: agents' turns and deliveries.    |
| [`connection`](connection/README.md) | The integrations a host installs, a workspace's connections, and the model catalog.  |
| [`toolkit`](toolkit/README.md)       | Tool sources, such as MCP servers and HTTP APIs, in one shape. Published to npm.     |
| [`harness`](harness/README.md)       | Runs an agent and streams its turns in one format. Published to npm.                 |
| [`sandbox`](sandbox/README.md)       | The contract every sandbox provider implements. Published to npm.                    |
| [`channel`](channel/README.md)       | The contract every channel transport implements. Published to npm.                   |

## Dependencies

A shared package depends on `effect` and on other packages here, through `workspace:*`, or
`workspace:^` from one published package to another, and on nothing else: no host, adapter, or
app, and no other external package, except `@effect/vitest` for a package that ships test suites,
such as the gateway's conformance suites. Effect's version comes from the root catalog, as
`catalog:`. The rule covers every dependency section, so development tools live at the repository
root. `bun run check:packages` enforces it.

Packages extend `../../tsconfig.base.json`, which gives them no Bun, Node, or browser globals:
what a package needs from its runtime, it asks for as an Effect service. Each package exports its
TypeScript source through its manifest, and others import it by its package name, never by a
relative path into it.

Every package declares `"sideEffects": false`: importing a module runs nothing beyond its
declarations, so a bundler drops what a client does not use. A protocol contract reaches core's
records, inputs, and errors, never its operations: the errors a protocol exposes are
`CoreError`'s kinds, schemas alone in `error/CoreError.ts`. A browser bundle then carries core's
schemas without their implementation; the web app's bundle test fails when an implementation
reaches it.

## Features and module names

A feature owns one concept, its rules, and its lifecycle. It starts as one module, and becomes a
directory when its models, operations, facts, projections, or contracts need modules of their own.
A core feature keeps the operations actors call in its service module, such as `ThreadService.ts`,
the writes other operations share in `ThreadCommand.ts`, and its reads in `ThreadQuery.ts`, as far
as it has each, as [AGENTS.md](../AGENTS.md) describes. An HTTP group's module and its handler share a name, so
`http/src/InvitationsGroup.ts` leads to `http/src/InvitationsHandlers.ts`.

Each namespace module gives its concept one name, such as `CoreError` or `ThreadActivityStore`. A
package's index re-exports that name, and modules inside the package import the owning module
directly. A name that would be ambiguous in a shared namespace says what it is about, such as
`ThreadMessageId`. [Core's schema vocabulary](core/README.md#schema-and-type-names) applies
throughout.

A decoded TypeScript name and its encoded field name are separate contracts: renaming a field keeps
its encoded name with a schema codec, or plans the migration, and tests both directions. Models the
HTTP API carries have stable schema identifiers for its generated documentation, and HTTP status
annotations stay in the contract package.

Use Effect's own helpers for the variants of its types: `Option.isNone`, `Result.isFailure`, and
their kin. For a decoded `Schema.TaggedUnion`, use `.isAnyOf([...tags])` to check tags and `.match`
or `.matchOrElse` to dispatch; `Schema.is` and a union's `.guards` also validate fields, for unknown
values. A workflow's internal states, such as a turn's runner steps or the gateway's admission, are
a `Data.TaggedEnum`, built with `Data.taggedEnum` for its constructors, `$is`, and `$match`. Schemas
are for values that cross a validation or persistence boundary.

## Constructors and layers

Packages follow Effect's library pattern:

- `make(...)` constructs a module's main value or service implementation; a second constructor has a
  specific name, such as `makeRunner`. Pure construction returns a value, and effectful construction
  returns an Effect with its errors and requirements in its type.
- A service implementation exports `make` and a `layer` that provides it. Initialization and
  validation stay in `make`; `Service.of` only checks the implementation's type.
- `layer` is the main layer, and `layer...` names variants and compositions. `Layer.provide` supplies
  internal dependencies, and `Layer.provideMerge` keeps them for consumers that need them too.
- Construction acquires stable dependencies. The caller's identity, the active transaction, and
  other context of one call are resolved when an operation runs, and scoped resources stay within
  their scope.
- An operation keeps its own name, such as `createWorkspace` or `resolve`: returning an Effect does
  not make it a constructor.
- Contracts and modules that only compose need no constructor of their own. HTTP declarations use
  `HttpApi.make` and `HttpApiGroup.make`, and handlers register with `HttpApiBuilder.group`.

Documentation marks constructors with `@category constructors` and layers with `@category layers`.
Add a configuration or acquisition variant only for a real use.
