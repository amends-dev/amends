# Adapters

An adapter implements one contract over one external system, such as a database, a sandbox
platform, or an agent, and installs that system's dependencies, which is why it lives outside
[packages](../packages/README.md). Hosts compose adapters; shared packages never depend on them.

| Adapter                                              | What it implements                                                      | Published |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| [`harness-amends`](harness-amends/README.md)         | amends's own agent, a loop over an Effect AI language model             | npm       |
| [`harness-opencode`](harness-opencode/README.md)     | opencode as an agent, behind its bridge in a sandbox                    | npm       |
| [`sandbox-local`](sandbox-local/README.md)           | Sandboxes as directories on this machine, for development and tests     | npm       |
| [`sandbox-daytona`](sandbox-daytona/README.md)       | Sandboxes on Daytona                                                    | npm       |
| [`storage-postgresql`](storage-postgresql/README.md) | Workspace storage and the workspace directory over PostgreSQL           | No        |
| [`storage-memory`](storage-memory/README.md)         | The same contracts in process memory, as their reference implementation | No        |

Each adapter extends `../../tsconfig.base.json`, enables its own runtime's types, and has a
`typecheck` script.

## Agents and sandbox providers

The agents implement the [harness contract](../packages/harness/README.md) and the sandbox
providers the [sandbox contract](../packages/sandbox/README.md), whose conformance suites each
provider runs against itself. Each depends on its contract and its platform's own client alone. The
[local host](../hosts/local/README.md) declares the integrations workspaces connect to them through;
[contributing](../CONTRIBUTING.md#adding-an-integration) describes adding another.

## Storage adapters

The storage adapters implement the gateway's workspace storage, its signal hub, and the workspace
directory. The PostgreSQL adapter, which the local host uses, stores one column per record field,
except the kind-specific details of a thread activity or a session log entry, which it stores as
JSON. The memory adapter keeps everything in process memory, with no dependencies, and no host uses
it.

Both have one shape. A workspace binding owns one workspace's view of the database and its
transaction boundary. Each store is a module over that binding, implementing core's store
contract, with matching filenames in both adapters, such as `thread-messages.ts`. `layerWorkspace`
merges the stores over one binding, and each adapter's workspace storage module,
`PostgresWorkspaceStorage` or `MemoryWorkspaceStorage`, builds those views on demand as
`WorkspaceStorage.Service`. Database tables and migrations belong to the adapter; domain records
and store contracts belong to core. `PostgresStorage.layer` and `MemoryStorage.layer` compose workspace storage, the directory, the
accounts, and sign-in storage, with the signal hub that relays signals between hosts over the same
storage, and leave the database itself to the host. The PostgreSQL adapter also keeps up the tables Effect
Cluster stores its messages in, as `PostgresClusterStorage`, pruning those the host has handled.

### Validation

A store validates a record against core's schema before turning it into columns or JSON, with
`Schema.decodeEffect(Schema.toType(...))`: a TypeScript type does not enforce a schema's
refinements. Validation comes before any mapping that loses information, so a record whose workspace
a row implies still passes its whole check first.

- A rejected value becomes the store's `Conflict`, through `storeConflict`, as does a workspace
  mismatch, an invalid initial state, or a conditional write that lost.
- An encoding failure after validation, or a failure of the database itself, is a `Failure`; a
  malformed stored row fails when it is read.
- Every write runs in the active workspace transaction, so a failed validation leaves no partial
  rows, and an unhandled failure rolls the transaction back.

### Construction

Adapters follow the [shared construction conventions](../packages/README.md#constructors-and-layers).
In the PostgreSQL adapter, `PostgresDatabase.make()` applies the current schema baseline to an
Effect SQL client it is given, without opening a connection, and `PostgresDatabase.layer(config)`
opens the client's pool and delegates to it. The binding, `PostgresWorkspaceStorage`, and
`PostgresDirectory` construct over the database service, and each store over the binding. The memory adapter's `MemoryDatabase.make()` creates empty storage, and
`MemoryConnection` stands for one host's connection to it.

A host acquires the database once and shares it across workspace views, which acquire nothing of
their own. Workspace identity is fixed when a view is built, and the current transaction is checked
on each operation.

## Testing and migrations

Every storage adapter runs the [conformance suites](../packages/storage-conformance/README.md)
through `test/fixture.ts`, from one test file that calls `run`. Behavior core relies on belongs in those suites;
an adapter's own tests keep what only it has, such as columns, query plans, or a driver's failures.

Each storage adapter keeps one schema baseline: PostgreSQL's generated baseline is in
`storage-postgresql/drizzle/`. Regenerate it when the schema changes, and reset development
databases; amends is in early development and carries no upgrade path for old local data.
