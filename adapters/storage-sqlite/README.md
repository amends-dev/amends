# SQLite storage

Workspace storage and the workspace directory over one SQLite file, through
`@effect/sql-sqlite-bun`. This is the local host's default; it needs no server.

## Schema

Each record is stored as the JSON of its schema's encoded form in a `record`
column, keyed by workspace and ID, with indexes over the JSON fields the stores
filter on. Journal tables hold their fields as columns. Migrations live in
`src/database.ts` and apply when the database layer starts.

## Layout

One module per store, each exporting `make` and a `layer` for the core service
it implements: `journal.ts`, `checkpoints.ts`, `workspaces.ts`, `members.ts`,
`roles.ts`, `assignments.ts`, and `invitations.ts`. They share `binding.ts`,
which is one workspace's view of the database: its identity, the transaction
boundary, and the guard each statement runs under. `storage.ts` merges the store
layers over a binding for the requested workspace; adding a store means adding
its module and one line to that merge. `directory.ts` reads across workspaces.

## Transactions

One connection serves every workspace, so commits run one at a time behind
`BEGIN IMMEDIATE`, and a second writer is refused at once rather than queued;
the journal reports that as a store conflict without retrying. A transaction
whose rollback failed marks the connection broken, and later transactions
refuse until the file is reopened. Waiting readers poll the log.

## Composition

```ts
Gateway.layer.pipe(Layer.provideMerge(contracts), Layer.provide(SqliteDatabase.layer(filename)));
```

`contracts` provides both gateway contracts; `SqliteDatabase.layer` opens the
file and migrates it. The local host uses this unless `AMENDS_DATABASE_URL`
selects PostgreSQL.

## Testing

Each test opens its own file in a temporary directory and removes it afterwards.
