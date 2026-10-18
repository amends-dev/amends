# @amends-dev/app-v2

The workspace app, being built on [Foldkit](https://foldkit.dev): a browser app that signs people
in over the [HTTP API](../../packages/http/README.md) and keeps each workspace they open in sync
through [`@amends-dev/sync`](../../packages/sync/README.md), so it reads, and will write, offline.
For now it signs in, lists the person's workspaces, and shows what the open workspace's replica
holds, how many records of each kind; the screens come next.

## Run

Start the [local host](../../hosts/local/README.md) on its default port, then the app:

```sh
bun run --filter @amends-dev/app-v2 dev   # http://127.0.0.1:4410/
```

In development the app reaches the host at its own origin's `/api`, which Vite proxies to
`http://127.0.0.1:8787`, the sync server's WebSocket included, so the two share an origin. A build
reaches `VITE_AMENDS_API_URL` when it is set, and its own `/api` otherwise. The local host logs the
sign-in codes it sends.

## The program

The program follows Foldkit's architecture: a Schema-defined Model, fact-named Messages, an update
that decides, and commands that act.

- `model.ts`: the host's address and the page. Signed out, the sign-in form, a step at a time;
  signed in, the session, the person's workspaces, and the one open, with its store's state.
- `message.ts`, `update.ts`: what happens and what it changes. A message the page is past, such as
  a code check finishing after the person left the form, changes nothing.
- `command.ts`: the sign-in requests, keeping the session, listing workspaces, and signing out, each
  ending in a message, failures worded for the person. Signing out forgets the session, the
  person's stores, and their sync identity first, so it works offline, then removes the browser's
  sync key and ends the session as far as the host can be reached.
- `store.ts`: the open workspace's store as a managed resource, open while a workspace is open and
  closed when the person leaves it or signs out, and its replica's counts as a subscription.
- `view.ts`: markup over `@foldkit/ui`'s headless components, with no styles yet.
- `flags.ts`, `session.ts`, `browser.ts`, `api.ts`: the address and the session kept from the last
  visit, the browser's services the runtime gives commands and stores, and the API's client.

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
browser's storage:

- Story tests drive `update`: signing in a step at a time, each failure going back a step with
  why, a workspace's store opening and following its replica, and signing out.
- A Scene test drives the view as a person does, from typing their address to signing out.
- The replica's tests cover the cascade and its positions.
- The store's test serves a host in process, the HTTP API and the sync server over memory storage
  on Bun, and opens a store against it: the reset arrives, a change made over HTTP follows, and the
  store reads its replica again with the host gone.

`bun run --filter @amends-dev/app-v2 build` bundles the app, which CI builds too.
