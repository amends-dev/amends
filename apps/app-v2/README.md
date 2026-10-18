# @amends-dev/app-v2

The workspace app, being built on [Foldkit](https://foldkit.dev): a browser app that signs people
in over the [HTTP API](../../packages/http/README.md) and keeps each workspace they open in sync
through [`@amends-dev/sync`](../../packages/sync/README.md), so it reads, and will write, offline.
For now it signs in, lists the person's workspaces, and opens one: the groups they belong to and
the public teams they may join, where they create a team, start a conversation with another
member, rename a team, admit and remove its members, follow it, join it, or leave it; a group's
threads with how much of each is new; a thread's messages, where the person starts a thread,
replies, renames a thread, edits or deletes their own messages, and follows or stops following a
thread, which opening reads through its latest activity; the task a thread tracks, which the
person makes of it and whose status, priority, and assignee they change, and its agents' turns,
which they stop or run again and whose logs they follow while online; the person's inbox, the notifications
waiting for them, each as the message it is about, to open, or to mark seen one at a time or all
at once; and the workspace's settings, where they
rename the workspace and themselves, change a member's role, remove a member, hand the workspace
to another person, and invite someone by address or revoke an invitation; and the workspace's
connections to the integrations the host installs, where they add one, with its key and the
settings its integration's form asks for, rename it, change its settings, replace its key, check it
with its system, and remove it; and the workspace's agents, where they add one, with the role it
starts with and how it is set up, on the harnesses, models, and sandboxes the connections give, and
rename it or change its setup; and the workspace's channels, where they add one over a connection
that gives channels, into a group they belong to, move one's conversations to come to another
group, and remove one, and a channel's contacts are named on their messages. A reply or a new
thread the person has not sent is kept as a draft in their browser, through a reload and offline,
until they send it. While the host can be reached, a team's members and the workspace's show who
has the workspace open, and a thread shows who else is typing in it. What they do shows at
once, marked as sending, even offline, and what the server refuses comes back with why. A control
shows only when the person may use it.

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
  signed in, the session, the person's workspaces, and the one open: its store's state, what its
  replica holds of the workspace, its groups, members, roles and their assignments, invitations,
  the person's notifications, group memberships, and the person's group follows, the person's
  unfinished actions, the team or conversation they are starting, and the open pane: a group, with
  its threads, the thread being started, the name being given it, the member chosen to admit, and
  the open thread, with its messages, the reply, its task, its turns, and the log being followed;
  the inbox; the settings, with the names
  being given and the invitation being written; or the connections, with the form open among
  them, adding, renaming, configuring, or replacing a key, and the last check; or the agents, with
  the form open among them, adding, configuring, or renaming one, and the models the chosen
  connection offers; or the channels, with the form open among them, adding or moving one. The
  integrations the host installs are read once the person opens the connections, the agents, or
  the channels.
- `message.ts`, `update.ts`: what happens and what it changes. A message the page is past, such as
  a code check finishing after the person left the form, changes nothing.
- `command.ts`: the sign-in requests, keeping the session, listing workspaces, and signing out, each
  ending in a message, failures worded for the person. Signing out forgets the session, the
  person's stores, and their sync identity first, so it works offline, then removes the browser's
  sync key and ends the session as far as the host can be reached. As a member of the open
  workspace: listing the integrations the host installs and the models a connection offers, and
  adding a connection, replacing its key, and checking it, over HTTP, since a key never enters an
  action and no replica holds what a check finds; and saying the person types in a thread, at once,
  then at most as often as typing lasts, by core's `Presence.typingRepeats`, and that they stopped
  once they send their reply.
- `store.ts`: the open workspace's store as a managed resource, open while a workspace is open and
  closed when the person leaves it or signs out; what its replica holds as subscriptions, the
  groups, members, memberships, follows, and actions, the open group's threads, and the open
  thread's messages, task, and turns; the log of the turn the person follows, read over HTTP while
  online, since no replica holds it; who is present in the workspace, followed over HTTP while it is
  open, and no one while the host can't be reached; the drafts of the places open, each read once its place opens
  and kept from then on as it changes; and the commands that write to it, an action each, and
  dismissing a refused action.
- `view.ts`: markup over `@foldkit/ui`'s headless components, with no styles yet, from the controls
  `controls.ts` shares; `connectionsView.ts` is the connections pane, whose settings fields
  `settingsForm.ts` reads from each integration's form: text, numbers, yes or no, and choices, the
  draft the person writes, and the settings it makes, or which field it wants; and
  `agentsView.ts` is the agents pane, whose setup `agentSetup.ts` drafts from an agent and makes
  a configuration of, or says what it still wants; `channelsView.ts` is the channels pane; and
  `opened.ts` is what the views read of the open workspace: what members and groups are called,
  and whether the person belongs to a group.
- `permissions.ts`: what the person may do, as core decides it from the replica's records: the
  grants their own assignments confer through the workspace's roles, from core's
  `GrantResolver.grantsOf`, and whose roles they may change, from `Delegation.recipientDenial`. The
  view offers a control only when they allow it, such as stopping a turn only to someone who may
  direct its agent, by core's `Turn.directRequirement`; the server decides again.
- `flags.ts`, `session.ts`, `browser.ts`, `api.ts`: the address and the session kept from the last
  visit, the browser's services the runtime gives commands, subscriptions, and stores, and the API's
  client, outside a workspace or as a member of one.

## Sync

`sync/Store.ts` opens one person's store of one workspace on one host, for as long as a scope lasts:

- Its event log, Effect eventlog's, journals into an IndexedDB database of its own and applies each
  `ReplicaChanged` the server writes to the replica. `write` writes an action, which eventlog sends
  when it can; its local handler holds the action in the replica until the server completes it,
  with the records `sync/Pending.ts` says it creates: a thread started in a group, with its opening
  message and the task it starts as, a conversation's direct group, a reply, a team and its
  admissions, an admission, a role assignment, a thread's task, a turn run again, and an agent with
  its membership, role, and admission to the general group, and a channel, under the IDs
  core derives from the action's key, the request key the server runs it under, or from what it
  names, as a retry's from the turn it retries. An action whose payload only names a record it
  copies from, as a task copies its thread's group, finds that record as the person sees it: the
  replica's, as their unfinished actions leave it. A handler runs before eventlog journals the
  action, so one that fails fails the write.
- `sync/Pending.ts` is what an unfinished action does to what the person sees: the records it
  creates, and how it changes records the replica holds: renaming a thread or a team, editing or
  deleting a message, ending the person's part in a thread or taking up one they ended, moving
  their position in a thread or a group, removing a member from a team, leaving, ending or taking
  up a follow of a group, renaming the workspace or themselves, handing the workspace over,
  removing a member from it, revoking an invitation, revoking the roles a new one replaces,
  marking notifications seen, one, every one up to a point, or those from a thread the person
  reads, by core's own `NotificationStore.isAtOrBefore` and `isPendingInThread`, changing a task
  from the value they saw, by core's `Task.apply`, which a task changed meanwhile keeps,
  stopping a turn, at once while it is queued, and renaming a connection from the name they saw,
  replacing its settings, and removing it, and changing how an agent is set up and renaming it
  from the name they saw, and moving and removing a channel; how ready a connection or an agent is
  stays as the server found it.
  Following a thread they never took part in, or a group they never followed, waits for the
  server, which gives the participation or the follow their group membership; so does issuing an
  invitation, whose recipient's account only the server finds. `overlay` applies the unfinished actions, in the order they were
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
  unfinished actions, each again after every change, `every` the records of a kind wherever they
  sit, `inbox` the person's notifications with the threads they come from, which the store
  shows each by the message its activity is about, and `thread` what a thread holds, with its task
  and turns; the store reads each through `overlay`, and offers each turn's retry by core's
  `Turn.whyNotRetryable`, from where its agent stands among the thread's turns, by
  `TurnStore.latestOf`, and who takes part in it. `get` and `getActions` read a record and the
  actions once, for an action being written.
- The host's sync server is the event log's remote, through `SyncClient`. The store registers the
  browser's sync key over HTTP, then connects, in the background and again until both succeed, so
  a store opens, reads, and takes actions offline. Each time its connection drops, the store builds
  the remote anew: eventlog's remote asks for changes from the position it first asked from for as
  long as it lives, which after a drop the server answers with a reset, and a reset leaves out how
  the actions committed before it ended.
- `sync/Drafts.ts` is the person's drafts in the store, a reply in a thread or a new thread in a
  group, in an IndexedDB database of their own beside the replica, which no server or other
  device sees; saves keep the order they were asked in.
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
  not be kept, a thread's actions, a team and a conversation started, a team's actions, the
  workspace's settings, the inbox, a thread's task and turns, a turn's log followed until it ends
  and again after it could not be, the connections, from listing the integrations through adding,
  renaming, configuring, replacing a key, checking, and removing one, the agents, adding one on a
  connection's model and changing and renaming one, the channels, adding one into a group the
  person belongs to, moving, and removing one, a draft read into a place only while the person has
  written nothing there and emptied once sent, typing said once while it is being told and stopped
  once the reply is sent, and signing out.
- Scene tests drive the view as a person does, from typing their address through a reply and a
  refused action to signing out, from joining a team through creating one, seeing it at once, and
  admitting and removing its members, and an owner managing the workspace's settings, then seeing
  only their own name to change once another member owns it, an owner adding a connection from its
  integration's form, checking it and opening its settings, then seeing it without the controls as
  a member, an owner adding an agent on a connection's model and opening its setup, then reading
  how it runs as a member, an owner adding and moving a channel, then reading where it opens as a
  member, and a contact named on their message, who is online among a team's members and who types
  in the open thread, the inbox's count, its
  notifications, and opening one's thread, and a thread made a task and changed, its turns stopped
  and retried, and a turn's log followed, then seen without the grants to change any of it.
- The replica's tests cover the cascade, its positions, and the actions it holds: completed,
  rejected, dismissed, and kept through a reset. `overlay`'s cover what an action creates giving way
  to the server's, its changes over the server's records, actions applied in order, edits and
  deletes, a team renamed, members removed and leaving, a group's follow ended and taken up, the
  workspace renamed and handed over, the person renamed, a member removed, roles replaced, a
  connection renamed, configured, and removed, an agent added under the IDs the server gives, set
  up again, and renamed, a channel added under its ID, moved, and removed, an
  invitation revoked, notifications marked seen and settled by reading their thread, a task made
  from the thread the person sees or started with its thread, changed from the value seen, turns
  stopped and run again, and refused actions applying nothing; `find`'s cover a record as the
  person's actions leave it.
- The store's tests serve a host in process, the HTTP API and the sync server over memory storage
  on Bun, and open a store against it: the reset arrives, a change made over HTTP follows, and the
  store reads its replica again with the host gone; a thread it starts shows at once and becomes
  the server's under the same ID, a reply written with the host gone reaches it once it is back,
  and one to a thread that does not exist comes back rejected; a team and its admission, and a
  conversation, started in the browser come back as the server's under the IDs the browser gave
  them; an invitation by address reaches that address's account, and a role change becomes the
  server's under the ID the browser gave it; and another member's reply reaches the person's
  inbox, which reading the thread settles at once and then on the server; and a thread made a task
  and changed shows at once and becomes the server's, while a change from a stale value comes back
  refused; and a connection added over HTTP, to an integration the test host installs, reaches the
  store, and its rename and removal show at once, then as the server made them; and an agent added
  in the browser, with its membership, role, and admission, comes back as the server's under the
  IDs the browser gave them; and a channel added in the browser is the server's under the same ID,
  and its move shows at once. `Store.viewTurns` is
  tested apart: which turns may run again, and `settingsForm.ts`: the fields an integration's form
  gives, a draft from its defaults or a connection's settings, and the settings a draft makes, and
  `agentSetup.ts`: an agent's draft, and the configuration a draft makes. `Drafts`' tests keep a
  draft for each place, the last one written, through being closed and opened again.

`bun run --filter @amends-dev/app-v2 build` bundles the app, which CI builds too.
