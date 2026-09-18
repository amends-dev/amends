# Adapters

Each `adapters/<name>/` directory is a Bun workspace that implements gateway
contracts over one external system, such as a database. Adapters consume shared
packages and may install the dependencies their system needs, which is why they
live outside `packages/`. Hosts compose them; shared packages never depend on them.

`storage-sqlite/` implements the gateway's workspace storage and workspace
directory contracts over one SQLite file; it is the local host's default.
`storage-postgresql/` implements the same contracts over PostgreSQL, with Drizzle
over the Effect PostgreSQL client and one column per record field. Each README
covers running and testing. Both adapters share one shape: one module per store
over a workspace binding that owns the transaction boundary, merged into the
storage contract at the edge.

Each adapter extends `../../tsconfig.base.json`, enables its own runtime types, and
provides a `typecheck` script.

## Constructors and layers

Follow the [shared-package conventions](../packages/README.md#constructors-and-layers):
`make` constructs an implementation and `layer` provides it. Every service module
exports both, with one construction path. Constructors acquire stable dependencies
inside their Effect and return the implemented contract's `Service.of(...)` value.
They retain their acquisition errors and dependencies in the Effect type.

Both storage adapters use the same construction boundaries:

| Module        | `make` constructs                                        | Dependencies                   |
| ------------- | -------------------------------------------------------- | ------------------------------ |
| Database      | A database facade after applying pending migrations      | An existing Effect SQL client  |
| Binding       | One workspace's database view and transaction operations | The adapter's database service |
| Store modules | Implementations of core's store contracts                | The workspace binding          |
| Storage       | The gateway's workspace-storage implementation           | The adapter's database service |
| Directory     | The gateway's cross-workspace directory                  | The adapter's database service |

`Database.make()` initializes a supplied client; it does not open a connection
or pool. `Database.layer(config)` supplies the driver's client layer and delegates
initialization to `make`. It exposes the database and the underlying SQL client
services, which refer to the same connection or pool. A migration failure prevents
the database service from being returned. Reopening applies only pending migrations.

Acquire the database once and share it across workspace views. Direct callers must
keep the client's owning scope alive while using the database, bindings, or stores.
The database layer manages the driver scope when it opens the connection or pool.

The storage modules export `layerStores` for the merged stores and
`layerWorkspace(workspaceId, ...)` for stores over one binding. Their `make`
constructs `WorkspaceStorage.Service`; `forWorkspace` builds these inexpensive
views on demand. Those views acquire no resources of their own, so their build
scope can close immediately while the database's scope remains alive. Adding
scoped resources to a view requires revisiting that lifetime contract.

Each adapter's root `layer` composes workspace storage and the directory. It leaves
the database dependency to the host. Composition-only exports need no additional
`make`. Public layer variants use the `layer...` prefix. Public constructors and
layers have `@category constructors` and `@category layers` documentation.

Helpers that construct reusable values use specific names, such as
`makeRecordDecoder`. Schema declarations, SQL queries, record conversions, and
error mappings retain their library or operation names. Workspace identity is
captured during construction; the current transaction is checked during each
operation. Constructors do not create workspaces or cache an actor or transaction.
