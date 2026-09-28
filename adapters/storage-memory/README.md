# Memory storage

Workspace storage, the workspace directory, and the signal hub held in process memory. This is the reference
implementation of the storage contracts: it passes the
[conformance suites](../../packages/storage-conformance/README.md) like the PostgreSQL adapter, and
enforces the same rules with plain maps and no query language. Nothing survives the process,
and no host uses it yet.

## Model

`MemoryDatabase` is the storage that every connected host shares. Each workspace has one
`Space`: commits, log batches, keyed append slices, projected records with the live projection
versions and rebuild checkpoints, and private read state. Records are stored as the JSON of
their encoded form, keyed by ID, like SQL record columns. Stored values never
change: writes replace them, and every read decodes a fresh record. Journal entries are copied
on the way in and out, so callers never share bytes with storage.

Stores check what the PostgreSQL adapter enforces with keys and unique indexes: reused IDs, one
active membership per identity, one direct group per member set, one active follow per admission,
one active participation per participant, and contiguous thread sequences. Like PostgreSQL, they
take references to other read models as recorded, so each rebuilds alone. Lists order IDs by their UTF-8 bytes, matching binary collation.
Commit and entry IDs come from a counter in each storage.
Connections' credentials sit beside the records, outside the projections a rebuild discards, and
are held as they are: this adapter is for tests, so it seals nothing.

## Transactions

`MemoryConnection` is one host's connection. Its transactions take turns on a one-permit gate,
like one database connection. A transaction copies its workspace's maps, runs against the copy, and
on success makes the copy the committed state; a failure or interruption discards it. Only the
transaction writes the journal and projections meanwhile. Read-state writes outside a transaction
apply at once, so a commit keeps the later of its own and the committed read-state values. Seen,
which checks a notification is still pending before recording it, instead waits for the
workspace's writer, so no commit lands between its check and its write.

A workspace that another connection is writing reports `JournalStore.Conflict` at once, as if
its lock wait had timed out immediately; the same connection's writers wait for each other.
Each log also has a lock shared by every host: a transaction takes it on its first append to
the log, or lookup of one of its keys, refreshes its copy of that log from committed state,
and keeps it until it ends. `Store.append` takes only its log's lock, not the workspace's, and
commits only that log. A commit therefore replaces the logs it held and keeps what other
writers committed to the rest meanwhile. Reads outside a
transaction see committed state; inside one, they see its copy. A handle from another connection,
workspace, or closed transaction fails. `waitForAppend` waits on a signal that each appending
commit replaces.

`MemorySignals` delivers [signals](../../packages/core/README.md#signals) between the hosts over
one `MemoryDatabase`: publishing offers the signal to each of the workspace's subscribers at that
moment, each through a queue of 256 that drops the oldest when it falls behind. Nothing is kept.

## Composition

`layer` provides the storage, directory, and signal hub contracts over a new connection; a host provides
`MemoryDatabase.layer` beneath it. Building `layer` again over the same database is another
host.

## Testing

`test/harness.ts` supplies the conformance harness: new storage for each test,
`discardProjections` clears projected records, live versions, and checkpoints in every
workspace, and `footprint` counts commits, batches, entries, append slices, records, and read
state. Each test file registers one suite.
