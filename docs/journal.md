# Journal and execution logs

The journal is an append-only log. `Journal.publish` appends a fact event to its configured log
and applies matching projections inside the same commit. Other logs can store their own
schema-defined entries through `Log`, without running domain projections. An agent's session log,
the record of its conversation in a thread, is not one of them: it has a store of its own, apart
from the journal and its commits ([`SessionLog`](../packages/core/README.md#turns)). The turn and
agent examples below illustrate consumers rather than available application operations.

## Ownership

The log itself, its `Log` handles, its `Store` contract, the `Transaction` coordinator, and their
entries, codecs, and errors, is the published package
[`@amends-dev/log`](../packages/log/README.md), with a memory store and the suites every storage
adapter runs. The journal builds facts, projections, checkpoints, and reactions over it in core.

- **Fact** defines a domain statement's name, version, payload schema, required
  subject rule, and optional occurrence identity.
- **Log** (the log package) provides typed appends, lookup, paged reads, entry reads by
  name or subject, finite streams, and live tails for a log ID.
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
- **Transaction** (the log package) coordinates implicit and explicit commits, nested calls,
  publication ordering, failure tracking, and transaction lifetime.
- **Store** (the log package) is the host-implemented persistence contract. It supplies a native
  transaction and enlists log writes, domain projection stores, and checkpoint writes. The
  transaction's `afterCommit(effect)` runs `effect` once it has committed and released what it
  held, never after a rollback; hosts use it to tell a reader that something the commit stored,
  such as a Cluster request, can be read now.

Core imports Effect and the log package. Hosts choose storage and provide `Store.Store`, bound to
one workspace, the workspace it is bound to as `WorkspaceId.CurrentWorkspaceId`,
`Checkpoint.Checkpoint`, and the domain store services used by projection handlers. `Log.layer`
builds the common log service and transaction coordinator from that store.
`Journal.layer({ logId, projections })` builds `Journal.Journal`, whose
interface stays the same as projections are added. `Journal.make` remains available
as its constructor and returns that same interface.

Projection handler and decoder dependencies are required when constructing the
journal layer or binding a standalone projection runner. The constructed service
supplies them during execution. Invocation context takes precedence over captured
context, preserving the active host transaction and giving each operation its own
scope. Projection dependencies do not appear on journal calls. A published fact's
own schema requirements remain on that particular `publish` call.

For example, `HostServices` below is a host layer supplying storage and dependencies
used by an illustrative domain-owned
`AgentsProjection`. The shared log and
transaction services stay exposed so execution-log writes can join journal commits:

```ts
const JournalLive = Journal.layer({
  logId: Entry.LogId.make("domain"),
  projections: [AgentsProjection]
}).pipe(Layer.provideMerge(Log.layer), Layer.provide(HostServices))
```

Domains obtain the configured implementation with `yield* Journal.Journal`.
All normal writers to a domain log must use the same projection registrations.

## Storage envelope

`Store.Content` is an entry's binary `payload`, with an optional `name` and `subject` that
storage indexes. `Store.Entry` adds the entry ID, commit, log position, index, and recording
time. The journal's codec, `Event.storageCodec`, gives each fact's entry the fact's name and
subject, and encodes its version and provenance into the bytes beside the payload its fact schema
encodes. `Event.Envelope` remains the in-memory shape used by journal readers and projections.

The PostgreSQL adapter stores `name` and `subject` as columns in `log_entries`. Separate indexes
cover workspace/log/name and workspace/log/subject, each ordered by position and entry index.
Storage knows nothing of provenance: the journal checks that every fact it publishes names its
workspace.

Generic execution logs have neither name nor subject and encode their complete schema-defined
value. `Log.open` defaults to `Codec.makeEntryCodec(schema)`; the journal selects
`Event.storageCodec`. Opening the journal's log with an ordinary codec fails on read, since its
entries carry names, rather than misreading them. The storage adapter receives the distinction
directly and never infers a new entry's kind by inspecting its bytes.

Each adapter has one baseline for fresh local databases. Schema changes update
that baseline and development databases are reset. There is no upgrade chain,
legacy-envelope decoder, data backfill, or support for unattributed fact events.

## Fact subjects and filtered reads

Every fact declares a pure `subject(payload)` function returning a `Subject.Subject`.
Use `Subject.make("thread", threadId)` to construct a `kind:id` key. The namespace
starts with a lowercase letter and contains only lowercase letters, digits, or
hyphens; IDs are nonempty and may contain colons. Thus different entity kinds
cannot collide even when their IDs match. Subjects are local to the workspace;
queries additionally select a log.

Publication validates the decoded payload before deriving and validating its
subject. It stores that subject as the entry's subject and exposes it on decoded events.
`Event.decode` checks the persisted subject against the fact's declaration,
including during projection replay. Generic execution entries have no subject.
All domain facts require one; there is no fallback or legacy null-subject path.

`journal.log.readEntries({ subject, after?, limit })` reads an entity's facts across names and
versions. A name can narrow that query, and name-only queries remain supported.
At least one of subject or name is required. Pages use an exclusive `{ position, index }` cursor, so filtering or splitting
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
  occurrence: (payload) => [payload.memberId]
})

const remove = Effect.gen(function* () {
  return yield* journal.publish(Removed, { workspaceId, memberId })
})
```

`occurrence` is a pure, deterministic function of the validated decoded payload.
It returns a nonempty tuple of nonblank strings, or `null` when that payload has
no natural identity. The journal preserves each component exactly and encodes the
key as `fact:` followed by `JSON.stringify([fact.name, parts])`. Tuple encoding
avoids delimiter collisions, and the fact name separates creation from removal
for the same record ID. Schema versions are excluded: publishing another version
of an existing occurrence conflicts rather than creating a second occurrence.

The key identifies one occurrence within a workspace and log. Another workspace
or log has an independent key space. The log package's `Store.IdempotencyKey` is that key, and every append's
`idempotencyKey` takes it, whether a fact derives it or a caller gives it. Treat the
fact name, identity components, and key encoding as persistence contracts. Definitions registered for
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
key fails with `StoreError` (`Rejected`); callers cannot override the declared identity.
Use an explicit key for request-level retries of a repeatable fact:

```ts
const options = { idempotencyKey: Store.IdempotencyKey.make(operationId) }
const rename = Effect.gen(function* () {
  return yield* journal.publish(RoleFacts.Renamed, { workspaceId, roleId, name }, options)
})
```

`Log.append` and `Log.appendAll` continue to accept explicit keys because execution
entries have no fact definition. Calls without a derived or explicit key append
every time. The application still authorizes the operation and supplies
`Publication.Publication`. Reuse the occurrence inputs or explicit key on retry; a new
UUID on every attempt identifies a different occurrence. Correlation IDs can group
several facts and must not automatically become their shared idempotency key.

| Key state                      | Outcome                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Absent                         | Check `expectedAfter`, if supplied, then append and persist the key in the same transaction.       |
| Present with matching content  | Return the original entries, including their IDs, commit, positions, timestamps, and provenance.   |
| Present with different content | Fail with `StoreError` (`Rejected`); a core commit aborts even if the publication error is caught. |

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
for the bound workspace. Reuse runs no projections, advances no checkpoints
or log positions, and appends no new batch. Readers that tail the journal therefore see a first
commit whose acknowledgment was lost once.

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
read the receipt back, and the [conformance suites](../packages/gateway/README.md#conformance)
check that every adapter keeps the two identical. The PostgreSQL adapter persists receipts in
`log_append_keys`, using a unique workspace/log/key constraint and its existing writer serialization.

Rollback removes both the append and its key. After `Store.CommitUncertain`, retry
the same keyed intent: a committed first attempt is reused, and a rolled-back one
can be appended. Storage contention may still return `StoreError` (`Contended`); neither
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

Core's request keys follow this pattern. Each creating operation derives the IDs of what it creates
from the operation, the acting member, and the client's key with `Request.derivedId`, as workspace
creation derives its workspace's ID; a turn retry derives its turn's ID from the turn it retries.
Inside the commit, the operation finds those records by ID before generating anything and returns
them; each creation fact declares the ID as its occurrence, so no second record can take it. No
separate receipt is recorded. Logs written before this change still hold internal
`request.completed` facts; nothing reads them.

## Event provenance

Every new `journal.publish(fact, payload)` requires `Publication.Publication` in its
Effect context. This service holds the operation's `Event.Provenance`. The journal
reads it at publication time, validates and snapshots it, then persists it as
structured event metadata and exposes it on decoded
events and projections. `Fact` continues
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

Services capture cryptography during construction and provide it to
the wrapper; identity is resolved when the operation runs. `Publication.Publication`
belongs around the operation's effect, never in a shared application layer.
`Journal.make` and `Journal.layer` do not capture it. A direct publication without
the service is a missing dependency at compile time and a defect at runtime;
the journal never falls back to an authorization actor or system identity.

For a workflow whose facts are `MemberFacts.Removed` and `InvitationFacts.Revoked`:

```ts
const remove = journal.commit(
  Effect.gen(function* () {
    // The application validates inputs and authorizes this operation first.
    const removed = yield* journal.publish(MemberFacts.Removed, removal)
    yield* journal.publish(InvitationFacts.Revoked, revocation).pipe(Publication.withCause(removed))
  }).pipe(Publication.withActor)
)
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
around the publication block using `Effect.provideService(Publication.Publication,
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

All fact events require provenance, including stored entries and replayed events. `event.provenance.causedBy === null` identifies a root
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

`Journal.publish` creates an implicit commit when needed. `journal.commit(program)` or
`logs.commit(program)` groups operations.
Nested commits join the current commit. Returned entry references are provisional until the
outer commit succeeds.

A commit runs its storage work one step at a time: await each publication, append, and log read
before starting the next. A step nested in the running one on the same fiber, such as a
publication's own append and projection updates, runs within it. Starting a step while another
fiber's is running is a defect, `Transaction.Concurrent`, that aborts the commit. Waiting instead could
deadlock a forked fiber on its parent's step, and let a read interleave with writes the store has
staged. Work outside storage can still run concurrently inside a commit's program.

```ts
const incorporate = Effect.gen(function* () {
  yield* journal.commit(
    Effect.gen(function* () {
      yield* turnLog.append(confirmation)
      yield* journal.publish(InputIncorporated, { turnId, throughSequence })
    }).pipe(Publication.withActor)
  )
})
```

The domain supplies the fact and execution-entry schemas in this example. The two
entries belong to different logs but become visible together with the projection
updates. Ordinary harness output can use `turnLog.append` directly.

Outside a commit, `Log.append` and `Log.appendAll` are a commit of their own through
`Store.append`, which takes no place in the workspace's write order: it waits only for that
log's other writers. Execution output streamed while a turn runs therefore never waits for
conversation writes, and they never wait for it. A commit that appends to a log, or looks up
one of its keys, holds that log until it ends, so a standalone append to it waits and then
takes the next position, and keys and expected positions stay true within the commit. A
commit never waits for a standalone append to a log it does not touch. Journal facts always
take the workspace's write order, since their projections do.

Keep commit programs limited to short storage work. Harness execution, model
inference, and other external actions belong outside storage transactions. The PostgreSQL
adapter rolls back a program that runs past its
[transaction timeout](../adapters/storage-postgresql/README.md#locks-and-timeouts).

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
still reported at the outer commit boundary as `Transaction.Aborted`.

Adapters report unconfirmed commit outcomes with `Store.CommitUncertain`, including
the commit ID for lookup and reconciliation. The core does not automatically retry
the program. Optional expected-position checks support conditional appends;
idempotency keys separately support retrying the same append or publication.
The PostgreSQL adapter currently classifies every failed COMMIT effect as uncertain, including
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

`journal.log.readEntries({ name, after?, limit })` queries matching fact entries
directly in storage, every stored version of that name. Results are
`Log.Entry<Event.Envelope>` values, which decode with the corresponding fact:

```ts
const readCreatedRoles = Effect.gen(function* () {
  const entries = yield* journal.log.readEntries({
    name: RoleFacts.Created.name,
    limit: 100
  })
  return yield* Effect.forEach(entries, (entry) => Event.decode(RoleFacts.Created, entry))
})
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
The implementation uses `SchemaBinary.toCodec`. The [codec tests](../packages/core/test/journal/codec.test.ts)
pin workspace initialization, message, and turn-checkpoint bytes captured with Effect
4.0.0-rc.115. They decode those fixtures independently of the current encoder and require
encoding to produce identical bytes. Other payload variants still need fixed fixtures;
encoding and decoding with the same upgraded codec alone cannot prove old payload compatibility.

Session logs provide the durable history agents' turns continue from and take their answers
from. Rebuilding domain projections from the journal does not recreate them. Notification generation handles recorded thread activity using
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
  const journal = yield* Journal.Journal
  yield* journal.log.tail({ limit: 32 }).pipe(Stream.runForEach(handleBatch))
})
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
  the append. `journal.replay` rebuilds it; then retry the command as appropriate. The gateway
  does this for hosts by preparing the workspace again.
- A live version the journal does not register fails with `Projection.Unregistered`: its
  commits would skip that projection and leave it silently behind.
- A log with no entries has nothing to rebuild, so its first commit makes every registered
  projection live.

`journal.replay` makes exactly the registered projections live before a host accepts
publications. When they already are, it reads only the live versions. An empty log has
nothing to rebuild, and its first commit makes the projections live, so replaying it writes
nothing: preparing a workspace that was never created leaves no trace. Otherwise replay
retires, in one transaction, live versions this journal does not register, then rebuilds each
registered projection that is not live. For example, using the host layer above:

```ts
const initialize = Effect.gen(function* () {
  const journal = yield* Journal.Journal
  yield* journal.replay
}).pipe(Effect.provide(JournalLive))
```

Hosts that write one workspace must therefore register the same projections. During a
deployment that adds or replaces a projection, hosts running the older set fail closed
on commit until they are replaced; a host that boots with the older set retires the newer
projections, which the newer hosts must then rebuild.

A version leaves the live set when replay retires it or a rebuilt version of the same name
replaces it. It was live, so it applied every commit through the log's head: in the same
transaction, its checkpoint moves to the head's last entry. Rebuilding it again later applies
only the commits written while it was not live, never earlier ones over its read model a
second time.

## Reactions

A reaction is what a commit does, in that same commit, when it publishes a fact: core uses them to
request [jobs](../packages/core/README.md#jobs). `Journal.layer` takes
`reactions` beside its projections, each naming a fact by name, at any version. They run after
the fact's projections, in registration order, with the publishing commit's transaction, and a
reaction's failure fails the commit. Unlike a projection, a reaction leaves no record to rebuild,
so replay never runs it, and a retried publication that returns its original event does not run
it again.

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
projection's progress. A handler requires only its own store; a read model that follows
another domain's facts handles them itself, as the thread and group projections keep their
latest activity from recorded thread activity. Validation against other read models belongs
where a fact is published: stores check their own records and take references to other read
models as recorded, and the storage adapters keep no foreign keys between them. A journal
may therefore register the projections in any order and rebuild them to the same read models,
which the conformance suites check by rebuilding in reverse.

Checkpoint reads and writes must participate in the same host transaction as domain updates,
including when no checkpoint exists yet, with competing writes serialized. This is the storage
contract; PostgreSQL currently relies on a workspace advisory lock and does not explicitly select an
isolation level. Competing runners must serialize or receive `StoreError` (`Contended`); the core
does not retry them. After `Store.CommitUncertain`, reconcile using persisted progress and domain
state. A later step reads its checkpoint again before applying anything.

A projection version identifies its read-model interpretation, separately from fact
versions. A new version rebuilds from the beginning with its own checkpoint, and going live
replaces the previous version of that name. The domain and host must supply a fresh target
store or perform a coordinated migration. Changing a version alone does not clear existing
rows. A retired version resumes from its checkpoint, so resetting its store also requires
removing its checkpoint. This API does not reset stores, migrate schemas, or switch readers
between projection versions.

## Verification

`bun run test packages/core/test` exercises the portable implementation over its
[memory storage](../packages/core/README.md#memory), including cross-log atomicity, rollback, nested publication, rejecting concurrent
storage work in one commit, interruption, cursor isolation, and uncertain outcomes. Projection tests
also cover resume, batch rollback, checkpoint failures, concurrent runners, version
routing, going live after a rebuild, the live-version checks on commit, retired and
replaced versions resuming from the last commit they applied, and live publication that
reads no batches or progress. Service tests check
dependency inference across different projections, the stable consumer interface,
active transaction and scope preservation, and defect handling. The root type
check includes these tests. Tail tests cover read/wait races, backpressure, commit
visibility, rollback, independent consumers, cancellation, and wait failures. Journal tests
check that output appended outside a commit uses the store's standalone append.
Projection tests also confirm that a large commit's publications read no batches or progress,
and that a journal that does not run a live projection cannot publish to its log.
Direct entry-lookup tests cover codec decoding, log/workspace isolation, buffer ownership,
staged visibility, rollback, and use by authorized notification-source reads.
Storage adapters must satisfy the same transaction and log contracts. The
[PostgreSQL](../adapters/storage-postgresql/README.md) adapter and the memory implementation run
these contracts through the [conformance suites](../packages/gateway/README.md#conformance), over independent connections, including standalone appends beside a
transaction that holds the workspace or the log; PostgreSQL suites require an available
server as described in the [testing guide](testing.md). The
[local host](../hosts/local/README.md) composes the PostgreSQL adapter. The core's own
memory store remains test-only.
