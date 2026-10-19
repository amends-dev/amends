# @amends-dev/app-v2

The workspace app, being built on [Foldkit](https://foldkit.dev) Blocks: a browser app that signs
people in over the [HTTP API](../../packages/http/README.md) and keeps each workspace they open in
sync through [`@amends-dev/sync`](../../packages/sync/README.md), so it reads, and will write,
offline. It signs in, lists the person's workspaces, and opens one: the groups they can see, to
pick one; a group's threads with how much of each is new, where they start a thread; and a thread's
messages, where they reply, rename the thread, edit or delete their own messages, and follow or
stop following it, which opening reads through its latest activity; and their inbox, the
notifications waiting for them, each as the message it is about, to open, or to mark seen one at a
time or all at once; and the workspace's connections to the integrations the host installs, to add,
rename, set up, check, and remove. A reply or a new thread they have not sent is kept as a draft in their
browser, through a reload and offline, until they send it. While the host can be reached, a thread
shows who else is typing in it. What they do shows at once, marked as sending, even offline, and
what the server refuses comes back with why. The features the earlier program had beyond these
return one Block at a time; [The program](#the-program) lists them.

This cut runs on a Foldkit preview, the Blocks branch's canary build pinned in `package.json`,
whose APIs its author says will change; upgrading it is a chore of its own. The root manifest's
`patchedDependencies` applies `patches/foldkit@0.168.0-canary.bfd880b1e6ca.patch` to it: in the
canary, a keyed Binding's OutMessage fold that opens another child, as picking a thread opens it,
leaves the parent model undefined, because the keyed fold does not resolve the child init recipe a
`Definition.step` returns, as a direct Binding's fold does. The patch resolves it the same way;
the fix belongs upstream in `packages/foldkit/src/block/keyedBinding.ts`, and the patch goes when
a build carries it.

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

The program follows Foldkit's architecture, cut into Blocks: each feature owns its state machine,
its model, messages, update, view, commands, and subscriptions, and a parent decides where it
lives and what its facts mean. A feature Block takes identities and reads its data from the
person's store of the workspace, writes actions to it, and reports facts about identities to its
parent, so it embeds wherever those identities are known. `feature/` holds the features and `page/`
the pages that compose them; the root composes the pages.

- `feature/composer`: what the person writes at a place, a reply in a thread or a new thread in a
  group, kept as a draft in their browser until they send it. It reports what it sends, and that
  its text changed.
- `feature/thread`: a thread as the person reads and takes part in it: its title and messages, their
  part in it, how far they have read, who types there, the task it tracks, its agents' turns, and a
  composer to reply. They rename it, edit and delete their own messages, and follow it or stop;
  reading it marks it read through its latest activity, once for each. The reply composer's changes
  say the person types, at once, then at most as often as typing lasts, by core's
  `Presence.typingRepeats`, and sending says they stopped.
- `feature/task`: the task a thread tracks: its status, priority, and assignee, which the person
  changes from what they saw, when they may, assigning an agent only when they may use it; or,
  while the thread tracks none, making it one, when they may create tasks in its group. The thread
  embeds it.
- `feature/turns`: a thread's agents' turns, oldest first, each with its agent by name and how it
  stands, who ran it again, and why it failed. The person stops a turn while it is active and runs
  it again once nothing but who may direct its agent keeps it from running again, when they may
  use that agent, by core's `Turn.directRequirement`. They follow a turn's log, which opens with
  its items and then grows as the turn writes it, until the turn ends, or until they hide it or
  it could not be followed, which says why and offers to follow it again; one log at a time. The
  thread embeds it.
- `feature/threads`: a group's threads, each with its opening message, its task, whether it is still
  being started, and how much is new, and a composer to start one. It reports the thread picked.
- `feature/group`: a group as the person has it open: its name, their part in it, a team's members,
  its threads, and the thread open among them, a keyed occurrence, so opening another makes a fresh
  one and a late result cannot land in the wrong one. It opens with a thread already open when its
  parent gives one. They rename a team, follow it or stop, join a public team or leave one, and,
  where they manage its members, admit and remove them.
- `feature/groups`: the groups the person can see, the teams they belong to by name and their
  conversations by the other members in them, then the public teams they may join, to pick one
  from; and where they start a team, or a conversation with another member. It reports the group
  picked, and its parent tells it which group is open, so the one marked is the one shown.
- `feature/inbox`: the notifications waiting for the person, newest first, each as the message it is
  about: who wrote the message its activity is about, and the thread it comes from, by its title or
  opening message, in its group, as far as the store holds them. They open a notification's thread,
  or mark one seen, or every one up to the newest that waits. It reports the thread opened, and
  offers a count of what waits for its parent to show.
- `feature/connections`: the workspace's connections, each by its name with its integration and how
  ready it is, as the store holds it, marked as sending while a change to it is on its way. The
  host's integrations are listed over HTTP as the Block opens, and again when the person asks after
  they could not be reached. Where they may manage a connection, they rename it, change its
  settings by the form its integration gives, replace its key, check it with its system, which says
  whether it answers and accepts the key, and remove it; where they may create connections, they add
  one to an integration, choosing a name, how it authenticates, a key when it takes one, and its
  settings. Renaming, changing the settings, and removing are actions written to the store; adding a
  connection, replacing a key, and checking go over HTTP, since a key never enters an action. A form
  about a connection that is gone closes. `connectionsGiving` names the connections whose
  integration gives a capability, from the connections and integrations a Model keeps, for the
  agents and channels features to choose among.
- `feature/actions`: the person's actions the server has not finished, each with why it was
  refused, until they dismiss it.
- `page/signIn`: signing in, a step at a time; it keeps the session a right code gives, and reports
  it.
- `page/workspaces`: the workspaces the person belongs to, listed over HTTP; it reports the one
  picked.
- `page/workspace`: a workspace the person opened, as their member of it: its groups and actions,
  an "Inbox" button with how many notifications wait and a "Connections" button, and the main
  content, which shows one destination: nothing yet, the inbox or the connections, which are always
  read, or the open group, a keyed occurrence. Picking a group opens it; showing the inbox or the
  connections leaves no group marked in the list; opening a notification's thread opens its group
  with the thread already open, and marks the group. Opening the workspace asks the host for the
  integrations its connections link to. It reports when the person leaves it.
- The root, `composition.ts` with `model.ts`, `message.ts`, `init.ts`, `update.ts`, and `view.ts`:
  the page the person is on, signed out at the form or signed in with their account, workspaces, and
  the one open. Signing in lists the workspaces; signing out, `command.ts`,
  forgets the session, the person's stores, and their sync identity first, so it works offline,
  then removes the browser's sync key and ends the session as far as the host can be reached.
  `entry.ts` assembles the application over `services.ts`, which supplies the stores, the session,
  and the browser's services beneath them.

A Block's commands and subscriptions reach the store through `store/Stores.ts`, an ordinary service:
it opens the person's store of a workspace on the first read or write, shares it among all of them,
and closes it a while after the last one lets go. The session, `session.ts`, is a service too: the
sign-in command keeps it, and no model carries the token. What no replica holds goes over HTTP from
the Block that needs it, `api.ts`: listing workspaces, saying the person types in a thread,
following a turn's log, which its Block's subscription reads while the log is followed, and listing
the host's integrations, adding a connection, replacing its key, and checking it.

Features the earlier program had and this cut does not yet: the workspace's settings, agents, and
channels. Each returns as a Block by the same template; `agentSetup.ts` waits for the agents
feature. `settingsForm.ts`, an integration's settings form as the person fills it in, is the
connections feature's.

## The store

`store/Store.ts` opens one person's store of one workspace on one host, for as long as a scope lasts:

- Its event log, Effect eventlog's, journals into an IndexedDB database of its own and applies each
  `ReplicaChanged` the server writes to the replica. `write` writes an action, which eventlog sends
  when it can; its local handler holds the action in the replica until the server completes it,
  with the records `store/Pending.ts` says it creates: a thread started in a group, with its opening
  message and the task it starts as, a conversation's direct group, a reply, a team and its
  admissions, an admission, a role assignment, a thread's task, a turn run again, and an agent with
  its membership, role, and admission to the general group, and a channel, under the IDs
  core derives from the action's key, the request key the server runs it under, or from what it
  names, as a retry's from the turn it retries. An action whose payload only names a record it
  copies from, as a task copies its thread's group, finds that record as the person sees it: the
  replica's, as their unfinished actions leave it. A handler runs before eventlog journals the
  action, so one that fails fails the write.
- `store/Pending.ts` is what an unfinished action does to what the person sees: the records it
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
- `store/Replica.ts` is the replica: the records the person may see, in another IndexedDB database,
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
  shows each by the message its activity is about, `thread` what a thread holds, with its task
  and turns, `group` a group with its admissions and the person's follow of it, and `grants` what
  the person may do, resolved by core's `GrantResolver` from their active assignments and the
  workspace's roles; the store reads each through `overlay`, and offers each turn's retry by core's
  `Turn.whyNotRetryable`, from where its agent stands among the thread's turns, by
  `TurnStore.latestOf`, and who takes part in it. `get` and `getActions` read a record and the
  actions once, for an action being written.
- The host's sync server is the event log's remote, through `SyncClient`. The store registers the
  browser's sync key over HTTP, then connects, in the background and again until both succeed, so
  a store opens, reads, and takes actions offline. Each time its connection drops, the store builds
  the remote anew: eventlog's remote asks for changes from the position it first asked from for as
  long as it lives, which after a drop the server answers with a reset, and a reset leaves out how
  the actions committed before it ended.
- `store/Drafts.ts` is the person's drafts in the store, a reply in a thread or a new thread in a
  group, in an IndexedDB database of their own beside the replica, which no server or other
  device sees; saves keep the order they were asked in.
- `store/SyncKey.ts` is the eventlog identity the browser syncs a person's stores with on a host,
  made the first time and kept in the browser's storage. `Store.forgetPerson` deletes a person's
  stores and that identity, as signing out does.

A store's databases are named for the host, the person, and the workspace, since positions and
entry IDs are only unique within one store. Eventlog runs a handler's failure past the journal,
which records the entry anyway, so a batch the replica could not write ends the store's `counts`
with the error rather than leaving the replica silently behind.

## Tests

`bun run test --project @amends-dev/app-v2` runs them in happy-dom, with `fake-indexeddb` as the
browser's storage. Each Block's tests sit beside it:

- Story tests drive a Block's update: the thread read through its latest activity, once, its title
  and messages changed from what was seen, following and unfollowing, typing said once while a reply
  is written and stopped once it is sent, and why a write could not be kept; a task made and changed
  from what was seen, unless nothing changes; a thread's turns stopped while they are active and run
  again only when nothing else keeps them from it, and a turn's log followed from showing it until
  the turn ends or the person hides it, passing over another turn's, and followed again after it
  could not be; a thread started from the composer and the thread picked; a composer filling in its draft only while nothing was written,
  keeping what is written, and sending it once; a group renamed from the name seen, followed, left,
  or joined, a member admitted and an admission removed, and the thread picked opened and closed, or
  open already as the group opens; the groups starting a team or a conversation and reporting the
  group picked once; the inbox listing what waits, newest first, reporting the thread of the
  notification opened, marking one seen or all through the newest that waits, and why a write could
  not be kept; the connections asking for the host's integrations as they open, keeping them or why
  they could not be listed, asking again, adding a connection over HTTP once its integration, name,
  required settings, and key are in, once while it sends, and refused with why, renaming, changing
  the settings of, and removing one as actions from what was seen, replacing a key and checking over
  HTTP, closing a form about a connection that is gone, naming the connections whose integration
  gives a capability, and why a read or a write could not be kept; a workspace asking for the
  integrations as it opens, opening the group picked, showing the inbox or the connections in its
  place with no group marked, and opening a notification's thread in its group; and the root
  signing in a step at a time, listing the workspaces, opening and closing one, and signing out.
- Scene tests drive a Block's view as a person does: a thread's messages by their authors, a reply
  on its way, who types, and a reply written and sent; a task changed by someone who may, read as a
  line by someone who may not, and made by someone who may create tasks; a thread's turns by their
  agents' names and how they stand, stopped and run again by someone who may use the agent and not
  otherwise, a turn's log followed as it is written, until the turn ends or it could not be
  followed, and the thread listing its agents' turns; a group's name, the person's part in it, its
  members with removing for the others, and joining in place of the threads of a team they do
  not belong to; the groups listed apart from the teams to join, with a new team taken only from
  someone who may create one; the inbox's notifications by the message and thread they are about,
  marked all seen, one seen with its failure shown, and one's thread opened; the connections added
  by an owner to an integration, with a key field only for the method that takes one, then checked,
  with their settings shown, their key replaced, renamed with a failure shown, and removed; read by
  an ordinary member without the controls until the person is given the role that manages them,
  marked as sending with none while a change is on its way, by how ready each is, with why the
  integrations could not be listed and a way to ask again, and why they could not be read; and a
  workspace counting what waits beside "Inbox" whichever destination shows, then showing the inbox
  or the connections.
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
