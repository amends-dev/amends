# SQLite storage

Workspace storage and the workspace directory over one SQLite file, through
`@effect/sql-sqlite-bun`. This is the local host's default; it needs no server.

## Schema

Each record is stored as the JSON of its schema's encoded form in a `record`
column, keyed by workspace and ID, with indexes over the JSON fields the stores
filter on. Journal tables hold their fields as columns. Migrations live in
`src/database.ts` and apply in `SqliteDatabase.make()`, before it returns the
database service. `SqliteDatabase.layer(filename)` uses the same constructor.

## Layout

One module per store, each exporting `make` and a `layer` for the core service
it implements: `journal.ts`, `checkpoints.ts`, `workspaces.ts`, `members.ts`,
`roles.ts`, `assignments.ts`, and `invitations.ts`. They share `binding.ts`,
which is one workspace's view of the database: its identity, the transaction
boundary, and the guard each statement runs under. `storage.ts` exports
`layerStores` and `layerWorkspace(workspaceId)` to compose the store layers over
a binding for the requested workspace; adding a store means adding
its module and one line to that merge. `directory.ts` reads across workspaces.

## Transactions

One connection serves every workspace, so commits run one at a time behind
`BEGIN IMMEDIATE`, and a second writer is refused at once rather than queued;
the journal reports that as a store conflict without retrying. A transaction
whose rollback failed marks the connection broken, and later transactions
refuse until the file is reopened. Waiting readers poll the log.

## Composition

```ts
Gateway.layer.pipe(Layer.provideMerge(layer), Layer.provide(SqliteDatabase.layer(filename)));
```

The root `layer` provides both gateway contracts; `SqliteDatabase.layer` opens the
file and migrates it. The local host also supplies cryptography and uses SQLite
unless `AMENDS_DATABASE_URL` selects PostgreSQL.

`SqliteDatabase.make()` instead accepts `SqlClient.SqlClient` through Effect's
context and prepares it using the same migrations. Keep that client's scope open
while using the result. Reuse the resulting database service across bindings so
all workspace views share its connection health state. The ready-made layer sets
`busyTimeout: 0`; callers supplying their own SQLite client must configure the
same timeout to retain the adapter's immediate-contention behavior.

## Testing

Each test opens its own file in a temporary directory and removes it afterwards.
Construction tests cover both `make` and `layer`, reopening without data loss,
and rollback of a failed migration before an explicit retry.
