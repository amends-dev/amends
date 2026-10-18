# @amends-dev/sync

How a member's browser keeps a workspace in sync with the server, as
[Effect eventlog](https://github.com/Effect-TS/effect) events. Each member has a store per workspace:
an ordered log their browser replicates into its replica, the IndexedDB copy of the records they
may see.

- **Actions** are what the member does, such as `ThreadMessagePosted`. Their browser writes an
  action to its event log and applies it at once; the server runs it as a core operation, as the
  member, through the gateway, once: as a request keyed by the action's entry ID, so a resent
  action is never run again, and one the server could not run now is run when resent.
- **Changes** keep the replica current. The server writes one `ReplicaChanged` for each commit
  that changes what the member sees, carrying core's `ReplicaChange.Batch`: the commit's changes,
  whole, so the browser applies a commit or none of it. `Changed` carries a record as it is now, and
  `Dropped` the key of one that left the member's reach; dropping a group drops everything in it,
  its admissions, follows, read time, and threads, and dropping a thread everything in it, so the
  server never lists what the member can no longer see. `Reset` drops everything the replica held,
  before the records that follow. `Completed` and `Rejected` end the member's own actions, naming
  each by its entry ID: either way the browser drops what it applied of the action itself, since
  the changes carry what it did, and a rejected one did nothing. Only core's `Rejection` kinds
  reject an action.

Each domain has a module with its `Actions`: `WorkspaceSync`, `GroupSync`, `ThreadSync`,
`TaskSync`, `TurnSync`, `NotificationSync`, `ConnectionSync`, `AgentSync`, and `ChannelSync`.
`ReplicaSync` holds the change, and `SyncSchema` every group, as the `EventLog.schema` the server and
the browser build their event logs over. A change's sequence in a member's store is its commit's
position, and its primary key that position too, so no two are compacted together.

What a browser shows beyond the records, such as a thread's preview, its unread count, or whether
the member may rename it, it derives from the records and the member's own grants. Some writes
stay requests to the [HTTP API](../http/README.md): signing in, creating a workspace, accepting an
invitation, and anything that carries a secret, such as a connection's API key.

## Encoding

An event's payload travels in eventlog's binary encoding, which writes strings as UTF-8: a string
holding a lone UTF-16 surrogate comes back with U+FFFD in its place. Text people enter already
refuses one, through core's `Text.isStorable` and `Text.isName`, so only an identifier or a key
could hold one, and no record has such an identifier. The tests check that every other payload
each action accepts, and a change to every kind of record, come back unchanged.

## Server

`SyncServer.layerHandlers` is the server: Effect eventlog's RPC handlers for every member's store,
with eventlog's authentication, over the [gateway](../gateway/README.md) and its `SyncStorage`. A
store is one person's in one workspace: its ID is the workspace's, and the eventlog identity that
opens it is one whose key the person registered, with `PUT /me/sync-keys/:publicKey` on the
[HTTP API](../http/README.md); the first signing key it authenticates with is bound to the key, and
only that one authenticates it after. The actions a store receives run as the person's requests,
through core's `RequestService.runOnce` keyed by each entry's ID, in the order the browser wrote
them, each by the operation its tag names; an entry that is no action, or does not decode, is
rejected as `Invalid`. An invitation names its recipient by address, since a browser knows no
account but its own: the server finds or creates the account through the host's `Accounts`, as
the HTTP API does, and invites its person. A store or host that cannot be reached fails the write, which the browser
sends again. A store's changes are the person's replica as it changes, from core's
`ReplicaService.changes`, after the position the browser holds: a `ReplicaChanged` for each commit,
its sequence the commit's position and its entry ID derived from the store and the commit, so a
commit sent again is the same entry.

`SyncServer.layer` serves the handlers on the host's HTTP router, beside the HTTP API: Effect RPC
over a WebSocket at `/sync`, in Effect's binary schema encoding. As the HTTP server begins to drain,
which the HTTP package's `Draining` says, each socket closes and none opens after, so browsers
reconnect to the host that serves them next. `SyncClient.layer(apiUrl)` is the browser's end: an
unencrypted `EventLogRemote` over a WebSocket to the host serving the HTTP API at `apiUrl`, which
reconnects when its socket drops; the browser gives its platform's WebSocket constructor and
eventlog's registry.

The remote ID is how browsers know the server, and keep a position for it in each store.
`SyncStorage` makes it with the storage and keeps it, so it changes only when positions could
repeat, for storage made anew. Storage restored from a backup repeats positions under the same one,
so a restore clears it for a new one to be made, as the
[PostgreSQL adapter](../../adapters/storage-postgresql/README.md#schema) says. A browser keeps one
event journal for each store, since positions and entry IDs are only unique within one.

## Imports

Import a module by its subpath, such as `@amends-dev/sync/ThreadSync`. The contract reaches core's
records, inputs, and errors, never its operations, and `SyncClient` only Effect's eventlog and RPC,
so a browser bundle carries no server code as long as it never imports `SyncServer`, which runs
core's operations through the gateway.
