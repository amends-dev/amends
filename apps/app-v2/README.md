# @amends-dev/app-v2

The workspace app, being built on [Foldkit](https://foldkit.dev): a browser app that signs people
in over the [HTTP API](../../packages/http/README.md) and keeps each workspace they open in sync
through [`@amends-dev/sync`](../../packages/sync/README.md), so it reads, and will write, offline.
For now it signs in, lists the person's workspaces, and opens one: its groups, a group's threads
with how much of each is new, and a thread's messages, where the person starts a thread, replies,
renames a thread, edits or deletes their own messages, and follows or stops following a thread,
which opening reads through its latest activity. What they do shows at once, marked as sending,
even offline, and what the server refuses comes back with why.

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
  signed in, the session, the person's workspaces, and the one open: its store's state, the
  groups and members its replica holds, the person's unfinished actions, and the open group, with
  its threads, the thread being started, and the open thread, with its messages and the reply.
- `message.ts`, `update.ts`: what happens and what it changes. A message the page is past, such as
  a code check finishing after the person left the form, changes nothing.
- `command.ts`: the sign-in requests, keeping the session, listing workspaces, and signing out, each
  ending in a message, failures worded for the person. Signing out forgets the session, the
  person's stores, and their sync identity first, so it works offline, then removes the browser's
  sync key and ends the session as far as the host can be reached.
- `store.ts`: the open workspace's store as a managed resource, open while a workspace is open and
  closed when the person leaves it or signs out; what its replica holds as subscriptions, the
  groups, members, and actions, the open group's threads, and the open thread's messages; and the
  commands that write to it, starting a thread, replying, and dismissing a refused action.
- `view.ts`: markup over `@foldkit/ui`'s headless components, with no styles yet.
- `flags.ts`, `session.ts`, `browser.ts`, `api.ts`: the address and the session kept from the last
  visit, the browser's services the runtime gives commands and stores, and the API's client.

## Sync

`sync/Store.ts` opens one person's store of one workspace on one host, for as long as a scope lasts:

- Its event log, Effect eventlog's, journals into an IndexedDB database of its own and applies each
  `ReplicaChanged` the server writes to the replica. `write` writes an action, which eventlog sends
  when it can; its local handler holds the action in the replica until the server completes it,
  with the records `sync/Pending.ts` says it creates: a thread started in a group, with its opening
  message, and a reply, under the IDs core derives from the action's key, the request key the
  server runs it under. A handler runs before eventlog journals the action, so one that fails
  fails the write.
- `sync/Pending.ts` is what an unfinished action does to what the person sees: the records it
  creates, and how it changes records the replica holds: renaming a thread or a team, editing or
  deleting a message, ending the person's part in a thread or taking up one they ended, and moving
  their position in a thread. Following a thread they never took part in waits for the server,
  which gives the participation their group membership. `overlay` applies the unfinished actions, in the order they were
  written, each to what the ones before it left, on top of the server's records each time they are
  read, so whatever the server changes meanwhile shows through what an action leaves alone, and a
  record an action created gives way to the server's own under the same key. A completed or
  rejected action no longer applies.
- `sync/Replica.ts` is the replica: the records the person may see, in another IndexedDB database,
  each under its key with its kind and the place it sits, from core's `ReplicaRecord.placeOf`.
  `apply` writes a commit's batch in one transaction, and dropping a group or a thread drops what
  sits in it. The replica keeps the position of the last commit it applied and passes over a batch
  it already holds, since eventlog runs a remote entry's handler before its journal records the
  entry and sends it again after a stop between the two; a reset applies at any position. It holds
  the server's records alone, and the person's unfinished actions beside them: `Completed` drops
  the action it names, and `Rejected` keeps it, with why, until `dismiss`. `list` reads the records
  of a kind at a place, `threads` a group's threads with their messages, and `actions` the person's
  unfinished actions, each again after every change; the store reads each through `overlay`.
- The host's sync server is the event log's remote, through `SyncClient`. The store registers the
  browser's sync key over HTTP, then connects, in the background and again until both succeed, so
  a store opens, reads, and takes actions offline. Each time its connection drops, the store builds
  the remote anew: eventlog's remote asks for changes from the position it first asked from for as
  long as it lives, which after a drop the server answers with a reset, and a reset leaves out how
  the actions committed before it ended.
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
  why, a workspace opening to a group, a thread, and a reply, a thread started, a write that could
  not be kept, and signing out.
- A Scene test drives the view as a person does, from typing their address through a reply and a
  refused action to signing out.
- The replica's tests cover the cascade, its positions, and the actions it holds: completed,
  rejected, dismissed, and kept through a reset. `overlay`'s cover what an action creates giving way
  to the server's, its changes over the server's records, actions applied in order, edits and
  deletes, and refused actions applying nothing.
- The store's tests serve a host in process, the HTTP API and the sync server over memory storage
  on Bun, and open a store against it: the reset arrives, a change made over HTTP follows, and the
  store reads its replica again with the host gone; a thread it starts shows at once and becomes
  the server's under the same ID, a reply written with the host gone reaches it once it is back,
  and one to a thread that does not exist comes back rejected.

`bun run --filter @amends-dev/app-v2 build` bundles the app, which CI builds too.
