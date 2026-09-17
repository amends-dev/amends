# Journal and execution logs

The journal uses the same append-only log mechanism as execution history.
`Journal.publish` appends a fact event to its configured log and applies matching
projections inside the same commit. A turn's log stores its own schema-defined
execution entries through `Log`, without running domain projections.

## Ownership

- **Fact** defines a domain statement's name, version, and payload schema.
- **Log** provides typed appends, lookup, paged reads, and replay for a log ID.
  Opening a handle performs no storage operation; the first append creates the
  log as needed. Reopening the same ID addresses the same history.
- **Journal** binds a domain log to registered projections. Its public log view
  is read-only; fact writes go through `publish`.
- **Projection** handles a decoded fact event and updates its domain store.
  Projections run in registration order and cannot append new log entries.
- **Transaction** coordinates implicit and explicit commits, nested calls,
  publication ordering, failure tracking, and transaction lifetime.
- **Store** is the host-implemented persistence contract. It supplies a native
  transaction and enlists both log writes and domain projection stores.

The core imports Effect only. Hosts choose storage and provide `Store.Service`.
`Log.layer` builds the common log service and transaction coordinator from that
store. `Journal.make` binds a journal to a log ID and projection definitions.
Projection services remain requirements of publication and resolve inside the
active transaction, so a projection does not capture a stale transaction at setup.

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
yield *
  journal.commit(
    Effect.gen(function* () {
      yield* turnLog.append(confirmation);
      yield* journal.publish(InputIncorporated, { turnId, throughSequence });
    }),
  );
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
Projection failures retain their original typed errors when propagated; a caught
failure is reported at the outer boundary as `Commit.Aborted`.

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

## Verification

`bun test packages/core/test` exercises the portable implementation with a test-only
memory adapter, including cross-log atomicity, rollback, nested and concurrent
publication, interruption, cursor isolation, and uncertain outcomes. The root type
check includes these tests. Production storage adapters must satisfy the same
transaction and log contracts; no SQL or production memory adapter is selected yet.
