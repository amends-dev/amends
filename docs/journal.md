# Journal and execution logs

The journal uses the same append-only log mechanism as execution history.
`Journal.publish` appends a fact event to its configured log and applies matching
projections inside the same commit. A turn's log stores its own schema-defined
execution entries through `Log`, without running domain projections.

## Ownership

- **Fact** defines a domain statement's name, version, and payload schema.
- **Log** provides typed appends, lookup, paged reads, finite streams, and live tails
  for a log ID.
  Opening a handle performs no storage operation; the first append creates the
  log as needed. Reopening the same ID addresses the same history.
- **Journal** binds a domain log to registered projections. Its public log view
  is read-only; fact writes go through `publish`.
- **Projection** handles a decoded fact event and updates its domain store.
  Definitions and handlers belong to domains. The shared runner dispatches fact
  versions, applies batches, and tracks replay progress. Projections run in
  registration order during publication and cannot append new log entries.
- **Checkpoint** is the host-implemented progress store, keyed by log ID,
  projection name, and projection version.
- **Transaction** coordinates implicit and explicit commits, nested calls,
  publication ordering, failure tracking, and transaction lifetime.
- **Store** is the host-implemented persistence contract. It supplies a native
  transaction and enlists log writes, domain projection stores, and checkpoints.

The core imports Effect only. Hosts choose storage and provide `Store.Service`,
`Checkpoint.Service`, and the domain store services used by projection handlers.
`Log.layer` builds the common log service and transaction coordinator from that
store. `Journal.layer({ logId, projections })` builds `Journal.Service`, whose
interface stays the same as projections are added. `Journal.make` remains available
as its constructor and returns that same interface.

Projection handler and decoder dependencies are required when constructing the
journal layer or binding a standalone projection runner. The constructed service
supplies them during execution. Invocation context takes precedence over captured
context, preserving the active host transaction and giving each operation its own
scope. Projection dependencies do not appear on journal calls. A published fact's
own schema requirements remain on that particular `publish` call.

For example, `HostStores` below is a host layer supplying the storage services and
all dependencies used by the domain-owned `AgentsProjection`. The shared log and
transaction services stay exposed so execution-log writes can join journal commits:

```ts
const JournalLive = Journal.layer({
  logId: Log.Id.make("domain"),
  projections: [AgentsProjection],
}).pipe(Layer.provideMerge(Log.layer), Layer.provide(HostStores));
```

Domains obtain the configured implementation with `yield* Journal.Service`.
All normal writers to a domain log must use the same projection registrations.

## Event provenance

Every new `journal.publish(fact, payload)` requires `Publication.Service` in its
Effect context. This service holds the operation's `Event.Provenance`. The journal
reads it at publication time, validates and snapshots it, then persists it in
`Event.Envelope` and exposes it on decoded
events, projections, committed batches, and change-feed events. `Fact` continues
to define only the domain statement. Generic `Log` entries retain their existing
metadata and do not acquire domain attribution.

| Field           | Meaning                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `workspaceId`   | The workspace where the action happened.                                                                         |
| `performedBy`   | The responsible member, authenticated identity before membership, or explicitly identified system process.       |
| `causedBy`      | The immediate upstream event, located by workspace, log, commit, and event IDs; `null` identifies a root action. |
| `correlationId` | Groups a causal workflow across events and commits.                                                              |
| `occurredAt`    | When the domain action happened, independently of the log's `recordedAt`.                                        |

`Performer.Reference` has three variants. `Member` preserves both the membership ID
and its stable human or agent identity. `Identity` records a human or agent before
a membership exists. `System` requires a named system ID; it is never an automatic
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

Stored envelopes written before provenance was introduced omit its field. They
remain readable through the existing binary format and decode to
`event.provenance === null`. This means attribution was not recorded; it is distinct
from `event.provenance.causedBy === null`, which identifies an attributed root action.
New publications cannot omit provenance. This additive envelope change preserves
fact versions, existing bytes, and SQL layouts; no data reset is needed.

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
the program. Optional expected-position checks support conditional appends.

## Reading and replay

Log readers validate batch ownership, positions, indexes, identifiers, and counts,
then decode payloads with the log's schema. `stream` reads complete batches until
it observes an empty page. It may include new commits encountered while reading;
it is neither a live subscription nor a fixed snapshot. Consumers checkpoint only
after processing a complete batch. Reads inside a transaction see that transaction's
own writes; consumers requiring committed history read outside write transactions.

The shared binary codec preserves schema transformations and service requirements.
Its output buffers have independent ownership. Fact schema versions and the binary
format are persistence contracts that must remain readable when dependencies change.

Turn logs are durable execution history used for continuation and final-response
derivation. Rebuilding domain projections from the journal does not recreate those
separate logs. Notification generation still follows committed thread activity as
defined in the core model; arbitrary log entries do not create notifications.

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

## Projection replay

`journal.replay` catches up its registered projections. Call it when attaching a
projection to existing history, before accepting publications with that registration.
For example, using the host layer above:

```ts
const initialize = Effect.gen(function* () {
  const journal = yield* Journal.Service;
  yield* journal.replay;
}).pipe(Effect.provide(JournalLive));
```

For individual control, `Projection.makeRunner({ definition, log: journal.log })` acquires
the definition's dependencies and returns a runner with `step`, `replay`, and
`checkpoint` effects. These effects have no remaining service requirements.
`step` applies the next
source batch and persists progress in the same native transaction as its domain
updates. It returns `Some(cursor)` on progress or `None` when caught up. `replay`
drains until a step observes no pending batch, then returns the latest checkpoint.
Each step commits independently unless the caller wraps replay in an explicit
commit. A failed or interrupted step rolls back that whole batch; earlier steps
remain committed. Replay creates no source or execution-log entries.

Live publication uses the same checkpoint as replay. It checks that the new entry
immediately follows the projection's progress, applies handlers, and advances the
checkpoint within the publication's transaction. A backlog fails publication with
`Projection.Behind`, rolling back the append; catch up with `journal.replay` and
then retry the command as appropriate. Replaying an already updated projection
does not apply its events again. A checkpoint includes an entry index to track
multiple publications inside an open commit; externally visible progress always
ends at a complete source batch. Missing entries or partial committed checkpoints
fail with `Projection.InvalidCheckpoint`.

Unrelated fact names are skipped and still advance progress. A subscribed fact
name with an unregistered version fails with `Projection.UnsupportedFactVersion`.
Register every historical version needed by that projection. Persisted payloads
are decoded with those versions' schemas before handlers run. Handler order within
a definition is preserved. Different projections catch up independently: derive
updates from event data and the projection's own state, without depending on
another projection's progress. Handlers and decoders must avoid external actions;
the runner rejects new log appends during projection execution.

Checkpoint reads and writes must participate in the same serializable host
transaction as domain updates, including when no checkpoint exists yet. Competing
runners must serialize or receive `Store.Conflict`; the core does not retry them.
After `Store.CommitUncertain`, reconcile using persisted progress and domain state.
A later replay reads its checkpoint again before applying anything.

A projection version identifies its read-model interpretation, separately from
fact versions. A new version has a separate checkpoint and starts from the beginning.
The domain and host must supply a fresh target store or perform a coordinated
migration. Changing a version alone does not clear existing rows. This API does not
reset stores, migrate schemas, or switch readers between projection versions.

## Verification

`bun test packages/core/test` exercises the portable implementation with a test-only
memory adapter, including cross-log atomicity, rollback, nested and concurrent
publication, interruption, cursor isolation, and uncertain outcomes. Projection tests
also cover resume, batch rollback, checkpoint failures, concurrent runners, version
routing, and transitions between replay and live publication. Service tests check
dependency inference across different projections, the stable consumer interface,
active transaction and scope preservation, and defect handling. The root type
check includes these tests. Tail tests cover read/wait races, backpressure, commit
visibility, rollback, independent consumers, cancellation, and wait failures.
Storage adapters must satisfy the same transaction and log contracts. The
[local host](../hosts/local/README.md) now supplies a SQLite adapter and tests those
contracts against persistent storage and independent connections. The core's
memory adapter remains test-only.
