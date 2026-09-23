# Journal and execution logs

The journal uses the same append-only log mechanism as execution history.
`Journal.publish` appends a fact event to its configured log and applies matching
projections inside the same commit. A turn's log stores its own schema-defined
execution entries through `Log`, without running domain projections. The generic
log mechanism is implemented; turn execution and its domain-specific log schema
remain planned. Turn and agent examples below illustrate consumers rather than
available application operations.

## Ownership

- **Fact** defines a domain statement's name, version, payload schema, required
  subject rule, and optional occurrence identity.
- **Log** provides typed appends, lookup, paged reads, finite streams, and live tails
  for a log ID.
  Opening a handle performs no storage operation; the first append creates the
  log as needed. Reopening the same ID addresses the same history.
- **Journal** binds a domain log to registered projections. Its public log view
  is read-only; fact writes go through `publish`.
- **Projection** handles a decoded fact event and updates its domain store.
  Definitions and handlers belong to domains. Live projections run inside each
  publication, and only for facts they handle, in registration order; they cannot
  append new log entries. The shared runner rebuilds a projection that is not live
  from the log, in checkpointed batches.
- **Checkpoint** is the host-implemented store for rebuild progress, keyed by log ID,
  projection name, and projection version, and for each log's live projection versions.
- **Transaction** coordinates implicit and explicit commits, nested calls,
  publication ordering, failure tracking, and transaction lifetime.
- **Store** is the host-implemented persistence contract. It supplies a native
  transaction and enlists log writes, domain projection stores, and checkpoint writes.

The core imports Effect only. Hosts choose storage and provide `Store.Service`,
`Checkpoint.Service`, and the domain store services used by projection handlers.
`Log.layer` builds the common log service and transaction coordinator from that
store and the workspace-bound `CommittedEvents.Service` supplied by the host.
`Journal.layer({ logId, projections })` builds `Journal.Service`, whose
interface stays the same as projections are added. `Journal.make` remains available
as its constructor and returns that same interface.

Projection handler and decoder dependencies are required when constructing the
journal layer or binding a standalone projection runner. The constructed service
supplies them during execution. Invocation context takes precedence over captured
context, preserving the active host transaction and giving each operation its own
scope. Projection dependencies do not appear on journal calls. A published fact's
own schema requirements remain on that particular `publish` call.

For example, `HostServices` below is a host layer supplying storage, the shared
workspace event bus, and dependencies used by an illustrative domain-owned
`AgentsProjection`. The shared log and
transaction services stay exposed so execution-log writes can join journal commits:

```ts
const JournalLive = Journal.layer({
  logId: Log.Id.make("domain"),
  projections: [AgentsProjection],
}).pipe(Layer.provideMerge(Log.layer), Layer.provide(HostServices));
```

Domains obtain the configured implementation with `yield* Journal.Service`.
All normal writers to a domain log must use the same projection registrations.

## Storage envelope

`Store.Content` separates optional `Event.Header` metadata from binary `payload`
bytes. `Store.Entry` adds the entry ID, commit, log position, index, and recording
time. The journal supplies the fact subject, name, version, and provenance as the header;
only the domain payload is encoded through its fact schema. `Event.Envelope`
remains the in-memory shape used by journal readers and projections, without a
second binary wrapper in storage.

Both adapters store `subject`, `fact_name`, and `fact_version` as columns in
`log_entries`. Separate indexes cover workspace/log/name and workspace/log/subject,
each ordered by position and entry index. SQLite stores provenance
as schema-validated JSON in its own column. PostgreSQL stores its performer, cause,
correlation, and occurrence time in separate columns. Workspace IDs in PostgreSQL
provenance are reconstructed from the containing row; writes validate workspace
consistency before omitting those repeated IDs. Neither adapter duplicates the
fact header inside a second binary wrapper.

Generic execution logs have no fact header and continue to encode their complete
schema-defined value. `Log.open` defaults to `Codec.makeEntryCodec(schema)`;
the journal explicitly selects `Event.storageCodec` to preserve the header.
Opening a fact log with an ordinary payload codec fails on read rather than
silently discarding its metadata. The storage adapter receives the distinction
directly and never infers a new entry's kind by inspecting its bytes.

Each adapter has one baseline for fresh local databases. Schema changes update
that baseline and development databases are reset. There is no upgrade chain,
legacy-envelope decoder, data backfill, or support for unattributed fact events.
Generic execution logs still have no fact header.

## Fact subjects and filtered reads

Every fact declares a pure `subject(payload)` function returning a `Subject.Value`.
Use `Subject.make("thread", threadId)` to construct a `kind:id` key. The namespace
starts with a lowercase letter and contains only lowercase letters, digits, or
hyphens; IDs are nonempty and may contain colons. Thus different entity kinds
cannot collide even when their IDs match. Subjects are local to the workspace;
queries additionally select a log.

Publication validates the decoded payload before deriving and validating its
subject. It persists that subject on the header and exposes it on decoded events.
`Event.decode` checks the persisted subject against the fact's declaration,
including during projection replay. Generic execution entries have no subject.
All domain facts require one; there is no fallback or legacy null-subject path.

`journal.read({ subject, after?, limit })` reads an entity's facts across names and
versions. A name can narrow that query, and name-only queries remain supported.
At least one of subject or name is required; a version filter also requires a
name. Pages use an exclusive `{ position, index }` cursor, so filtering or splitting
one commit across pages cannot skip its remaining matching entries. Reads are
bounded and ordered by that cursor. Use `Event.decode(fact, entry)` for payloads.

Filtered entry pages do not replace complete-batch replay or its checkpoints.
A fact subject also does not establish thread activity, participant access, or a
thread-specific sequence; those remain responsibilities of the thread domain.

## Idempotent publication and append

Declare a fact's natural occurrence identity beside its payload schema. The journal
derives the key automatically, so callers publish the fact and payload:

```ts
export const Removed = Fact.make("workspace.member.removed", {
  version: 1,
  payload: Schema.Struct({ workspaceId: Workspace.Id, memberId: Member.Id }),
  subject: (payload) => Subject.make("member", payload.memberId),
  occurrence: (payload) => [payload.memberId],
});

const remove = Effect.gen(function* () {
  return yield* journal.publish(Removed, { workspaceId, memberId });
});
```

`occurrence` is a pure, deterministic function of the validated decoded payload.
It returns a nonempty tuple of nonblank strings, or `null` when that payload has
no natural identity. The journal preserves each component exactly and encodes the
key as `fact:` followed by `JSON.stringify([fact.name, parts])`. Tuple encoding
avoids delimiter collisions, and the fact name separates creation from removal
for the same record ID. Schema versions are excluded: publishing another version
of an existing occurrence conflicts rather than creating a second occurrence.

The key identifies one occurrence within a workspace and log. Another workspace
or log has an independent key space. `Occurrence.Key`, `Store.IdempotencyKey`, and
`Log.IdempotencyKey` refer to the same branded schema. Treat the fact name, identity
components, and key encoding as persistence contracts. Definitions registered for
the same fact name and version must share the payload schema, subject function, and occurrence
function. Publication checks that same contract against registered definitions.

Existing creation and terminal facts use their stable record IDs: workspace
initialization, member addition/removal, invitation issuance/acceptance/revocation,
role creation, and assignment creation/revocation. Repeating a creation fact after
removal or revocation returns its original event; it does not reactivate the record.
Role renames, permission changes, and ownership transfers remain repeatable and
have no default occurrence identity.

`Journal.publish` accepts an explicit `idempotencyKey` only when the fact has no
occurrence function or it returns `null`. Supplying one when the fact derives a
key fails with `Store.Conflict`; callers cannot override the declared identity.
Use an explicit key for request-level retries of a repeatable fact:

```ts
const options = { idempotencyKey: Log.IdempotencyKey.make(operationId) };
const rename = Effect.gen(function* () {
  return yield* journal.publish(RoleFacts.Renamed, { workspaceId, roleId, name }, options);
});
```

`Log.append` and `Log.appendAll` continue to accept explicit keys because execution
entries have no fact definition. Calls without a derived or explicit key append
every time. The application still authorizes the operation and supplies
`Publication.Service`. Reuse the occurrence inputs or explicit key on retry; a new
UUID on every attempt identifies a different occurrence. Correlation IDs can group
several facts and must not automatically become their shared idempotency key.

| Key state                      | Outcome                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Absent                         | Check `expectedAfter`, if supplied, then append and persist the key in the same transaction.     |
| Present with matching content  | Return the original entries, including their IDs, commit, positions, timestamps, and provenance. |
| Present with different content | Fail with `Store.Conflict`; a core commit aborts even if the publication error is caught.        |

A matching key is resolved before evaluating the expected-position precondition.
Retrying with a stale `expectedAfter` returns the original result when the first
attempt committed. A new key still has to satisfy that precondition. Schema
validation applies to all supplied options, including on retries.

At the native store and `Log` boundary, matching content means identical fact
metadata, when present, and byte-identical encoded payloads in the same order and
count. One `appendAll` key identifies that call's nonempty slice, even
when other appends share its commit. Keyed empty appends are rejected. The storage
adapter returns independently owned bytes and never appends a second slice for a
matching key.

For `Journal`, matching content means the same subject, fact name, version, and encoded
domain payload. Attempt provenance is not part of the comparison: a retry can
have a fresh correlation, performer, cause, or occurrence time, but it returns
the first event's recorded provenance. The invocation still needs valid provenance
for the bound workspace. Reuse runs no projections, advances no checkpoints or
log positions, and publishes no new committed-event batch. If an uncertain first
commit missed live delivery, retry does not rebroadcast it; consumers recover
through durable history or refresh as before.

`log.getAppend(key)` and `journal.log.getAppend(key)` return `None` or the original
append's decoded entries. For facts with an occurrence rule,
`Fact.makeOccurrenceKey(fact, payload)` validates the decoded payload before
returning its derived key or `null`; it also returns `null` for facts without a
rule. Use it when the payload is available. `Occurrence.makeKey(fact.name, parts)` constructs the same key from
known identity components when looking up an occurrence before generating the
rest of its payload. Keep those components consistent with the fact's declaration.
Reads inside a transaction see its own staged keys.
The returned entries remain provisional until their owning commit succeeds.
`Store.getAppend` supplies a validated receipt with the key, commit, first index,
count, and exact entries. The entries a keyed append returns are its receipt; the log does not
read the receipt back, and the [conformance suites](../packages/storage-conformance/README.md)
check that every adapter keeps the two identical. Both adapters persist receipts in `log_append_keys`,
using a unique workspace/log/key constraint and their existing writer serialization.

Rollback removes both the append and its key. After `Store.CommitUncertain`, retry
the same keyed intent: a committed first attempt is reused, and a rolled-back one
can be appended. Storage contention may still return `Store.Conflict`; neither
core nor the adapters automatically retry transaction programs. Keys have no expiry
and must be retained with their referenced history. Changing occurrence rules during
local development requires a data reset; there is no receipt backfill.

### Composing larger operations

A keyed append does not skip arbitrary effects before or after that call. For turn
creation, channel receipts, or shared delivery creation, the domain must identify
the logical request and keep creation/reuse, related writes, and acknowledgment
inside one `journal.commit`. State derived through the keyed fact's projections
is applied only on the first publication. Other effects need their own conditional
or idempotent handling.

When an operation generates IDs or other payload fields, reuse those values on
retry. A domain can use `getAppend` inside the same commit to find an existing
occurrence before generating another ID, checking its recorded business input
before reuse. Looking up a key outside the transaction and then writing is not
an atomic create-or-reuse operation. A fresh generated payload under an old key
correctly conflicts. This primitive does not make existing HTTP operations or
external sends automatically idempotent.

## Event provenance

Every new `journal.publish(fact, payload)` requires `Publication.Service` in its
Effect context. This service holds the operation's `Event.Provenance`. The journal
reads it at publication time, validates and snapshots it, then persists it as
structured event metadata and exposes it on decoded
events, projections, committed batches, and change-feed events. `Fact` continues
to define only the domain statement. Generic `Log` entries retain their existing
metadata and do not acquire domain attribution.

| Field           | Meaning                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `workspaceId`   | The workspace where the action happened.                                                                         |
| `performedBy`   | The responsible member, non-member identity (including a contact), or explicitly identified system process.      |
| `causedBy`      | The immediate upstream event, located by workspace, log, commit, and event IDs; `null` identifies a root action. |
| `correlationId` | Groups a causal workflow across events and commits.                                                              |
| `occurredAt`    | When the domain action happened, independently of the log's `recordedAt`.                                        |

`Performer.Reference` has three variants. `Member` preserves both the membership ID
and its stable human or agent identity. `Identity` records a human or agent before
a membership exists, or an external contact without workspace membership. `System` requires a named system ID; it is never an automatic
fallback for missing identity. Attribution is historical information, not proof
of permission. Application operations still check current authority.

Wrap an ordinary application operation with `Publication.withActor`. If no
publication context exists, it reads the current actor and creates root provenance
once through `Publication.makeForActor()`, using `Crypto.Crypto` for a fresh
correlation ID and the clock for the occurrence time. Nested operations reuse
the existing context, including any explicit overrides. Publishing another fact
does not regenerate the correlation or timestamp.

Application services capture cryptography during construction and provide it to
the wrapper; identity is resolved when the operation runs. `Publication.Service`
belongs around the operation's effect, never in a shared application layer.
`Journal.make` and `Journal.layer` do not capture it. A direct publication without
the service is a missing dependency at compile time and a defect at runtime;
the journal never falls back to an authorization actor or system identity.

For a workflow whose facts are `MemberFacts.Removed` and `InvitationFacts.Revoked`:

```ts
const remove = journal.commit(
  Effect.gen(function* () {
    // The application validates inputs and authorizes this operation first.
    const removed = yield* journal.publish(MemberFacts.Removed, removal);
    yield* journal
      .publish(InvitationFacts.Revoked, revocation)
      .pipe(Publication.withCause(removed));
  }).pipe(Publication.withActor),
);
```

Here `removal` and `revocation` are validated fact payloads supplied by the workflow.
`Publication.withCause(parent, occurredAt?)` derives the parent's correlation ID,
records its reference, and captures a new occurrence time unless one is supplied.
It retains the current operation's performer and workspace. A worker processing
another actor's event therefore records itself as performer. A cause cannot switch
the current workspace. `Publication.withPerformer(performer)` and
`Publication.withOccurredAt(time)` provide focused overrides of those fields.
Each wrapper applies only to the enclosed effect or block; the surrounding context
is restored after success or failure, and concurrent fibers retain their own values.

The cause must already be visible in the workspace transaction, including an
earlier publication in the same commit. Publication rejects missing causes,
foreign workspace attribution, and a correlation that differs from an attributed
parent. Events in one commit are not automatically causes of one another.

For bootstrap and invitation acceptance, call `Publication.make(workspaceId,
performer, occurredAt?)` with the authenticated identity and provide the result
around the publication block using `Effect.provideService(Publication.Service,
provenance)`. These operations explicitly establish their authenticated performer's
context because membership may not exist yet. Acceptance records the
recipient even though its authority check temporarily evaluates the inviter.
An agent's work records the agent as performer; the requester belongs in the causal
history. Public request bodies do not select the performer. Trusted callers can
also provide a complete context directly. The low-level `Publication.makeCausedBy`
constructor remains available for explicitly constructing follow-up provenance;
its default performer is the parent event's performer, while `withCause` retains
the current operation's performer.

The journal validates and snapshots provenance before publication. Attribution and
its nested identity and cause references are immutable when delivered to projections
and subscribers. Replay preserves recorded provenance without resolving a current
actor, regenerating identifiers, or changing timestamps. Ordering uses log positions
and indexes, not occurrence times. Correlation IDs group work; they are not
idempotency keys and do not make retries safe. Domain explanations such as a rejection
reason remain in the fact payload.

All fact events require provenance, including stored entries, replayed events,
and change-feed messages. `event.provenance.causedBy === null` identifies a root
action; provenance itself cannot be missing or null.

## Commits and positions

One commit can touch multiple logs. Each log has an independent position for that
commit's batch, and entries have consecutive indexes within the batch. Several
appends to the same log during one commit extend that batch. A log position is a
batch cursor; an individual entry is located by its log ID, position, and index.
These positions are separate from thread timeline sequences.

The commit record counts entries across all affected logs. A batch contains only
that commit's entries for its particular log. Commits that do not touch a log do
not appear in that log's reads or advance its cursor.

`Log.append`, `Log.appendAll`, and `Journal.publish` create an implicit commit when
needed. `journal.commit(program)` or `logs.commit(program)` groups operations.
Nested commits join the current commit. Appends and their projection updates are
serialized within that commit, including when publications originate in parallel
fibers. Returned entry references are provisional until the outer commit succeeds.

```ts
const incorporate = Effect.gen(function* () {
  yield* journal.commit(
    Effect.gen(function* () {
      yield* turnLog.append(confirmation);
      yield* journal.publish(InputIncorporated, { turnId, throughSequence });
    }).pipe(Publication.withActor),
  );
});
```

The domain supplies the fact and execution-entry schemas in this example. The two
entries belong to different logs but become visible together with the projection
updates. Ordinary harness output can use `turnLog.append` directly.

Keep commit programs limited to short storage work. Harness execution, model
inference, and other external actions belong outside storage transactions.

## Failure and recovery

A failed publication or nested commit makes the entire commit fail even if its
caller catches the original error. Completed appends and projection updates remain
staged and roll back together. This rollback applies to the transactional stores;
it does not undo external actions, which projections must not perform.

The coordinator closes scopes, waits for accepted writes, and rejects late writes
using an expired commit context. Callers must await their work within a commit.
Expected projection decoder and handler failures become `Projection.Failure`, with
the projection key, source entry cursor, `decode` or `apply` phase, and the original
error in `cause`. This keeps the journal's error contract independent of registered
handlers. Defects and interruption keep their Effect causes. A caught failure is
still reported at the outer commit boundary as `Commit.Aborted`.

Adapters report unconfirmed commit outcomes with `Store.CommitUncertain`, including
the commit ID for lookup and reconciliation. The core does not automatically retry
the program. Optional expected-position checks support conditional appends;
idempotency keys separately support retrying the same append or publication.
Both adapters currently classify every failed COMMIT effect as uncertain, including
some errors with a definite rollback outcome. PostgreSQL deadlock classification
also remains incomplete. See [known limitations](current-status.md#commit-outcomes-and-postgresql-contention).

## Reading and replay

`journal.log.getEntry(entryId)` resolves one entry directly by ID within the bound workspace and
log, returning `Option<Log.Entry<Event.Envelope>>`. Generic `Log.Handle.getEntry` returns the
same optional entry shape decoded with that log's codec. Both validate entry identity and log
ownership. Missing or foreign-log IDs return `None`; malformed stored entries fail the read.
The adapters use the existing workspace/entry primary key and also filter by log ID. Lookup
opens no transaction, sees staged entries inside a caller's transaction, and changes no journal,
projection, or checkpoint state. Application authorization remains separate: notification source
resolution checks ownership and current thread access before returning conversation content.

`journal.read({ name, version?, after?, limit })` queries matching fact entries
directly in storage. Omitting `version` includes every stored version of that name;
supplying it selects an exact version. Results are `Log.Entry<Event.Envelope>`
values, whose domain payload bytes can be decoded with the corresponding fact:

```ts
const readCreatedRoles = Effect.gen(function* () {
  const entries = yield* journal.read({
    name: RoleFacts.Created.name,
    version: RoleFacts.Created.version,
    limit: 100,
  });
  return yield* Effect.forEach(entries, (entry) => Event.decode(RoleFacts.Created, entry));
});
```

Here `limit` counts matching entries. Resume with the last returned entry's
`{ position, index }`; the cursor is exclusive and can fall inside a commit.
Filtering never renumbers entries or returns partial batches as though they were
complete. Reads are workspace/log scoped and see staged writes in the active
transaction. They do not apply projections or advance checkpoints. Authorization
for any exposed history operation remains the application's responsibility.

The existing `journal.log.read` and log streams continue to read complete batches.
Log readers validate batch ownership, positions, indexes, identifiers, and counts,
then decode payloads with the log's schema. `stream` reads complete batches until
it observes an empty page. It may include new commits encountered while reading;
it is neither a live subscription nor a fixed snapshot. Consumers checkpoint only
after processing a complete batch. Reads inside a transaction see that transaction's
own writes; consumers requiring committed history read outside write transactions.

The shared binary codec preserves schema transformations and service requirements.
Its output buffers have independent ownership. Fact schema versions and the binary
format are persistence contracts that must remain readable when dependencies change.
The implementation uses `SchemaBinary.toCodec`. Current tests exercise round trips
and storage behavior but do not pin literal golden bytes; encoding and decoding with
the same upgraded codec cannot prove old payload compatibility. Add fixed fixtures
before claiming that an Effect upgrade preserves the persisted format.

In the planned turn domain, turn logs provide durable history for continuation and final-response
derivation. Rebuilding domain projections from the journal does not recreate those
separate logs. Notification generation handles recorded thread activity using
recorded recipient selection and source-derived IDs. Arbitrary log entries do not create
notifications. See [thread workflows](thread-workflows.md) for the implemented boundary.

## Live tailing

`log.tail({ after, limit })` drains available history after the exclusive cursor,
then waits for future committed batches. Omit `after` to start from the beginning,
including when the log does not exist yet. `limit` bounds each read in batches;
it does not limit the tail's lifetime. `journal.log.tail` exposes the same API for
domain events. For a consumer-owned `handleBatch` effect:

```ts
const followJournal = Effect.gen(function* () {
  const journal = yield* Journal.Service;
  yield* journal.log.tail({ limit: 32 }).pipe(Stream.runForEach(handleBatch));
});
```

A tail emits complete committed batches in position order, with independent
cursors for each consumer. Backpressure controls reads, and slow consumers catch
up from storage. The core does not queue future entries. Tailing does not apply
projections or persist consumer progress; save a batch's position after handling
the whole batch, then pass that position as `after` when reconnecting.

Tail consumption must happen outside storage transactions. It fails with
`Log.TailInTransaction` before reading or waiting if a `Store.Transaction` is
present. This prevents provisional entries from escaping and avoids holding a
transaction open while waiting for future commits. Constructing a tail is lazy;
the consumption context determines this check.

The host implements `Store.waitForAppend(logId, after)`. It must check committed
state around wait registration so an append between an empty read and the wait
cannot be missed. All writers must be observable, including other processes and
commits whose acknowledgment was lost. Notifications, polling, or a combination
can satisfy this contract. Wakeups are hints: the core always re-reads validated
batches from storage and tolerates spurious wakeups. An adapter must avoid a busy
loop when no new data exists and must release waiting resources on interruption.

Use stream operators or interrupt the consuming fiber to stop a tail. Read,
decode, and wait failures end it without automatic retries. Resume from the last
successfully handled batch after recovery. The finite `stream` method continues
to finish when it observes an empty page.

## Live projections

A projection version is **live** on a log when every commit since it went live applied it.
Live projections are part of the write: each publication decodes its fact once and runs
the handlers of the projections subscribed to that fact name, in registration order, in
the same native transaction as the append. They record no progress, because nothing a
crash could lose sits between the log and a projection that runs in the same commit.
A subscribed fact name with an unregistered version fails with
`Projection.UnsupportedFactVersion`; register every historical version a projection
needs. Handlers and decoders must avoid external actions, and the runner rejects new log
appends during projection execution.

The checkpoint store keeps each log's live versions, at most one per projection name. A
commit reads them once, before its first publication, and may publish only when they are
exactly the journal's registered projections:

- A registered projection that is not live fails with `Projection.Behind`, rolling back
  the append. `journal.replay` rebuilds it; then retry the command as appropriate.
- A live version the journal does not register fails with `Projection.Unregistered`: its
  commits would skip that projection and leave it silently behind.
- A log with no entries has nothing to rebuild, so its first commit makes every registered
  projection live.

`journal.replay` makes exactly the registered projections live before a host accepts
publications. When they already are, it reads only the live versions. Otherwise it settles
what needs no rebuild in one transaction: on an empty log every registered projection goes
live, and live versions this journal does not register are retired. It then rebuilds each
registered projection that is not live. For example, using the host layer above:

```ts
const initialize = Effect.gen(function* () {
  const journal = yield* Journal.Service;
  yield* journal.replay;
}).pipe(Effect.provide(JournalLive));
```

Hosts that write one workspace must therefore register the same projections. During a
deployment that adds or replaces a projection, hosts running the older set fail closed
on commit until they are replaced; a host that boots with the older set retires the newer
projections, which the newer hosts must then rebuild.

## Rebuilding

For individual control, `Projection.makeRunner({ definition, log: journal.log })` acquires
the definition's dependencies and returns a runner with `step`, `replay`, and
`checkpoint` effects. These effects have no remaining service requirements. `step`
applies the next source batch and persists progress in the same native transaction as its
domain updates, returning `Some(cursor)`. When no batch is pending, it marks the projection
live in that same transaction and returns `None`; the workspace's writers take turns, so no
commit can land between the last batch and going live. A projection that is already live
returns `None` without applying anything. `replay` steps until the projection is live. Each
step commits independently unless the caller wraps replay in an explicit commit. A failed
or interrupted step rolls back that whole batch; earlier steps remain committed. Rebuilding
creates no source or execution-log entries.

A checkpoint includes an entry index to track progress inside an open commit; externally
visible progress always ends at a complete source batch. Missing entries or partial
committed checkpoints fail with `Projection.InvalidCheckpoint`. Unrelated fact names are
skipped and still advance progress. Different projections rebuild independently: derive
updates from event data and the projection's own state, without depending on another
projection's progress.

Checkpoint reads and writes must participate in the same host transaction as domain
updates, including when no checkpoint exists yet, with competing writes serialized. This
is the storage contract; PostgreSQL currently relies on a workspace advisory lock and does
not explicitly select an isolation level. Competing runners must serialize or receive
`Store.Conflict`; the core does not retry them. After `Store.CommitUncertain`, reconcile
using persisted progress and domain state. A later step reads its checkpoint again before
applying anything.

A projection version identifies its read-model interpretation, separately from fact
versions. A new version rebuilds from the beginning with its own checkpoint, and going live
replaces the previous version of that name. The domain and host must supply a fresh target
store or perform a coordinated migration. Changing a version alone does not clear existing
rows, and rebuilding a retired version over its old rows would apply history twice. This
API does not reset stores, migrate schemas, or switch readers between projection versions.

## Verification

`bun run test packages/core/test` exercises the portable implementation with a test-only
memory adapter, including cross-log atomicity, rollback, nested and concurrent
publication, interruption, cursor isolation, and uncertain outcomes. Projection tests
also cover resume, batch rollback, checkpoint failures, concurrent runners, version
routing, going live after a rebuild, the live-version checks on commit, and live
publication that reads no batches or progress. Service tests check
dependency inference across different projections, the stable consumer interface,
active transaction and scope preservation, and defect handling. The root type
check includes these tests. Tail tests cover read/wait races, backpressure, commit
visibility, rollback, independent consumers, cancellation, and wait failures.
Projection tests also confirm that a large commit's publications read no batches or progress,
and that a journal that does not run a live projection cannot publish to its log.
Direct entry-lookup tests cover codec decoding, log/workspace isolation, buffer ownership,
staged visibility, rollback, and use by authorized notification-source reads.
Storage adapters must satisfy the same transaction and log contracts. The
[SQLite](../adapters/storage-sqlite/README.md) and
[PostgreSQL](../adapters/storage-postgresql/README.md) adapters test these contracts
against persistent storage and independent connections; PostgreSQL suites require
an available server as described in the [testing guide](testing.md).
The [local host](../hosts/local/README.md) composes either adapter. The core's
memory adapter remains test-only.
