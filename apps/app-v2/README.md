# @amends-dev/app-v2

The workspace app, being built on [Foldkit](https://foldkit.dev): a browser app that keeps each
workspace a person opens in sync through [`@amends-dev/sync`](../../packages/sync/README.md), so it
reads, and will write, offline. So far it holds the browser's side of sync; the program people use
comes next.

## Sync

`sync/Store.ts` opens one person's store of one workspace on one host, for as long as a scope lasts:

- Its event log, Effect eventlog's, journals into an IndexedDB database of its own and applies each
  `ReplicaChanged` the server writes to the replica.
- `sync/Replica.ts` is the replica: the records the person may see, in another IndexedDB database,
  each under its key with its kind and the place it sits, from core's `ReplicaRecord.placeOf`.
  `apply` writes a commit's batch in one transaction, and dropping a group or a thread drops what
  sits in it. The replica keeps the position of the last commit it applied and passes over a batch
  it already holds, since eventlog runs a remote entry's handler before its journal records the
  entry and sends it again after a stop between the two; a reset applies at any position.
  `counts` is how many records of each kind it holds, again after each batch.
- The host's sync server is the event log's remote, through `SyncClient`. The store registers the
  browser's sync key over HTTP, then connects, in the background and again until both succeed, so
  a store opens, and its replica reads, offline.
- `sync/SyncKey.ts` is the eventlog identity the browser syncs a person's stores with on a host,
  made the first time and kept in the browser's storage. `Store.forgetPerson` deletes a person's
  stores and that identity, as signing out does.

A store's databases are named for the host, the person, and the workspace, since positions and
entry IDs are only unique within one store. Eventlog runs a handler's failure past the journal,
which records the entry anyway, so a batch the replica could not write ends the store's `counts`
with the error rather than leaving the replica silently behind.

## Tests

`bun run test --project @amends-dev/app-v2` runs them in happy-dom, with `fake-indexeddb` as the
browser's storage. The store's test serves a host in process, the HTTP API and the sync server over
memory storage on Bun, and opens a store against it: the reset arrives, a change made over HTTP
follows, and the store reads its replica again with the host gone.
