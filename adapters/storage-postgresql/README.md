# PostgreSQL storage

Workspace storage and the workspace directory over PostgreSQL. Statements are
written with Drizzle and run through `@effect/sql-pg`, so they share the Effect
client's transaction service; the journal opens each commit on a reserved
connection and every Drizzle statement inside it lands on that connection.

## Schema

`src/schema.ts` gives every record field its own column. Each table leads its
primary key with `workspace_id`, and each reference between tables carries the
workspace as part of a composite foreign key, so a join that starts scoped stays
scoped. Tagged unions become a discriminator column plus the columns each case
needs, with a check constraint that they agree. Invitation grants are a child
table in requested order; role permissions are a text array.

Migrations live in `drizzle/`, generated from the schema. After changing the
schema, run `bun run --filter @amends/storage-postgresql generate` and commit the
new migration. `PostgresDatabase.make()` applies pending migrations before it
returns the database service. `PostgresDatabase.layer(config)` uses that constructor.

## Layout

One module per store, each exporting `make` and a `layer` for the core service
it implements: `journal.ts`, `checkpoints.ts`, `workspaces.ts`, `members.ts`,
`roles.ts`, `assignments.ts`, and `invitations.ts`. They share `binding.ts`,
which is one workspace's view of the database: its identity, the transaction
boundary, and the guard each statement runs under. `storage.ts` exports
`layerStores` and `layerWorkspace(workspaceId, options)` to compose the store
layers over a binding for the requested workspace; adding a store means adding
its module and one line to that merge. `database.ts` connects and migrates,
`directory.ts` reads across workspaces, and `schema.ts` holds the tables.

## Transactions

Writers to one workspace take turns: each commit takes a transaction-scoped
advisory lock keyed by the workspace before it runs, bounded by `lockTimeout`
(five seconds by default), and reports contention as a store conflict without
retrying. Reads outside a transaction see committed state. A statement PostgreSQL
refuses aborts its transaction; the commit checks what PostgreSQL actually did,
so a program that swallowed such a refusal fails rather than losing its writes.
Waiting readers poll the log every `pollInterval` (100 milliseconds by default).

## Composition

```ts
Gateway.layer.pipe(
  Layer.provideMerge(layer()),
  Layer.provide(PostgresDatabase.layer({ url: Redacted.make(databaseUrl) })),
);
```

The root `layer(options)` provides both gateway contracts; `PostgresDatabase.layer`
takes the Effect client's pool configuration. The local host also supplies
cryptography and selects this composition when `AMENDS_DATABASE_URL` is set.

`PostgresDatabase.make()` instead accepts `SqlClient.SqlClient` through Effect's
context. It constructs the Drizzle facade and migrates through that same client.
Keep the client's scope open while using the result. Workspace bindings, Drizzle
queries, and journal transactions all share the resulting database service.

## Testing

Tests need a PostgreSQL server. `AMENDS_POSTGRES_URL` names one the tests may
create databases on. Without it, the tests start a throwaway cluster from a local
installation found on PATH or in the usual Homebrew and Debian locations, and stop
it afterwards. Without either, the tests skip. Each test creates its own database
and drops it when done.
Construction tests cover both `make` and `layer`, including initialization of all
stores and reopening without data loss.
