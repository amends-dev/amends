# PostgreSQL storage

Workspace storage, the workspace directory, and the signal hub over PostgreSQL. Statements are
written with Drizzle and run through `@effect/sql-pg`, so they share the Effect
client's transaction service; the journal opens each commit on a reserved
connection and every Drizzle statement inside it lands on that connection.

## Schema

`src/schema.ts` gives every record field its own column. Each table leads its
primary key with `workspace_id`, and each reference between tables carries the
workspace, so a join that starts scoped stays scoped. Projection tables have no foreign keys to
one another: each read model rebuilds alone, in any order, and core checks references when it
publishes the facts they come from. The log's own tables keep theirs. Tagged unions become a discriminator column plus the columns each case
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

`log_entries_by_commit` supports keyed append receipts and batch reads by workspace, log,
commit, and entry index; a plan test checks that commit lookups use this index. Adding it replaced the
development baseline; recreate disposable PostgreSQL databases when adopting it.

`group_follows` stores each follow with its group, member, admission, and times;
`group_follow_state` ties `ended_at` to the status, `active_group_follow` allows one active follow
per admission, and `group_follows_by_group` serves a group's active followers at thread start in
binary ID order. Adding it replaced the development baseline.

Threads keep `latest_sequence` and `latest_activity_at` for their latest message, constrained by
`thread_latest`, and groups `latest_activity_at`; updates only move them forward. Notifications
carry `thread_id`, `thread_group_id`, and `thread_sequence` for thread activity.
`pending_notifications_by_thread` serves a reader's pending notifications from one thread, and
`pending_notifications_by_group` counts them per group for the sidebar. `thread_read_positions` and
`group_read_times` hold private read state; their upserts keep the later value with `greatest` and
run on their own, without the workspace lock, when the caller has no transaction.

Read-state tables reference no projection rows, so rebuilding projections keeps them.
`threads_by_latest` serves a group's threads newest latest activity first, from an exclusive
`(latest_activity_at, id)` cursor, and `threads_by_start` newest start first, from an exclusive
`(created_at, id)` cursor. A stream page reads its threads' first activities through the
`(thread_id, sequence)` index and counts their messages with one grouped query.

`active_group_memberships_by_member` pages a member's current groups in group-ID order for
group lists; rosters page a group's active admissions by admission ID.

`active_participations_by_thread` pages a thread's current participants by participation ID,
and `active_thread_participation`, the index that keeps one active participation per participant,
also finds the participants a start or reply names. `active_group_membership` likewise finds the
current admissions of the members it names.

`participations_by_thread` and `group_memberships_by_member` serve a thread's participation
history, participant checks, and a member's group admissions; they and `threads_by_group` and
`participations_by_admission` end with `id COLLATE "C"`, so results come back in binary ID
order without a sort. Notification and fact pages compare `(recorded_at, id)` and
`(position, entry_index)` cursors as rows, which bounds the index scan instead of filtering
earlier rows; newest-first inbox pages scan the same recipient indexes backwards. The directory reads across workspaces through `members_by_identity` and
`pending_invitations_by_recipient`, and counts active members only for the identity's own
workspaces; a workspace whose members were all removed still lists with a count of zero.
A plan test checks these access paths, and the pending notification indexes, with sequential
scans and sorts disabled, and that a pending read filters out none of the reader's seen rows. These indexes
replaced the development baseline; recreate disposable PostgreSQL databases when adopting it.

Members keep the name they chose in a nullable `name` column, which the directory also returns;
a null reads as a member without a name. Renaming updates only an active member's row. Adding
the column replaced the development baseline; recreate disposable PostgreSQL databases when
adopting it.

Batch reads (`getMany` on members, group admissions, thread participations, and messages) match
`id = any($1)` with the IDs bound as one array against each table's workspace/ID key, so every
batch size shares one prepared statement. Notification pending counts and `markSeen` match their
group and notification IDs the same way, `markSeen` records them from that array in one
statement, and a message's mentions are checked against its thread's participations in one
query. `@effect/sql-pg` binds at most 32767 parameters in one statement, fewer than PostgreSQL
itself allows, so multi-row inserts, `NotificationStore.insertMany` and a commit's batches,
entries, and append keys, use as few statements as stay within one parameter per column and row.

`Store.getEntry(logId, entryId)` uses the existing workspace/entry primary key and filters by
log ID. It decodes the stored envelope through the same path as journal pages, honors a caller's
transaction, and opens none. This supports notification-source reads without scanning the log
or changing the schema.

Fact entries require complete provenance. There are no upgrade migrations,
backfills, or legacy envelope formats. See the
[storage envelope](../../docs/journal.md#storage-envelope).

## Layout

One module per store, each exporting `make` and a `layer` for the core service it implements:
`journal.ts`, `checkpoints.ts`, `workspaces.ts`, `members.ts`, `roles.ts`, `assignments.ts`,
`invitations.ts`, `notifications.ts`, `groups.ts`, and `group-memberships.ts`, `group-follows.ts`,
`read-states.ts`, `threads.ts`, `thread-participations.ts`, `thread-messages.ts`, and
`thread-activities.ts`. They share `binding.ts`, which is one workspace's view of the database: its
identity, the transaction boundary, and the guard each statement runs under. `storage.ts` exports
`layerWorkspace(workspaceId, options)` to compose the store layers over a binding for the requested
workspace. Its private `layerStores` merge registers each store. `database.ts` prepares an existing
SQL client in `make` and acquires the pool in `layer`; `directory.ts` reads across workspaces, and
`schema.ts` holds the tables. `notices.ts` is the pool's notice channel and listener,
`signals.ts` the signal hub over it, `turns.ts` the queue in which a process's writers to
one workspace or log wait for each other, and `cluster-storage.ts` the upkeep of Effect
Cluster's tables. Bindings and raw tables are internal to the adapter's public package
surface.

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
A human or agent recipient also records `recipient_member_id`, the membership notified, which
`notification_recipient` requires for them alone. The inbox indexes key on that membership, or on
the contact's ID, so a member who rejoins under a new ID reads none of the earlier membership's.
Notification reads match both recipient kind and inbox, with bounded pages ordered
by recorded time and ID using `COLLATE "C"`, which orders IDs by their bytes.
Notification IDs and source/recipient associations are unique within the workspace.
Inserts join the journal transaction; source existence and recipient selection
remain generation responsibilities. The notification projection generates opening and reply message notifications from recorded thread activity
and discards pending agent input when its participation ends, and a person's pending notifications
from a group they leave, with one update through `pending_notifications_by_group`, which the plan
test checks. Adding the `access-lost` reason replaced the development baseline.
The row's `state` holds what the journal settles: `Pending`, `Discarded`, or `Informational`. A human's `Seen` lives
in `notification_seen`, keyed by workspace and notification with the first `seen_at`, which is not
a projection table: it has no foreign key to `notifications`, so truncating and rebuilding them keeps
it. The row keeps a copy in `seen_at`, which `notification_seen_state` allows only on a pending
human notification: reads show it as `Acknowledged`, and the pending indexes leave seen rows out, so
pending reads and counts never visit a reader's seen history however long it grows. An insert
restores the copy from `notification_seen` in the same statement, so a rebuild keeps what was seen.
`markSeen` checks every notification in one query, then in one statement sets the rows' `seen_at`
and records `notification_seen`, keeping existing times, in the caller's transaction or on its own;
updating the rows first makes concurrent calls take turns on their locks and agree on the first time.
`pending_agent_notifications_by_participation` finds the pending agent input a departure settles.

## Transactions

Groups are team or direct rows. Team groups fill `visibility`, `Private` or `Public`, and `name`;
direct groups fill `member_ids` and `direct_key`, derived from the ordered member set, and
`groups_kind` rejects rows mixing them. `direct_groups_by_members` allows one direct group per
member set, and `findDirect` resolves a set in any order. `public_groups` pages the public groups
in binary ID order for browsing, and `summarize` sizes a page of them, with whether the reader
belongs, in one grouped read over `active_group_membership`; the plan test checks both. Adding
public groups replaced the development baseline; recreate disposable PostgreSQL databases when
adopting it.
Team creation records its group and explicit initial admissions in the shared
workspace commit. Group admissions reference workspace memberships and have distinct IDs;
a unique index prevents competing active admissions for the same group/member pair.
Stores validate their own records before writes and take references to other read models as
recorded; whether those exist and are current belongs to application operations.
The group suite covers permission grants, rollback, reopening, replay, and direct-store
constraints. See [group creation](../../docs/group-workflows.md) for the implemented scope.
Later member additions reuse the same store and admission facts. The membership suite
also verifies exact group grants, concurrent additions over independent connections,
duplicate rejection, current eligibility, rollback, and replay. Removal and self-leave end a
specific admission through a conditional status update; readmission uses a fresh ID. Workspace
removal lists and settles active group admissions within the same transaction. Departure tests
cover attribution, stale requests, partial-cleanup rollback, replay, and concurrent departure
and admission/removal races. Departure reuses the existing schema baseline.
Authorized group reads also reuse these stores: reads require audience membership and
`group.read`, and no read reaches a group from outside it.
The read suite verifies permission and audience separation, current rosters, staged changes,
revocation, and reads without opening transactions. `builtin_role_revisions` holds the built-in
bundle revision of each workspace's roles, which an upsert only moves forward.

Thread opening persists the thread, its initial participants, a text message, ordered activity, and
notifications in one workspace commit. A team-group opening enrolls its author and mentioned
members; a direct-group opening enrolls all its members. A participant is a member, a contact, or
triage, stored in `participant_kind` with its own columns: members fill `member_id`,
`group_membership_id`, and their identity; contacts fill a `Contact` identity; triage fills none.
`participation_participant` rejects mixed rows, and `active_thread_participation` keeps one active
participation per member, contact, or triage in a thread. Message authors use `author_kind` with a
member or contact column, and thread creators `created_by_kind` likewise; core requires every
author to participate in the thread and decides which authors may publish. Departure ends a
participation and discards pending agent input. Activity facts preserve recipient selection for
replay. Thread reads enforce audience and action permissions in core. Timeline paging uses the
existing workspace/thread/sequence index with an exclusive sequence cursor and a row limit. No new
schema is needed for reads. Adapter tests cover page boundaries, ordering, workspace isolation,
staged activity, current grants and admission state, and rejection of inconsistent references. Human
replies use the same tables and transaction boundary. The latest-activity lookup uses the
workspace/thread/sequence index; insertion still rejects duplicate positions and gaps. Reply tests
cover scoped publishing grants, new and returning participants, addressing, concurrent
replies/departures, rollback, reopening, and replay. Self-follow records a quiet activity
referencing its participation, with no message or notifications. Activity rows hold every kind in
one shape: the common position columns, the dotted `kind`, its `subject`, a nullable `occurrence`
key, `new_activity`, and the kind's encoded `details` as `jsonb`, the one field not given its own
columns, so a new kind needs no migration. A unique index on the workspace and `occurrence` keeps a
kind recorded once per subject, as with one activity per message or per participation ending;
repeatable kinds leave it null. Core defines and validates each kind; the table has no per-kind
constraint. Ending activity follows the participation's ending in the same commit and preserves its reason.
Unfollow, group departure, and workspace removal record the same per-participation ending facts and
activity; pending agent input is discarded in the same commit. Every kind uses the common
activity-recorded fact and notification generator. The participation suite covers scoped grants,
quiet follows, rejoining, stale requests, concurrent publication, rollback, historical reads, and
replay. Participation lifecycle activity updates the development baseline: recreate disposable
databases rather than applying an upgrade chain. See [thread
workflows](../../docs/thread-workflows.md).

`checkpoints` holds the progress of a projection being rebuilt, and `live_projections` the
projection versions each log's commits apply, one row per name. Live commits write neither;
going live replaces the log's rows in the rebuild's last step. See [live
projections](../../docs/journal.md#live-projections).

Appends are staged in the transaction's session. A commit reads each log's last position once,
the first time it appends to that log, and tracks the batch it opens and the next entry index in
memory. Just before `COMMIT` it writes the commit row with its entry count, the new batches, the
entries (in inserts of up to 500 rows), and the append keys, a statement each unless they exceed
the driver's parameter limit; a transaction that reads whole batches of the log writes what it
has staged first. Key and entry lookups inside
the transaction answer staged appends from memory, and a transaction remembers the keys it has
looked up, since it holds the log from its first lookup or append. A reply therefore spends one statement per
fact on journal bookkeeping, for its idempotency key, plus a few per commit.

`log_append_keys` stores durable append receipts, scoped by workspace, log, and
idempotency key. Key lookup precedes expected-position checks; matching bytes
return the original append slice, while conflicting bytes or count fail. The key,
entries, and projection writes commit or roll back together. See the [journal contract](../../docs/journal.md#idempotent-publication-and-append).

### Locks and timeouts

Writers to one workspace take turns: each commit takes a transaction-scoped
advisory lock keyed by the workspace before it runs. A commit also holds each log it appends
to, or looks up a key of, with a transaction-scoped advisory lock keyed by workspace and log.
`Store.append` opens a commit that takes only its log's lock, so execution output does not
wait for the workspace's writers, and a transaction waits for it only on a log both write.

A process's writers to one workspace, or its standalone appends to one log, first queue in
memory (`turns.ts`), so only the one at the front takes a pooled connection and waits for
PostgreSQL's lock. A busy workspace therefore holds at most one connection per process while
its writers wait, and leaves the rest of the pool to other workspaces. Waiting in that queue,
for a free connection, and for the lock share one budget, `lockTimeout` (five seconds by
default); a writer still waiting when it runs out fails with a store conflict saying what it
waited for, without retrying. Lock timeouts, serialization failures, and deadlocks at the
transaction boundary map to the same conflict. The commit's `recordedAt` is taken once the
writer holds its lock, so commit times follow commit order.

Once it holds the lock, a transaction sets its own session limits, which end with it:
`statement_timeout` (`statementTimeout`, ten seconds by default, at least `lockTimeout`)
for each statement, and `idle_in_transaction_session_timeout` at twice `transactionTimeout`
(thirty seconds by default). A program that runs past `transactionTimeout` rolls back and fails
with a store failure; if the process itself stalls, PostgreSQL ends its session after twice that
long idle, which releases its locks. The margin keeps PostgreSQL from ending a live transaction's
session as it rolls back, which would return a closed connection to the pool. Every duration must be finite and at least a millisecond, since
PostgreSQL reads zero as no limit; `PostgresStorage.make` refuses others when the host starts.

Reads outside a transaction see committed state, each on a pooled connection of its own. A
process's statements for one workspace outside its transactions use at most `readConnections`
connections at once (three by default, queued in `reads.ts`), so a burst of reads for one busy
workspace leaves the rest of the pool to the others; the reads beyond it wait for the workspace's
own. A statement PostgreSQL
refuses aborts its transaction; the commit checks what PostgreSQL actually did,
so a program that swallowed such a refusal fails rather than losing its writes.
A commit that appends to a log sends `pg_notify` on the `amends_notices` channel with the
workspace and log, inside its transaction, so the notification arrives only if the commit
succeeds. Each pool's listener, started by the first waiting reader or signal subscriber and
stopped 30 seconds after the last, holds one pooled connection on `LISTEN` and wakes that log's
waiters in the process.
A waiter takes its wakeup signal before checking the log, so an append between the check and the
wait still wakes it; the log is the truth and the notification only says when to look again.
When its connection fails, the listener listens again after a second and then wakes every waiter
to re-check what it missed. Waiters also re-check every `pollInterval` (five seconds by default)
without a notification. `LISTEN` needs a session connection, so behind a transaction-pooling proxy
the adapter falls back to that interval.

`PostgresSignals` relays [signals](../../packages/core/README.md#signals) on the same channel:
`publish` sends the JSON-encoded signal with its workspace through `pg_notify` outside any
transaction, and the listener in every pool, including the sender's, offers it to that
workspace's subscribers. Each subscriber has a queue of 256 that drops the oldest when it falls
behind; a signal this version cannot decode is skipped. Nothing is stored. Signals sent while a
listener reconnects are lost, a failed publish is logged rather than failing its operation, and a
payload over PostgreSQL's 8000-byte notification limit is not delivered; current signals are far
smaller. Behind a transaction-pooling proxy, signals are unavailable.

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

## Effect Cluster's tables

A host that runs background work on Effect Cluster over this database keeps Cluster's tables
beside the adapter's; Cluster creates them itself, with its default `cluster` prefix, and never
removes a message or its reply. `PostgresClusterStorage.prune(entityTypes, before, options?)`
removes the handled messages of those entity types stored before a time, with their replies, and
returns how many went. A message's ID carries when Cluster stored it; messages not yet handled
stay, however old, and so do other entity types'. Each statement removes at most `batch`
messages, a thousand by default.

`PostgresClusterStorage.backgroundStatus(options?)` reports the workspaces' background work from
those tables: per process, the wakes due, scheduled, and retrying, when the longest-waiting due
wake became due, and how many wakes were dropped; then the latest retries and drops, with their
workspaces. It reports nothing before any host has run background work over the database.

`PostgresClusterStorage.claimAddress(address)` holds a runner address for its scope, so two
processes over the database never run Cluster at one address: it fails with `AddressTaken`
while another process holds it. The claim is a session-level advisory lock on a connection it
keeps, released before the connection goes back to the pool, or by PostgreSQL when the process
dies. `cluster-storage.test.ts` checks pruning and the status over real wakes, and the claim
across pools.

## Composition

```ts
Gateway.layer().pipe(
  Layer.provideMerge(layer()),
  Layer.provide(PostgresDatabase.layer({ url: Redacted.make(databaseUrl) })),
);
```

The root `layer(options)` provides the storage, directory, and signal hub contracts, with the
[lock and timeout options](#locks-and-timeouts); `PostgresDatabase.layer` takes the Effect
client's pool configuration, such as `maxConnections` (ten by default). The local host also
supplies cryptography and composes this over the database at `AMENDS_DATABASE_URL`, with
`AMENDS_DATABASE_POOL_SIZE` connections.

`PostgresDatabase.make()` instead accepts `SqlClient.SqlClient` through Effect's
context. It constructs the Drizzle facade and migrates through that same client, inside a
transaction holding an advisory lock, so processes starting together on an empty database
take turns and the later ones find nothing left to apply.
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

`test/harness.ts` runs the [conformance suites](../../packages/storage-conformance/README.md) over a
database per test: another host is another pool, woken by notifications with the default
fallback interval, and with a 100-millisecond lock timeout when a test asks for prompt
contention. Discarding projections truncates the projection tables, and the footprint counts the rows of every table. Each test file
registers one suite. Beside the registrations, only what PostgreSQL stores or fails differently is
tested here: `transactions.test.ts` injects a failed `COMMIT` to check `CommitUncertain`, and
checks the limits: queued writers leave a small pool to other workspaces, each wait ends in a
conflict naming it, a program past its deadline rolls back, a stalled process's session ends and
releases the workspace, the session limits end with the transaction, a writer that waited
records when it wrote, and invalid durations stop the storage from starting;
`fact-metadata.test.ts` checks the fact columns, `invitations.test.ts` checks that a refused
statement the program ignores still aborts its transaction, and `notifications.test.ts` checks that
a malformed stored record fails reads. `journal.test.ts` checks, with an hour-long fallback
interval, that a waiting reader wakes on another pool's commit through its notification, and still
wakes when an append lands while its listener reconnects. The signals suite covers relaying
between pools. `database.test.ts` covers construction,
concurrent migration, and access paths, and `scope.test.ts` the scope columns. Each file creates its fixture through `support.ts`; the Vitest
project's global setup owns the shared test cluster, and individual tests own their temporary
databases.

The development-only `@amends/storage-postgresql/testing/postgres` export shares
cluster discovery and scoped temporary databases with the feature workshop. Its
`database(serverUrl)` returns a URL and requires a Scope; closing that scope drops
the database. `temporary(serverUrl, use)` runs a callback in that scope. Neither
helper is part of the adapter's runtime entry point.
