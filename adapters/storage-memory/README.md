# @amends-dev/storage-memory

Workspace storage, each workspace's signal hub, and the workspace directory, held in process memory.
It is the reference implementation of the gateway's storage contracts: it passes the same
[conformance suites](../../packages/storage-conformance/README.md) as the
[PostgreSQL adapter](../storage-postgresql/README.md) and enforces the same rules with plain maps
and no query language. Nothing survives the process, and no host uses it; tests do.

It is internal to this repository and not published to npm.

## Use

```ts
import { MemoryDatabase, layer } from "@amends-dev/storage-memory";
import { Layer } from "effect";

const storage = layer.pipe(Layer.provide(MemoryDatabase.layer));
```

`layer` provides the storage contract, with each workspace's signal hub, and the directory over a
new connection to the database beneath it. Building `layer` again over the same `MemoryDatabase` is
another host over the same storage, which is how the conformance suites test what several hosts do
together.

## Model

`MemoryDatabase` is the storage every connected host shares. Each workspace has one `Space`:
commits, log batches, keyed append slices, projected records with the live projection versions and
rebuild checkpoints, and private read state. Records are stored as the JSON of their encoded form,
keyed by ID. Stored values never change: writes replace them, and every read decodes a fresh record.
Journal entries are copied on the way in and out, so callers never share bytes with storage.

Stores check what the PostgreSQL adapter enforces with keys and unique indexes: reused IDs, one
active membership per identity, one agent per membership, one direct group per member set, one
active follow per admission, one active participation per participant, and contiguous thread
sequences. They take references to other read models as recorded, so each rebuilds alone. Lists
order IDs by their UTF-8 bytes, as binary collation does. Commit and entry IDs come from a counter
in each database.

Some state sits outside the projections a rebuild discards: each connection's credential, as the
JSON of its encoded form and unsealed, since this adapter is for tests; each participation's harness
session; and the session logs. Session logs take part in no transaction: an append is kept at once
and wakes readers waiting for one, as a commit's appends do.

## Transactions

`MemoryConnection` is one host's connection. Its transactions take turns on a one-permit gate, as on
one database connection. A transaction copies its workspace's maps, runs against the copy, and on
success makes the copy the committed state; a failure or interruption discards it. Read-state writes
outside a transaction apply at once, so a commit keeps the later of its own and the committed
read-state values. Marking a notification seen, which checks that it is still pending before
recording it, waits for the workspace's writer, so no commit lands between its check and its write.

A workspace that another connection is writing reports `JournalStore.Conflict` at once, as a lock
wait that timed out immediately would; the same connection's writers wait for each other. Each log
also has a lock shared by every host: a transaction takes it on its first append to the log, or
lookup of one of its keys, refreshes its copy of that log from committed state, and keeps it until
it ends. `Store.append` takes only its log's lock, so a commit replaces the logs it held and keeps
what other writers committed to the rest meanwhile. Reads outside a transaction see committed state;
inside one, they see its copy. A handle from another connection, workspace, or closed transaction
fails. `waitForAppend` waits on a deferred that each appending commit completes and replaces.

Each workspace's [signal hub](../../packages/core/README.md#signals) delivers signals between the
hosts over one `MemoryDatabase` through the database's `SignalHub.makeLocal`: publishing offers the
signal to each subscriber present at that moment, and a subscriber more than 256 behind misses the
oldest. Nothing is kept.

## Development

The adapter's tests run in the `backend` project:

```sh
bun run test adapters/storage-memory
```

`test/harness.ts` supplies the conformance harness: new storage for each test, `discardProjections`
clears projected records, live versions, and checkpoints in every workspace, and `footprint` counts
commits, batches, entries, append slices, records, and read state. Each test file registers one
suite. See [testing](../../docs/testing.md) and the [adapter conventions](../README.md).
