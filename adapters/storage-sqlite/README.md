# SQLite storage

Workspace storage and the workspace directory over one SQLite file, through
`@effect/sql-sqlite-bun`. This is the local host's default; it needs no server.

## Schema

Each record is stored as the JSON of its schema's encoded form in a `record`
column, keyed by workspace and ID, with indexes over the JSON fields the stores
filter on. Notifications also store an indexed epoch-millisecond timestamp so
pagination orders instants correctly, independent of their string representation.
Journal tables hold their fields as columns. `src/migrations.ts` contains one
fresh-database baseline, applied once by `SqliteDatabase.make()`. During local
development, update that baseline and reset the database after schema changes. `SqliteDatabase.layer(filename)` uses the same constructor.

Journal entries keep `subject`, `fact_name`, and `fact_version` in columns, provenance as
schema-validated JSON in its own column, and only the domain payload as binary.
Generic execution entries leave fact metadata null. `log_entries_by_fact` supports
workspace/log/name reads ordered by position and entry index. These filtered
entry pages are separate from complete-batch reads used for replay.

`log_entries_by_commit` supports complete-batch checkpoint validation and keyed
append receipts by workspace, log, commit, and entry index. These lookups seek to
one commit and read entries in order without scanning the log or sorting a batch.

`log_entries_by_subject` supports entity history across fact names using the
workspace, log, subject, position, and entry index. Fact subjects are required;
generic execution entries leave the entire fact header null.

Fact entries require complete provenance. There are no upgrade migrations,
backfills, or legacy envelope formats. See the
[storage envelope](../../docs/journal.md#storage-envelope).

## Layout

One module per store, each exporting `make` and a `layer` for the core service
it implements: `journal.ts`, `checkpoints.ts`, `workspaces.ts`, `members.ts`,
`roles.ts`, `assignments.ts`, `invitations.ts`, `notifications.ts`, `groups.ts`, and
`group-memberships.ts`. They share `binding.ts`,
which is one workspace's view of the database: its identity, the transaction
boundary, and the guard each statement runs under. `storage.ts` exports
`layerWorkspace(workspaceId)` to compose the store layers over a binding for the
requested workspace. Its private `layerStores` merge registers each store.
`directory.ts` reads across workspaces. The package root exposes the database,
storage, directory, and composed layer; binding internals stay private.

Follow the [adapter naming and validation conventions](../README.md). Records
are validated before JSON encoding, edited fields use their core schemas, and
invalid writes return the corresponding store's `Conflict`. Reads decode stored
JSON back into validated domain records; corrupt data remains a `Failure`.

Notification recipients are Human, Agent, Contact, or workspace-singleton Triage.
Triage has no person ID. Recipient indexes normalize the missing ID only for
indexing, preserving source/recipient uniqueness for concurrent Triage inserts.
Notification reads match both recipient kind and ID, with bounded pages ordered
by recorded time and binary ID order. Notification IDs and source/recipient
associations are unique within the workspace. Inserts join the journal transaction;
source existence and recipient selection remain generation responsibilities.
The notification projection currently has no generation handlers.

## Transactions

Private team creation records its group and explicit initial admissions in the shared
workspace commit. Group admissions reference workspace memberships and have distinct IDs;
a unique index prevents competing active admissions for the same group/member pair.
Stores validate records and workspace references before writes. Replay accepts historical
references to removed workspace members; current eligibility belongs to application operations.
The group suite covers permission grants, rollback, reopening, replay, and direct-store
constraints. See [group creation](../../docs/group-workflows.md) for the implemented scope.

`log_append_keys` stores durable append receipts, scoped by workspace, log, and
idempotency key. Key lookup precedes expected-position checks; matching bytes
return the original append slice, while conflicting bytes or count fail. The key,
entries, and projection writes commit or roll back together. See the [journal contract](../../docs/journal.md#idempotent-publication-and-append).

One connection serves every workspace, so commits sharing that client wait for
its connection semaphore and run one at a time. Competing connections contend at
`BEGIN IMMEDIATE`; with `busyTimeout: 0`, a busy writer fails immediately as a
store conflict without retrying. A transaction
whose rollback failed marks the connection broken, and later transactions
refuse until the file is reopened. Waiting readers poll the log.

Ordinary application reads and SSE authorization do not open a transaction or run
`BEGIN IMMEDIATE`. With WAL enabled, they can read committed state while another
connection holds the writer lock. They still wait for the shared connection when
that same client has an active transaction; this adapter does not have a separate
reader pool. Reads inside an existing transaction use its staged state.

Every failed COMMIT effect currently returns `Store.CommitUncertain`, even when
the database error could establish a definite failure. A successful cleanup
rollback does not narrow that result. See the
[commit classification limitation](../../docs/current-status.md#commit-outcomes-and-postgresql-contention).

The optional `Store.transaction` observer runs after a confirmed native COMMIT,
inside its uninterruptible completion boundary. It is skipped on rollback and
uncertain outcomes. `Store.notifyCommit` logs observer failures without changing
the committed result. Observers must not access storage or wait for consumers;
the connection is still reserved. Core uses this hook to publish its collected
domain events to the workspace's process-local bus.

## Composition

```ts
Gateway.layer.pipe(
  Layer.provideMerge(WorkspaceEvents.layer()),
  Layer.provideMerge(layer),
  Layer.provide(SqliteDatabase.layer(filename)),
);
```

The root `layer` provides both gateway contracts; `SqliteDatabase.layer` opens the
file and migrates it. The local host also supplies cryptography and uses SQLite
unless `AMENDS_DATABASE_URL` selects PostgreSQL.
The caller must create the file's parent directory; the layer does not create it.

`SqliteDatabase.make()` instead accepts `SqlClient.SqlClient` through Effect's
context and initializes it using the same baseline. Keep that client's scope open
while using the result. Reuse the resulting database service across bindings so
all workspace views share its connection health state. The ready-made layer sets
`busyTimeout: 0`; callers supplying their own SQLite client must configure the
same timeout to retain the adapter's immediate-contention behavior.

## Testing

Each test opens its own file in a temporary directory and removes it afterwards.
Construction tests cover both `make` and `layer`, reopening without data loss,
and rollback of failed schema initialization before an explicit retry.

The suites separate database construction, transactions, journal behavior,
authorization, gateway workflows, and invitation lifecycle, policy, and replay.
`contracts.test.ts` runs the same direct-store rejection and round-trip scenarios
as PostgreSQL, including invalid role edits, foreign grant scopes, invalid expiry,
checkpoint validation, and rollback. Fixtures are in `support.ts` and
`invitation-support.ts`.
