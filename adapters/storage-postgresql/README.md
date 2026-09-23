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
needs, with a check constraint that they agree. Invitations store a required role ID; role permissions are a text array.

`drizzle/` contains one generated baseline for fresh databases. During local
development, update `src/schema.ts`, remove the previous generated baseline, and
run `bun run --filter @amends/storage-postgresql generate --name=workspace_storage`.
Commit the replacement baseline and reset the development database.
`PostgresDatabase.make()` applies that baseline once before returning the service. `PostgresDatabase.layer(config)` uses that constructor.

Journal entries keep `subject`, `fact_name`, and `fact_version` in columns and only the domain
payload as binary. Provenance has separate performer, cause, correlation, and time
columns; the containing row supplies its workspace ID. Check constraints enforce
complete headers and performer/cause variants. Generic execution entries leave
these columns null. `log_entries_by_fact` supports ordered queries by fact name;
filtered entry pages remain separate from complete-batch replay reads.

`log_entries_by_subject` supports entity history across fact names using the
workspace, log, subject, position, and entry index. Fact subjects are required;
generic execution entries leave the entire fact header null.

`log_entries_by_commit` supports keyed append receipts and the next entry index of an
open batch by workspace, log, commit, and entry index. Appends read only the batch's
highest index, so a commit's cost does not grow with the entries it already holds;
a plan test checks that commit lookups use this index. Adding it replaced the
development baseline; recreate disposable PostgreSQL databases when adopting it.

`Store.getEntry(logId, entryId)` uses the existing workspace/entry primary key and filters by
log ID. It decodes the stored envelope through the same path as journal pages, honors a caller's
transaction, and opens none. This supports notification-source reads without scanning the log
or changing the schema.

Fact entries require complete provenance. There are no upgrade migrations,
backfills, or legacy envelope formats. See the
[storage envelope](../../docs/journal.md#storage-envelope).

## Layout

One module per store, each exporting `make` and a `layer` for the core service
it implements: `journal.ts`, `checkpoints.ts`, `workspaces.ts`, `members.ts`,
`roles.ts`, `assignments.ts`, `invitations.ts`, `notifications.ts`, `groups.ts`, and
`group-memberships.ts`, `threads.ts`, `thread-participations.ts`, `thread-messages.ts`, and
`thread-activities.ts`. They share `binding.ts`,
which is one workspace's view of the database: its identity, the transaction
boundary, and the guard each statement runs under. `storage.ts` exports
`layerWorkspace(workspaceId, options)` to compose the store layers over a binding
for the requested workspace. Its private `layerStores` merge registers each store.
`database.ts` prepares an existing SQL client in `make` and acquires the pool in
`layer`; `directory.ts` reads across workspaces, and `schema.ts` holds the tables.
Bindings and raw tables are internal to the adapter's public package surface.

Follow the [adapter naming and validation conventions](../README.md).
`PostgresDatabase.Interface` holds the `DrizzleClient` and the Effect SQL client.
Records are validated before converting them to columns, including scope/workspace
consistency and invitation expiry. Edited fields use their core schemas.
Invalid write values return the corresponding store's `Conflict` before any
statement changes data. Query results are assembled as encoded records and then
decoded with core schemas; corrupt rows remain `Failure` outcomes.

Notification recipients are Human, Agent, Contact, or workspace-singleton Triage.
Triage has no person ID. Recipient indexes normalize the missing ID only for
indexing, preserving source/recipient uniqueness for concurrent Triage inserts.
Notification reads match both recipient kind and ID, with bounded pages ordered
by recorded time and ID using `COLLATE "C"` to match SQLite's binary ordering.
Notification IDs and source/recipient associations are unique within the workspace.
Inserts join the journal transaction; source existence and recipient selection
remain generation responsibilities. The notification projection generates opening and reply message notifications from recorded thread activity
and discards pending agent input when its participation ends.
`NotificationStore.acknowledge` conditionally changes a pending notification to `Acknowledged`,
preserving source and recipient fields. It validates the outcome against the recipient and requires
the active transaction. Human `Seen` uses `acknowledgment_outcome` and `acknowledged_at` columns;
the state constraint rejects missing fields, inconsistent variants, and nonhuman Seen records.
This replaces the development baseline. Recreate disposable PostgreSQL databases when adopting it.

## Transactions

Private team creation records its group and explicit initial admissions in the shared
workspace commit. Group admissions reference workspace memberships and have distinct IDs;
a unique index prevents competing active admissions for the same group/member pair.
Stores validate records and workspace references before writes. Replay accepts historical
references to removed workspace members; current eligibility belongs to application operations.
The group suite covers permission grants, rollback, reopening, replay, and direct-store
constraints. See [group creation](../../docs/group-workflows.md) for the implemented scope.
Later member additions reuse the same store and admission facts. The membership suite
also verifies exact group grants, concurrent additions over independent connections,
duplicate rejection, current eligibility, rollback, and replay. Removal and self-leave end a
specific admission through a conditional status update; readmission uses a fresh ID. Workspace
removal lists and settles active group admissions within the same transaction. Departure tests
cover attribution, stale requests, partial-cleanup rollback, replay, and concurrent departure
and admission/removal races. Departure reuses the existing schema baseline.
Authorized group reads also reuse these stores: ordinary reads require audience membership
and `group.read`; explicit management reads inspect a known group under its management grant.
The read suite verifies permission and audience separation, current rosters, staged changes,
revocation, and reads without opening transactions. New role bundles include `group.read`;
existing stored roles are unchanged.

Thread opening persists the thread, its initial participants, a text message, ordered activity,
and notifications in one workspace commit. Broadcast enrolls current group members; mentions
narrow the initial set. Participation references the exact group admission; departure ends it
and discards pending agent input. Activity facts preserve recipient selection for replay.
Thread reads enforce audience and action permissions in core. Timeline paging uses the existing
workspace/thread/sequence index with an exclusive sequence cursor and a row limit. No new schema
is needed for reads. Adapter tests cover page boundaries, ordering, workspace isolation, staged
activity, current grants and admission state, and rejection of inconsistent references.
Human replies use the same tables and transaction boundary. The latest-activity lookup uses
the workspace/thread/sequence index; insertion still rejects duplicate positions and gaps.
Reply tests cover scoped publishing grants, new and returning participants, addressing, concurrent
replies/departures, rollback, reopening, and replay.
Self-follow records a quiet activity referencing its participation, with no message or notifications.
Activity rows enforce exactly one message or participation reference, with at most one activity
per participation and lifecycle kind. Ending activity validates the participation’s terminal state
and departure time and preserves its reason. Unfollow, group departure, and workspace removal
record the same per-participation ending facts and activity; pending agent input is discarded
in the same commit. Every kind uses the common activity-recorded fact and notification generator. The participation suite covers scoped grants, quiet follows,
rejoining, stale requests, concurrent publication, rollback, historical reads, and replay.
Participation lifecycle activity updates the development baseline: recreate
disposable databases rather than applying an upgrade chain. See [thread workflows](../../docs/thread-workflows.md).

`log_append_keys` stores durable append receipts, scoped by workspace, log, and
idempotency key. Key lookup precedes expected-position checks; matching bytes
return the original append slice, while conflicting bytes or count fail. The key,
entries, and projection writes commit or roll back together. See the [journal contract](../../docs/journal.md#idempotent-publication-and-append).

Writers to one workspace take turns: each commit takes a transaction-scoped
advisory lock keyed by the workspace before it runs, bounded by `lockTimeout`
(five seconds by default), and maps lock timeouts and serialization errors at the
transaction boundary to store conflicts without retrying. `DeadlockError` is not
included in that classification and currently becomes a failure. Reads outside a
transaction see committed state. A statement PostgreSQL
refuses aborts its transaction; the commit checks what PostgreSQL actually did,
so a program that swallowed such a refusal fails rather than losing its writes.
Waiting readers poll the log every `pollInterval` (100 milliseconds by default).

Ordinary application reads and SSE authorization do not open a transaction or take
the workspace advisory lock. They use available pool connections to query committed
state while writers hold that lock. Separate queries may observe concurrent changes;
reads inside an existing transaction use its staged state.

The binding opens transactions with plain `BEGIN`; it does not pin isolation.
The database/session default therefore still controls snapshot behavior despite
the workspace advisory lock. Tests do not cover arbitrary changed isolation
defaults. Every failed COMMIT effect currently returns `Store.CommitUncertain`,
including errors that could be classified as definite rollback. See the
[known limitations](../../docs/current-status.md#commit-outcomes-and-postgresql-contention).

The optional `Store.transaction` observer runs after PostgreSQL confirms COMMIT,
inside its uninterruptible completion boundary. It is skipped on rollback and
uncertain outcomes. `Store.notifyCommit` logs observer failures without changing
the committed result. Observers must not access storage or wait for consumers;
the connection is still reserved. Core uses this hook to publish its collected
domain events to the workspace's process-local bus.

## Composition

```ts
Gateway.layer.pipe(
  Layer.provideMerge(WorkspaceEvents.layer()),
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

The suites separate database construction, transactions, journal behavior,
authorization, gateway workflows, and invitations. Each file creates its fixture
through `support.ts`. The PostgreSQL Vitest project's global setup owns the shared
test cluster; individual tests own their temporary databases. `contracts.test.ts` runs
the same direct-store rejection and round-trip scenarios as SQLite, including
role validation, every foreign scope shape, missing or blank invitation roles, invalid invitation expiry, checkpoint
validation, and rollback. Engine-specific locking and aborted-transaction tests
remain separate from these shared contract expectations.
`notification-sources.test.ts` mirrors SQLite coverage for current source authorization,
historical recipient integrity, direct entry lookup, no-write resolution, staged visibility,
rollback, reopening, and gateway outcomes.
`notification-acknowledgment.test.ts` mirrors SQLite's ownership, atomicity, repeat handling,
concurrent requests, source-access loss, direct-store validation, reopening, and replay checks.
