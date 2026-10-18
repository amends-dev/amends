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

## Imports

Import a module by its subpath, such as `@amends-dev/sync/ThreadSync`. The contract reaches core's
records, inputs, and errors, never its operations, so a browser bundle carries no server code.
