# Adapters

Each `adapters/<name>/` directory is a Bun workspace that implements gateway
contracts over one external system, such as a database. Adapters consume shared
packages and may install the dependencies their system needs, which is why they
live outside `packages/`. Hosts compose them; shared packages never depend on them.

`storage-postgresql/` implements the gateway's workspace storage and workspace
directory contracts over PostgreSQL, with Drizzle over the Effect PostgreSQL client
and one column per record field; the local host uses it. `storage-memory/` implements
them in process memory with no dependencies: it is the reference implementation of
the storage contracts and no host uses it. Each README covers running and testing.
The adapters share one shape: one module per store
over a workspace binding that owns the transaction boundary, merged into the
storage contract at the edge.

Each adapter extends `../../tsconfig.base.json`, enables its own runtime types, and
provides a `typecheck` script.

## Organization and naming

Keep one focused module per store and matching filenames across adapters.
Database setup, workspace binding, directory reads, and storage composition are
separate responsibilities. Add a feature directory when a store needs several
related modules. Database tables and migrations belong to the adapter; domain
models and store contracts belong to core.

Use the same representation vocabulary across adapters:

| Name                 | Meaning                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `Interface`          | A context service's contract, including `PostgresDatabase.Interface` and `MemoryDatabase.Interface`. |
| `DrizzleClient`      | PostgreSQL's Drizzle facade, distinct from its Effect SQL client.                                    |
| `TransactionHandle`  | The native transaction handle exposed to core.                                                       |
| `TransactionState`   | Mutable ownership and lifetime state for one transaction.                                            |
| `CurrentTransaction` | The invocation context used by a workspace binding's guard.                                          |
| `Row` / `Rows`       | A selected database row or collection, such as `BatchHeaderRow` and `EntryRows`.                     |
| `Columns`            | A selection or write mapping, such as `recordColumns`.                                               |
| `Record`             | A validated domain value from core.                                                                  |
| `EncodedRecord`      | A record's encoded representation, assembled before schema decoding.                                 |

Private row schemas do not need public schema identifiers. Conversion helpers
such as `toEncodedRecord` assemble data; schema decoding validates it. Keep the
distinction visible in names and return types.

Package roots expose database, storage, directory, and composed layers. Workspace
bindings, their transaction context, raw tables, and the intermediate store-layer
merge remain internal. Use `Storage.layerWorkspace(...)` to build the complete
set of stores over a binding. Preserve service keys, table names, encoded fields,
and migration identifiers when reorganizing source.

## Validation at the storage boundary

Validate decoded domain records before converting them into JSON or SQL columns.
Use the matching core schema through `Schema.decodeEffect(Schema.toType(...))`;
a TypeScript type alone does not enforce schema refinements. Validate edited
fields against the owning record's field schemas. Validate terminal invitation
states, checkpoint keys/cursors, and native append input before writing them.

Validation must precede any lossy mapping. PostgreSQL stores a scope's workspace
on its containing row, so assignments and invitations must pass their complete
record checks before that workspace ID is omitted from scope columns. Successful
writes must preserve the submitted value's meaning.

Rejected write values become the store's `Conflict` through `storeConflict`.
Workspace mismatches, invalid initial states, and conditional-write conflicts
also remain `Conflict`. Encoding failures after validation and infrastructure
failures remain `Failure`; malformed stored rows fail during reads. Keep these
categories consistent between adapters and with the core contracts.

Run all writes under the active workspace transaction. Validation failures leave
no partial rows; callers can handle a validation conflict before another write,
while an unhandled failure rolls back the enclosing transaction. Database-rejected
statements still follow the database's transaction semantics, including
PostgreSQL's aborted-transaction behavior.

## Constructors and layers

Follow the [shared-package conventions](../packages/README.md#constructors-and-layers):
`make` constructs an implementation and `layer` provides it. Every service module
exports both, with one construction path. Constructors acquire stable dependencies
inside their Effect and return the implemented contract's `Service.of(...)` value.
They retain their acquisition errors and dependencies in the Effect type.

The PostgreSQL adapter uses these construction boundaries:

| Module        | `make` constructs                                        | Dependencies                   |
| ------------- | -------------------------------------------------------- | ------------------------------ |
| Database      | A database facade after applying the current baseline    | An existing Effect SQL client  |
| Binding       | One workspace's database view and transaction operations | The adapter's database service |
| Store modules | Implementations of core's store contracts                | The workspace binding          |
| Storage       | The gateway's workspace-storage implementation           | The adapter's database service |
| Directory     | The gateway's cross-workspace directory                  | The adapter's database service |

`Database.make()` initializes a supplied client; it does not open a connection
or pool. `Database.layer(config)` supplies the driver's client layer and delegates
initialization to `make`. It exposes the database and the underlying SQL client
services, which refer to the same connection or pool. A schema-initialization failure prevents the database service from being returned.
Reopening a database already using the current baseline preserves its data.

The memory adapter keeps the same binding, store, storage, and directory modules. Its
`MemoryDatabase.make()` constructs empty storage, and `MemoryConnection` stands for one
host's connection over it, which the binding, storage, and directory depend on.

Acquire the database once and share it across workspace views. Direct callers must
keep the client's owning scope alive while using the database, bindings, or stores.
The database layer manages the driver scope when it opens the connection or pool.

The storage modules merge stores in a private `layerStores` composition and export
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

## Testing and migrations

Every adapter runs the [conformance suites](../packages/storage-conformance/README.md)
through a harness in `test/harness.ts`, one suite per test file. Behavior core relies on
belongs in those suites; an adapter's own tests keep what only it has, such as columns,
query plans, and driver failure injection. The store-contract suite calls stores directly,
so core's application validation cannot hide an adapter's missing checks. The PostgreSQL
adapter owns its database fixtures in `test/support.ts`.

During local development, keep one initial schema baseline per adapter. PostgreSQL's
generated baseline lives in `drizzle/`. Regenerate it when the schema changes and reset
development databases. Do not add upgrade chains, backfills, or legacy decoding
paths to preserve disposable local data.
