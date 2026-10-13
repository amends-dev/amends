# @amends-dev/storage-postgresql

Workspace storage, each workspace's signal hub, the workspace directory, the host's accounts, and
sign-in's codes and sessions over PostgreSQL: the storage the [local host](../../hosts/local/README.md) runs on. Statements are
written with Drizzle and run through `@effect/sql-pg`, so they share the Effect client's transaction
service: the journal opens each commit on a reserved connection, and every statement inside it lands
there. The adapter passes the [conformance suites](../../packages/gateway/README.md#conformance)
every storage adapter runs. It is internal to this repository and not published to npm.

## Use

```ts
Gateway.layer().pipe(
  Layer.provideMerge(PostgresStorage.layer()),
  Layer.provide(PostgresDatabase.layer({ url: Redacted.make(databaseUrl) }))
)
```

`PostgresStorage.layer(options)` provides the storage contract, with its signal hubs, the directory, the
accounts, and the sign-in storage, leaving the database, and the cryptography that issues human IDs, to the host. Its
options are the [lock and timeout](#locks-and-timeouts) settings and `credentialKey`, the 32 bytes,
as base64, that seal connections' credentials; without it the store keeps none and reports
`Unavailable`. `PostgresDatabase.layer` takes the Effect client's pool configuration, such as
`maxConnections` (ten by default), and applies the schema before returning.
`PostgresDatabase.make` instead takes a `SqlClient.SqlClient` from the context and applies the
schema through it, inside a transaction holding an advisory lock, so processes starting together on
an empty database take turns. Keep the client's scope open while using the result; bindings,
queries, and journal transactions all share it.

## Schema

`src/internal/schema.ts` gives every record field its own column, except a few whose shape varies by
kind, stored as JSON: an activity's details, a session log entry's details, a connection's settings,
a channel binding's conversation, and what a harness's agent returned of its session. Each table
leads its primary key with `workspace_id`, and each reference between tables carries the workspace,
so a join that starts scoped stays scoped. Projection tables have no foreign keys to one another:
each read model rebuilds alone, in any order, and core checks references when it publishes the facts
they come from. The log's own tables keep theirs. Three tables span workspaces: `accounts`, the
host's people, a human ID for each lowercase address, which is unique; `sign_in_codes`, each
address's pending code digest with its expiry, failed tries, and sends in the current window; and
`sign_in_sessions`, each session by its token's digest, with its account's human ID, start, and end.
`PostgresSignInStorage.modifyCode` reads, decides, and writes an address's code in one transaction
holding an advisory lock keyed by the address, so changes to it take turns across processes. Tagged
unions become a discriminator column plus the columns each case needs, with a check constraint that
they agree.

`drizzle/` holds one generated baseline for a fresh database, which `PostgresDatabase.make` applies
once. There are no upgrade migrations, backfills, or legacy formats; see [Development](#development)
for changing the schema.

### Journal

Journal entries keep `subject`, `fact_name`, and `fact_version` in columns and only the domain
payload as binary, with the provenance's performer, cause, correlation, and time in columns of their
own; check constraints require a complete header and a valid performer and cause. Execution log
entries leave the header null. `log_entries_by_fact` serves ordered reads by fact name,
`log_entries_by_subject` an entity's history across fact names, and `log_entries_by_commit` keyed
append receipts and batch reads by commit. `log_append_keys` stores durable append receipts by
workspace, log, and key: a matching retry returns the original append, and conflicting content
fails. `Store.getEntry(logId, entryId)` reads one entry by its key, in the caller's transaction or
none. `checkpoints` holds the progress of a projection being rebuilt and `live_projections` the
versions each log's commits apply; live commits write neither. See the
[storage envelope](../../docs/journal.md#storage-envelope) and
[live projections](../../docs/journal.md#live-projections).

### Members, access, and groups

Members keep their name in a `name` column, which the directory also returns.
Invitations store a required role ID, role permissions are a text array, and grant scopes have a
column for each target kind, such as `target_connection_id`. `builtin_role_revisions` holds each
workspace's built-in bundle revision, which an upsert only moves forward.

Groups are team or direct rows: team groups fill `visibility` and `name`, direct groups `member_ids`
and `direct_key`, derived from the ordered member set, and `groups_kind` rejects rows that mix them.
`direct_groups_by_members` allows one direct group per member set. Group admissions reference
memberships, and a unique index allows one active admission per group and member; removal and
leaving end a specific admission with a conditional update, and readmission takes a fresh ID.
`group_follows` stores each follow with its admission, and `active_group_follow` allows one active
follow per admission.

### Threads and activity

A participant is a member, a contact, or triage, stored in `participant_kind` with its own columns;
`participation_participant` rejects mixed rows, and `active_thread_participation` keeps one active
participation per participant in a thread. Message authors and thread creators use a kind column the
same way, and `thread_messages` records how a message came about, an agent's turn or a channel's
message, as `via_kind` with that source's columns.

Activity rows hold every kind in one shape: the position columns, the dotted `kind`, its `subject`,
a nullable `occurrence` key, `new_activity`, and the kind's `details` as `jsonb`, so a new kind
needs no migration. A unique index on the workspace and `occurrence` keeps a kind recorded once per
subject; repeatable kinds leave it null. Core defines and validates each kind, and the table has no
per-kind constraint. Inserting at a thread's sequence rejects duplicates and gaps.

Threads keep `latest_sequence` and `latest_activity_at` for their latest message, and groups
`latest_activity_at`; updates only move them forward. `threads_by_latest` serves a group's threads
newest activity first and `threads_by_start` newest start first, each from an exclusive row cursor;
a stream page reads its threads' first activities through the `(thread_id, sequence)` index and
counts their messages in one grouped query. A group or workspace departure ends every participation
of the admission in one `UPDATE` through `participations_by_admission`.

### Notifications and read state

A notification's recipient is a human, agent, or contact, or the workspace's one triage, which has
no ID; recipient indexes normalize the missing ID for indexing alone, so concurrent triage inserts
stay unique. A human or agent recipient also records `recipient_member_id`, the membership notified,
and the inbox indexes key on it or on the contact's ID, so a member who rejoins under a new ID reads
none of the earlier membership's. The row's `state` is the notification's, and `notification_state`
checks that each state holds its own columns and no other's; an accepted notification records what
accepted it, an agent's turn or a delivery to a contact.

A person's `Seen` is private state outside the journal, so it is also kept in `notification_seen`,
which has no foreign key to `notifications`: rebuilding them keeps it, and inserting a pending human
notification restores `Seen` from it in the same statement. `markSeen` checks every notification in
one query, then sets the pending rows to `Seen` and records `notification_seen` in one statement, so
concurrent calls take turns on the rows' locks and agree on the first time. The pending indexes
cover only pending rows, so pending reads and counts never visit a reader's seen history.
`notifications_by_thread` serves a reader's notifications from one thread by position, and
`pending_notifications_by_group` counts them per group and settles a departing member's pending ones
in one statement per recipient kind.

`thread_read_positions` and `group_read_times` hold private read state, reference no projection
rows, and survive rebuilds. Their upserts keep the later value with `greatest`, and run on their
own, without the workspace lock, when the caller has no transaction.

### Connections, agents, and turns

`connections` holds connections, with an integration's settings as JSON. `connection_credentials`
holds each connection's credential outside the read models, sealed with the host's credential key
using AES-256-GCM with a random nonce, bound to its workspace and connection as additional data, and
replaced in place when its key is. A malformed key stops the storage from starting.

`agents` holds one row per agent, with a unique membership per workspace; each part of its setup is
its connection's ID as a column, where a null `harness_connection_id` is `Auto`, a null
`model_effort` the model's default, and a null `sandbox_connection_id` no sandbox. `turns` holds
agents' turns, with a partial unique index allowing one active turn per agent and thread, and the
harness, model, and sandbox a turn started on as columns set all together or not at all.

`session_states` holds each participation's harness session as its last turn left it, and
`session_log_entries` each participation's session log, keyed by position, with each entry's kind
and turn as columns and the rest in `details`. Session log statements run apart from any transaction
the caller is in, since the log takes part in no commit: an append checks the log's latest position,
the key refuses a position taken meanwhile, which is the store's `Overtaken`, and it then notifies
readers waiting for an append. Both tables, like credentials, survive rebuilds.

### Channels

`channels` holds each channel, `channel_bindings` each bound thread's conversation, keyed by the
thread and unique per channel and conversation, `contacts` the people heard from through channels,
and `channel_deliveries` each message's delivery to a conversation. Deliveries keep a partial index
of a thread's requested deliveries by sequence, and an index by channel, conversation, and external
message ID that recognizes an echo.

### Access paths

Indexes that list IDs end with `id COLLATE "C"`, so results come back in binary ID order without a
sort, and page cursors such as `(recorded_at, id)` and `(position, entry_index)` compare as rows,
which bounds the index scan; newest-first inbox pages scan the recipient indexes backwards. The
directory reads across workspaces through `members_by_identity` and
`pending_invitations_by_recipient`, counting active members only for the identity's own workspaces.

Batch reads match `id = any($1)` with the IDs bound as one array, so every batch size shares one
prepared statement, as do pending counts, `markSeen`, and checking a message's mentions.
`@effect/sql-pg` binds at most 32,767 parameters in one statement, so multi-row inserts, such as
`NotificationStore.insertMany` and a commit's batches, entries, and append keys, use as few
statements as stay within that. A plan test checks these access paths with sequential scans and
sorts disabled.

## Transactions

Appends are staged in the transaction's session. A commit reads each log's last position the first
time it appends to the log, and tracks the batch it opens and the next entry index in memory. Just
before `COMMIT` it writes the commit row, the new batches, the entries, in inserts of up to 500
rows, and the append keys; a transaction that reads whole batches of the log writes what it staged
first. Key and entry lookups inside the transaction answer staged appends from memory. A reply
therefore spends one statement per fact on journal bookkeeping, for its idempotency key, plus a few
per commit.

Core checks what the adapter writes before the adapter sees it: each store contract's `make` decodes
every input against its schema and refuses records of another workspace, so an invalid value is a
`StoreError` (`Rejected`) before any statement runs. Rows read back are assembled as encoded records
and decoded with core's schemas, so a corrupt row fails the read. A statement PostgreSQL refuses
aborts its transaction, and the commit checks what PostgreSQL actually did, so a program that
swallowed such a refusal fails rather than losing its writes.

### Locks and timeouts

Writers to one workspace take turns: each commit takes a transaction-scoped advisory lock keyed by
the workspace before it runs. A commit also holds each log it appends to, or looks up a key of, with
an advisory lock keyed by workspace and log. `Store.append` opens a commit that takes only its log's
lock, so execution output does not wait for the workspace's writers.

A process's writers to one workspace, or its standalone appends to one log, first queue in memory
(`PostgresTurns.ts`), so only the one at the front takes a pooled connection and waits for
PostgreSQL's lock. A busy workspace therefore holds at most one connection per process while its
writers wait. Waiting in that queue, for a free connection, and for the lock share one budget,
`lockTimeout` (five seconds by default); a writer still waiting when it runs out fails with a store
conflict saying what it waited for, without retrying. Lock timeouts, serialization failures, and
deadlocks at the transaction boundary map to the same conflict. A commit's `recordedAt` is taken
once the writer holds its lock, so commit times follow commit order.

Once it holds the lock, a transaction sets its own session limits, which end with it:
`statement_timeout` from `statementTimeout` (ten seconds by default, at least `lockTimeout`), and
`idle_in_transaction_session_timeout` at twice `transactionTimeout` (thirty seconds by default). A
program that runs past `transactionTimeout` rolls back and fails with a store failure; if the
process itself stalls, PostgreSQL ends its session after twice that long idle, releasing its locks.
Every duration must be finite and at least a millisecond, since PostgreSQL reads zero as no limit;
`PostgresWorkspaceStorage.make` refuses others when the host starts.

Reads outside a transaction see committed state, each on a pooled connection of its own, and take no
lock, so they proceed while writers hold the workspace. A process's statements for one workspace
outside its transactions use at most `readConnections` connections at once
(three by default, queued in `PostgresReads.ts`), so a burst of reads for one busy workspace leaves
the rest of the pool to the others. Separate queries may observe concurrent changes; reads inside a
transaction see its staged state.

A commit that appends to a log sends `pg_notify` on the `amends_notices` channel with the workspace
and log once `COMMIT` succeeds, as a statement of its own on the commit's connection, so a
notification means a commit; a commit that stores job requests sends a notice for the runners in
the same statement, as [Effect Cluster's tables](#effect-clusters-tables) describes. Each pool's listener, started by the first waiting reader, signal subscriber, or runner that
listens for job requests and stopped 30 seconds after the last, holds one connection on `LISTEN` and wakes that
log's waiters. A waiter takes its wakeup before checking the log, so an append in between still
wakes it; the log is the truth, and the notification only says when to look again. When its
connection fails, the listener listens again after a second and wakes every waiter to check what it
missed, and waiters also check every `pollInterval` (five seconds by default). `LISTEN` needs a
session connection, so behind a transaction-pooling proxy the adapter falls back to that interval.

The binding opens transactions with plain `BEGIN` and does not pin isolation, so the database's
default still controls snapshots. Every failed `COMMIT` returns `Store.CommitUncertain`, including
errors that could be classified as a definite rollback; see
[known limitations](../../docs/current-status.md#commit-outcomes-and-postgresql-contention).

## Signals

Each workspace's [signal hub](../../packages/core/README.md#signals) relays signals on the same
channel: `publish` sends the JSON-encoded signal with its workspace through `pg_notify` outside any
transaction, and the listener in every pool, the sender's included, decodes it once and offers it to
that workspace's subscribers through the pool's `LocalSignalHub`. A subscriber more than 256
behind misses the oldest, and a signal this version cannot decode is skipped. Nothing is stored:
signals sent while a listener reconnects are lost, a failed publish is logged rather than failing
its operation, and a payload over PostgreSQL's 8,000-byte notification limit is not delivered.
Behind a transaction-pooling proxy, signals are unavailable.

## Effect Cluster's tables

A host that runs jobs on Effect Cluster over this database keeps Cluster's tables beside the
adapter's, which Cluster creates itself with its `cluster` prefix and never prunes.
`PostgresClusterStorage.layerOneAtATime(cluster)` builds Cluster's layer one process at a time,
under a session-level advisory lock: Cluster checks for its migrations table and then creates it,
so processes starting together over a new database would otherwise fail all but one.
`PostgresClusterStorage.prune(entityTypes, before, options?)` removes the handled messages of those
entity types stored before a time, with their replies, at most `batch` per statement (a thousand by
default), and returns how many went; messages not yet handled stay however old.
`PostgresClusterStorage.claimAddress(address)` holds a runner address for its scope, so two
processes never run Cluster at one address: it fails with `AddressTaken` while another holds it. The
claim is a session-level advisory lock on a connection it keeps, released before the connection
returns to the pool, or by PostgreSQL when the process dies.

Cluster looks for a request as it stores it, before the commit that stores it can show it, so the
runner that owns the job would find it only at its next read. `PostgresClusterStorage.layerWakeup`
provides cluster's `JobRequests.Wakeup` for commits in this adapter's transactions: once the commit
is done, this process's runner reads storage again, and a `job-requests` notice, sent with the
commit's other notices in their one statement and once however many requests the commit stored,
reaches every pool. `PostgresClusterStorage.layerWakeupListener` keeps a process that runs jobs
listening, holding the listener's connection while it runs, and has its runner read storage at each
notice and whenever the listener connects. A notice lost, or `LISTEN` unavailable behind a
transaction-pooling proxy, leaves the request to the runner's next read.

## Layout

The package exports the `Postgres*` modules; the rest is under `src/internal/`. There, one module
per store exports `make` and a `layer` for the core store it implements, such as `members.ts`,
`threads.ts`, `turnRecords.ts`, `sessionLogs.ts`, and `deliveries.ts`. They share `binding.ts`, one
workspace's view of the database: its identity, the transaction boundary, and the guard each
statement runs under. `PostgresWorkspaceStorage.ts` composes every store over a binding
for one workspace (`layerWorkspace`), its private `layerStores` registers each store, and
`PostgresStorage.ts` is the adapter: every gateway contract it implements, in one layer.
`PostgresDatabase.ts` prepares the SQL client, `PostgresDirectory.ts` reads across workspaces,
`internal/schema.ts` holds the tables, `PostgresNotices.ts` is the pool's notification listener
that `PostgresSignalHub.ts` binds to each workspace, `PostgresTurns.ts` and `PostgresReads.ts` are
the writer queue and read cap above, `internal/credentialKey.ts` seals credentials, `PostgresAccounts.ts`
and `PostgresSignInStorage.ts` keep the host's accounts and sign-in, and
`PostgresClusterStorage.ts` is Cluster over this database: the upkeep of its tables and the
wakeup for the job requests commits store.
Follow the [adapter conventions](../README.md).

## Development

To change the schema, edit `src/internal/schema.ts`, remove the generated baseline in `drizzle/`,
generate a new one, commit it, and reset development databases:

```sh
bun run --filter @amends-dev/storage-postgresql generate --name=workspace_storage
```

CI regenerates the baseline and fails when it differs from the committed one. The adapter's tests
run in the `postgresql` project:

```sh
bun run test --project postgresql adapters/storage-postgresql
```

They need a PostgreSQL server: `AMENDS_POSTGRES_URL` names one the tests may create databases on.
Without it, the tests start a throwaway cluster from a local installation found on `PATH` or in the
usual Homebrew and Debian locations, and stop it afterwards; without either, they are skipped. Each
test creates its own database and drops it when done.

`test/fixture.ts` opens a database per test for the conformance suites, which `conformance.test.ts`
runs: another host is another pool, and a test that asks for prompt contention gets a
100-millisecond lock timeout. Beside that run, only what PostgreSQL stores or fails differently is
tested here, such as a failed `COMMIT` returning `CommitUncertain` and the lock and session limits (`transactions.test.ts`), the
fact columns (`fact-metadata.test.ts`), a refused statement still aborting its transaction
(`invitations.test.ts`), waiters woken through notifications (`journal.test.ts`), construction,
concurrent schema application, and the plan test (`database.test.ts`), scope columns
(`scope.test.ts`), and Cluster's tables (`cluster-storage.test.ts`). `test/postgres.ts` finds or
starts the server and makes temporary databases. See [testing](../../docs/testing.md).
