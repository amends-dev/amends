# Memory storage

Workspace storage and the workspace directory held in process memory. This is the reference
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

Stores check what the PostgreSQL adapter enforces with keys, unique indexes, and foreign keys: reused
IDs, one active membership per identity, one direct group per member set, one active follow per
admission, one active participation per participant, contiguous thread sequences, and the
references between records. Lists order IDs by their UTF-8 bytes, matching binary collation.
Commit and entry IDs come from a counter in each storage.

## Transactions

`MemoryConnection` is one host's connection. Its transactions take turns on a one-permit gate,
like one database connection. A transaction copies its workspace's maps, runs against the copy, and
on success makes the copy the committed state; a failure or interruption discards it. Only the
transaction writes the journal and projections meanwhile. Read-state writes outside a transaction
apply at once, so a commit keeps the later of its own and the committed read-state values.

A workspace that another connection is writing reports `JournalStore.Conflict` at once, as if
its lock wait had timed out immediately; the same connection's writers wait for each other. Reads outside a
transaction see committed state; inside one, they see its copy. A handle from another connection,
workspace, or closed transaction fails. `waitForAppend` waits on a signal that each appending
commit replaces.

## Composition

`layer` provides both gateway contracts over a new connection; a host provides
`MemoryDatabase.layer` beneath it. Building `layer` again over the same database is another
host.

## Testing

`test/harness.ts` supplies the conformance harness: new storage for each test,
`discardProjections` clears projected records, live versions, and checkpoints in every
workspace, and `footprint` counts commits, batches, entries, append slices, records, and read
state. Each test file registers one suite.
