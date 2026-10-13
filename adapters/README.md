# Adapters

An adapter implements one contract over one external system, such as a database, a sandbox
platform, or an agent, and installs that system's dependencies, which is why it lives outside
[packages](../packages/README.md). Hosts compose adapters; shared packages never depend on them.

| Adapter                                              | What it implements                                                  | Published |
| ---------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| [`harness-amends`](harness-amends/README.md)         | amends's own agent, a loop over an Effect AI language model         | npm       |
| [`harness-opencode`](harness-opencode/README.md)     | opencode as an agent, behind its bridge in a sandbox                | npm       |
| [`sandbox-local`](sandbox-local/README.md)           | Sandboxes as directories on this machine, for development and tests | npm       |
| [`sandbox-daytona`](sandbox-daytona/README.md)       | Sandboxes on Daytona                                                | npm       |
| [`storage-postgresql`](storage-postgresql/README.md) | Workspace storage and the workspace directory over PostgreSQL       | No        |

Each adapter extends `../../tsconfig.base.json`, enables its own runtime's types, and has a
`typecheck` script.

## Agents and sandbox providers

The agents implement the [harness contract](../packages/harness/README.md) and the sandbox
providers the [sandbox contract](../packages/sandbox/README.md), whose conformance suites each
provider runs against itself. Each depends on its contract and its platform's own client alone. The
[local host](../hosts/local/README.md) declares the integrations workspaces connect to them through;
[contributing](../CONTRIBUTING.md#adding-an-integration) describes adding another.

## Storage adapters

The PostgreSQL adapter implements the gateway's workspace storage, its signal hub, the workspace
directory, accounts, and sign-in storage, for the local host. It stores one column per record field,
except the kind-specific details of a thread activity or a session log entry, which it stores as
JSON. The reference implementation of the same contracts, in process memory, lives beside the
contracts, in [core](../packages/core/README.md#memory) and the
[gateway](../packages/gateway/README.md#memory).

Both have one shape. A workspace binding owns one workspace's view of the database and its
transaction boundary, and each store implements core's store contract over it: in the adapter, a
module per store, such as `ThreadMessages.ts`, and in memory, each contract's `layerMemory`, over
`Store.MemoryBinding`. `layerWorkspace` merges the adapter's stores over one binding, and
`PostgresWorkspaceStorage` builds those views on demand as `WorkspaceStorage.WorkspaceStorage`, as
`WorkspaceStorage.layerMemory` does in memory. Database tables and migrations belong to the adapter;
domain records and store contracts belong to core. `PostgresStorage.layer` composes workspace
storage, the directory, the accounts, and sign-in storage, with the signal hub that relays signals
between hosts over the same database, and leaves the database itself to the host. The PostgreSQL
adapter also keeps up the tables Effect Cluster stores its messages in, as `PostgresClusterStorage`,
pruning those the host has handled.

### Validation

Core checks what reaches a store before the adapter sees it. Each store contract's `make` builds
the store over the adapter's driver: it decodes every input against its schema, with
`Schema.decodeEffect(Schema.toType(...))`, because a TypeScript type does not enforce a schema's
refinements, and it refuses a record of another workspace. A malformed read fails; a malformed or
foreign write conflicts. The driver keeps only what storage keeps: reused IDs, missing records,
conditional writes, and uniqueness.

- A conditional write that lost, or a row the database refused, becomes the store's `Conflict`.
- An encoding failure, or a failure of the database itself, is a `Failure`; a malformed stored row
  fails when it is read.
- Every write runs in the active workspace transaction, so a refused write leaves no partial rows,
  and an unhandled failure rolls the transaction back.

### Construction

Adapters follow the [shared construction conventions](../packages/README.md#constructors-and-layers).
In the PostgreSQL adapter, `PostgresDatabase.make` applies the current schema baseline to an
Effect SQL client it is given, without opening a connection, and `PostgresDatabase.layer(config)`
opens the client's pool and delegates to it. The binding, `PostgresWorkspaceStorage`, and
`PostgresDirectory` construct over the database service, and each store over the binding.

A host acquires the database once and shares it across workspace views, which acquire nothing of
their own. Workspace identity is fixed when a view is built, and the current transaction is checked
on each operation.

## Testing and migrations

Every storage adapter runs the [conformance suites](../packages/gateway/README.md#conformance)
through `test/fixture.ts`, from one test file that calls `run`. What every adapter must promise
belongs in those suites; an adapter's own tests keep what only it has, such as columns, query
plans, or a driver's failures.

Each storage adapter keeps one schema baseline: PostgreSQL's generated baseline is in
`storage-postgresql/drizzle/`. Regenerate it when the schema changes, and reset development
databases; amends is in early development and carries no upgrade path for old local data.
