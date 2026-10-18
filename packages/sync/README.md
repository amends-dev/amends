# @amends-dev/sync

How a member's browser keeps a workspace in sync with the server, as
[Effect eventlog](https://github.com/Effect-TS/effect) events. Each member has a store per workspace:
an ordered log their browser replicates into its replica, the IndexedDB copy of the records they
may see.

- **Actions** are what the member does, such as `ThreadMessagePosted`. Their browser writes an
  action to its event log and applies it at once; the server runs it as a core operation, as the
  member, through the gateway.
- **Changes** keep the replica current: `<Record>Changed` carries a record as it is now, and
  `<Record>Dropped` its key once it has left the member's reach. Dropping a group drops everything
  in it, its admissions, follows, read time, and threads, and dropping a thread everything in it, so
  the server never lists what the member can no longer see. `ReplicaReset` drops everything the
  replica holds, before the changes that carry everything the member sees now. A change's primary
  key is its record's kind and key, so compaction keeps each record's latest change.
- **Outcomes** end an action: `ActionCompleted` arrives with the changes the action made, and
  `ActionRejected` names why the server could not do it, as one of core's `Rejection` kinds. Either
  way the browser drops what it applied of the action itself. The server runs each action once, as
  a request keyed by its entry's ID, so a resent action is never run again, and one it could not
  run now is run when resent, never rejected.

Each domain has a module with its `Actions` and `Changes`: `WorkspaceSync`, `GroupSync`,
`ThreadSync`, `TaskSync`, `TurnSync`, `NotificationSync`, `ConnectionSync`, `AgentSync`, and
`ChannelSync`. `ReplicaSync` holds the reset, `Outcomes` how actions ended, and `SyncSchema` every
group, as the `EventLog.schema` the server and the browser build their event logs over. The changes cover exactly
the kinds of record core's `ReplicaRecord` names, each with the shape it gives them.

What a browser shows beyond the records, such as a thread's preview, its unread count, or whether
the member may rename it, it derives from the records and the member's own grants. Some writes
stay requests to the [HTTP API](../http/README.md): signing in, creating a workspace, accepting an
invitation, and anything that carries a secret, such as a connection's API key.

## Encoding

An event's payload travels in eventlog's binary encoding, which writes strings as UTF-8: a string
holding a lone UTF-16 surrogate comes back with U+FFFD in its place. Text people enter already
refuses one, through core's `Text.isStorable` and `Text.isName`, so only an identifier or a key
could hold one, and no record has such an identifier. The tests check that every other payload
each event accepts comes back unchanged.

## Imports

Import a module by its subpath, such as `@amends-dev/sync/ThreadSync`. The contract reaches core's
records, inputs, and errors, never its operations, so a browser bundle carries no server code.
