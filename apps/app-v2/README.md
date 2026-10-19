# @amends-dev/app-v2

The workspace app, being built on [Foldkit](https://foldkit.dev) Blocks: a browser app that signs
people in over the [HTTP API](../../packages/http/README.md) and keeps each workspace they open in
sync through [`@amends-dev/sync`](../../packages/sync/README.md), so it reads, and will write,
offline. It signs in, lists the person's workspaces, and opens one: the groups they can see, to
pick one; a group's threads with how much of each is new, where they start a thread; and a thread's
messages, where they reply, rename the thread, edit or delete their own messages, and follow or
stop following it, which opening reads through its latest activity; their inbox, the
notifications waiting for them, each as the message it is about, to open, or to mark seen one at a
time or all at once; the workspace's settings, its name and their own, its members and their roles,
and its invitations; the workspace's connections to the integrations the host installs, to add,
rename, set up, check, and remove; its agents, each with how ready it is and what it runs on, to
add, rename, and set up again; and its channels, which bring in conversations from them, to add,
send to another group, and remove. A reply or a new thread they have not sent is kept as a draft in
their browser, through a reload and offline, until they send it. While the host can be reached, a
thread shows who else is typing in it. What they do shows at once, marked as sending, even offline,
and what the server refuses comes back with why. Every feature the earlier program had has returned
as a Block; [The program](#the-program) lists them.

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

## Styling

The look is [`@amends-dev/design`](../design/README.md)'s. `vite.config.ts` runs Tailwind,
`src/styles.css` imports the design's theme, and `index.html` links that stylesheet and sets
`viewport-fit=cover`, so that the shell below 48rem can leave room for a phone's safe areas. A view carries
no class: classes come from a renderer, and the renderers live in the design package. The screens
outside a workspace are composed from it: the root view frames the sign-in page and the workspace
picker in `@amends-dev/design/centered`, and `page/signIn` and `page/workspaces` build their headings,
forms, fields, and rows from the design's `centered`, `control`, `form`, and `directory` modules.
The open workspace is on the design's shell: `page/workspace` renders `shell`, `rail`, `sidebar`,
and the pane of each destination, `feature/groups` renders the sidebar's sections and the modal where
a team or a conversation is started, `feature/group` the main pane, the modal of its settings, and the side pane, `feature/actions` the toasts, and every destination's view wraps
its content in its own `pane`. Inside the group's panes, the threads, the thread's messages, and the
composers are the design's `message`, `divider`, and `composer`, in a `messageList`, with a person's
initials and the time of day from `src/seen.ts`. The task and the turns a thread embeds are the
design's `paneSection`s: the task's status, priority, and assignee are a `fieldGrid` of selects, or
a `detailList` for someone who may not change them, and the turns are an `entryList` of `entry`s,
each its agent's initials and name with a `badge` for how it stands, its buttons in a `buttonRow`,
and its `log`. The inbox lists its notifications as `message`s in a `messageList`, each its author's
initials and name, its thread and group as the `context` line, its text, which opens the thread, and
a quiet Mark seen, with Mark all seen among the header's actions, and `paneEmpty` when nothing
waits. The settings are a `paneColumn` of `paneSection`s: each name is a `settingRow` of the name, a
line of what it is for, and a secondary button to change it, which a `form` of a `field` with Save
and a quiet Cancel replaces while the person does; the members and the invitations waiting are
`entryList`s of `entry`s, each with a mark, a `badge` or a role select with no label shown, and its
quiet buttons in a `buttonRow`, and the invite form is a `fieldGrid` of its email and role. The
connections, the agents, and the channels are each a `paneColumn` of what failed, the list, and the
form open among it: the list is an `entryList` of `entry`s, or a `paneEmpty` that says what adding
one does, and the form is a `paneForm` titled as the form is named, holding the design's fields,
selects, switches, and textarea, its failure as a `notice`, and a `buttonRow` of its submit and a
quiet Cancel, which holds "Adding…" or "Replacing…" in place of the submit while the
host answers. Adding is the secondary button among the header's actions, shown only when the person
may, the host's integrations are listed, and a connection gives what the thing needs; the line
that says the integrations are loading, or that no connection gives models or channels, is a
`hint` in the body, and a failure to list them a `notice` with a quiet Try again. Each connection is
an entry of its name, its integration and how ready it is as `badge`s, a hint of why it can't be
used, what its last check found, and its quiet buttons; each agent an entry of its initials and
name, a badge of whether it can run, a hint of why not and of what it runs on, and its quiet
buttons; each channel an entry of its name, a badge when it opens tasks, a hint of where its
conversations come from and open, and its quiet buttons. The group's settings are the design's
`modal` of `paneTabs`: the General tab is a `field` for the team's name with a `hint`, and a
`settingRow` each for the visibility and the person's membership, with Leave or Join as its action; the
Members tab is an `entryList` with each member's initials, name, and an Online `badge` while they have
the workspace open, and the admit form below it.

## The program

The program follows Foldkit's architecture, cut into Blocks: each feature owns its state machine,
its model, messages, update, view, commands, and subscriptions, and a parent decides where it
lives and what its facts mean. A feature Block takes identities and reads its data from the
person's store of the workspace, writes actions to it, and reports facts about identities to its
parent, so it embeds wherever those identities are known. `feature/` holds the features and `page/`
the pages that compose them; the root composes the pages.

- `feature/composer`: what the person writes at a place, a reply in a thread or a new thread in a
  group, kept as a draft in their browser until they send it. It reports what it sends, and that
  its text changed. Its view takes how the box is labelled, what it shows while it is empty, and what
  its button says, and is the design's `composer`.
- `feature/thread`: a thread as the person reads and takes part in it: its title and messages, their
  part in it, how far they have read, who types there, the task it tracks, its agents' turns, and a
  composer to reply. They rename it, edit and delete their own messages, and follow it or stop;
  reading it marks it read through its latest activity, once for each. The reply composer's changes
  say the person types, at once, then at most as often as typing lasts, by core's
  `Presence.typingRepeats`, and sending says they stopped. It has two views. `view`, its canonical
  one, is the body of a side pane: Follow or Unfollow and Rename in a row, the form to rename it while
  the person does, the task and the turns, then its messages as a list, the opening first, how many
  replies follow it, and the replies, each by its author's initials, name, and time, with "Sending…"
  or "edited" after the time, and Edit and Delete on the person's own, which the form to edit it
  replaces while they do; and who else types, in a live region under them. It shows no title, which
  the pane's header has. `replyView` is the reply composer, for the pane's footer.
- `feature/task`: the task a thread tracks: its status, priority, and assignee, which the person
  changes from what they saw, when they may, assigning an agent only when they may use it; or,
  while the thread tracks none, making it one, when they may create tasks in its group. Its view is
  a section titled Task, with "Sending…" after the title while a change is on its way: the three
  selects side by side, with "No one" as the assignee's empty choice, or, for someone who may not
  change it, the three as labelled rows, the assignee by name. The thread embeds it.
- `feature/turns`: a thread's agents' turns, oldest first, each with its agent by name and how it
  stands, who ran it again, and why it failed. The person stops a turn while it is active and runs
  it again once nothing but who may direct its agent keeps it from running again, when they may
  use that agent, by core's `Turn.directRequirement`. They follow a turn's log, which opens with
  its items and then grows as the turn writes it, until the turn ends, or until they hide it or
  it could not be followed, which says why and offers to follow it again; one log at a time. Its
  view is a section titled Turns, a list of entries: each the agent's initials, name, and a badge
  that says how the turn stands (queued and stopped are neutral, running and stopping cautious,
  completed a success, failed a danger), with who ran it again and "Sending…" after it, then why it
  failed, the buttons Stop, Run again, and Show log or Hide log, and, while the log is shown, the log
  as a list with where following it stands under it. A thread with no turns shows only why they could
  not be read. The thread embeds it.
- `feature/threads`: a group's threads, each with its opening message, its task, whether it is still
  being started, and how much is new, and a composer to start one. It reports the thread picked. It
  has two views, which take the group's members, its name, and the thread open in it from their
  parent. `view`, its canonical one, lists the threads as messages: each the opening's author, by
  initials and name ("Someone" until the members are read, and "A thread" when the opening is not read
  yet), their time, and the thread's title or its opening as the text that opens it, with "Sending…"
  while it is being started, how much is new, and where its task stands; the thread open is the
  current row. `composerView` is the composer to start one, for the pane's footer, whose box
  shows "Message" and the group's name until the person writes.
- `feature/group`: a group as the person has it open: its name, their part in it, its threads, and
  the thread open among them, a keyed occurrence, so opening another makes a fresh one and a late
  result cannot land in the wrong one, and its settings in a modal. It opens with a thread already
  open when its parent gives one. They follow a group or stop, join a public team, and, in its
  settings, rename a team, leave one, and, where they manage its members, admit and remove them. It
  has two views. `view`, its canonical one, is the group's main pane, titled by its name with Follow
  or Join, where they apply, and a gear that opens the settings as the header's buttons, and its
  threads, with the composer to start one in the footer, which a team the person has not joined does
  not have. The settings' dialog is a child of the Block, bound from `@foldkit/ui/dialog` and
  rendered with the design's `modal` inside the pane, titled "Group settings" with the group's name
  beside it. Its General tab holds the team's name, a field with a line under it saying who sees the
  name, and Save changes, which is disabled while the draft is the name the team has, for someone
  who may rename the team, its draft starting from the name as the dialog opens, and plain text for
  everyone else; the team's visibility in words, which nothing changes yet; and the person's
  membership, with Leave for a team they belong to, except general, and Join for a public team they do not. Its
  Members tab, for a team only, lists the members, each marked Online while they have the workspace
  open, with Remove and the form to admit another where the person manages them, and counts them in
  the tab. The dialog opens on General, and closing it, by Cancel, Close, Escape, a click on the
  scrim, Save changes, or Leave, drops the draft of the name and the member chosen to admit.
  `threadView` is the thread open in it as a side pane, titled by the
  thread, with a button that closes it, Close, and, below 48rem where the pane is full screen over
  the main pane, Back before the title, both sending `ClickedAllThreads`, the thread's messages, and
  the reply composer in the footer, and nothing while none is open. The page embeds the Block twice, `view` in the shell's main pane
  and `threadView` in its side pane. The main pane embeds the threads Block twice and the side pane
  the thread Block twice, once for its content and once for its composer, each in a slot of its own.
- `feature/groups`: the groups the person can see, as the sidebar's sections: the teams they belong
  to by name, their conversations by the other members in them, then the public teams they may join,
  to pick one from; and where they start a team, or a conversation with another member, in a modal
  over the page: a dialog the Block binds from `@foldkit/ui/dialog` and renders with the design's
  `modal`, a team by its name and whether anyone in the workspace can join, with the name field taking
  the focus as the dialog opens, and a conversation by the member and the first message, with the
  member choice taking it. Cancel, Close, Escape, a click on the scrim, and submitting each close the
  dialog, which drops what was being started. A group still on its way shows "Sending…" at the end
  of its row. It reports the group picked, and its parent tells it which group is open, so the one
  marked is the one shown. Its view takes the title of the thread open in that group, from its
  parent, which it shows under the group.
- `feature/inbox`: the notifications waiting for the person, newest first, each as the message it is
  about: who wrote the message its activity is about, with its text, and the thread it comes from, by
  its title or opening message, in its group, as far as the store holds them. Their text opens a
  notification's thread, and they mark one seen, or every one up to the newest that waits. It reports
  the thread opened, and offers a count of what waits for its parent to show.
- `feature/settings`: the workspace's name and the person's own, each renamed in place from the name
  seen, one at a time; the workspace's members with their roles, where, for each member the
  delegation rule, by core's `Delegation.recipientDenial`, lets them act on, they change the role
  to Member, or to Administrator when they own the workspace, replacing the roles they saw the
  member hold, and remove the member, and, when they own the workspace, hand it to another person,
  from the owner's assignment they saw; and the invitations still waiting, which they revoke, with a
  form to invite someone by email with a role, valid for seven days, where they manage
  invitations. A control shows only when their grants allow it, and what is on its way is marked as
  sending. Its view is the settings pane, one column of sections titled Workspace name, Your name,
  Members, and, where they manage invitations, Invitations. A name shows as a row of the name and
  what it is for with the button to change it, or, while the person changes it, as a form of its
  field, whose label is the section's title and not shown again, with Save and Cancel; a section
  whose name is on its way says "Sending…" after its title.
  Each member is an entry of their initials and name, with the role they hold as a badge, or, where
  the person may change it, as a select named "Role of" and the member's name, "Sending…" while
  they or their role is on its way, and under them Remove and Make owner, where the person may use
  them. Each invitation waiting is an entry of the address's first letter and the address, the
  role's name as a badge, "until" and the day it ends, and Revoke until it is on its way; with none
  waiting, the section says so. The invite form's email field does not take focus, since the form is there as the page opens.
  It reports nothing: the workspace page reads the workspace's name from it, so a rename shows in the
  page's sidebar and home pane.
- `feature/connections`: the workspace's connections, each by its name with its integration and how
  ready it is, as the store holds it, marked as sending while a change to it is on its way. The
  host's integrations are listed by the workspace page, once, which informs the Block of them or of
  why they could not be reached; the person then asks again, and the Block asks the page, by its out
  message `RequestedIntegrations`. Where they may manage a connection, they rename it, change its
  settings by the form its integration gives, replace its key, check it with its system, which says
  whether it answers and accepts the key, and remove it; where they may create connections, they add
  one to an integration, choosing a name, how it authenticates, a key when it takes one, and its
  settings. Renaming, changing the settings, and removing are actions written to the store; adding a
  connection, replacing a key, and checking go over HTTP, since a key never enters an action. A form
  about a connection that is gone closes. `connectionsGiving` names the connections whose
  integration gives a capability, from the connections and integrations a Model keeps, for the
  agents and channels features to choose among.
- `feature/agents`: the workspace's agents, each by its membership's name with how ready it is and
  what it runs on, its model on which connection, its harness, and its sandbox, as the store holds
  them, marked as sending while a change to it is on its way; an agent still on its way shows no
  readiness, since the server tells it once it has the agent. Where they may configure an agent,
  they rename it, from the name they saw, and change how it is set up; where they may create agents,
  they add one with a name, a role they may give, instructions, a harness, `Auto` or a connection
  that gives harnesses, a model connection, a model from what that connection offers, an effort, and
  a sandbox, none or a connection that gives sandboxes. The host's integrations, which say what each
  connection gives, are listed by the workspace page, once, which informs the Block of them or of
  why they could not be reached; the person then asks again, and the Block asks the page, by its out
  message `RequestedIntegrations`. Choosing a model connection lists its models over HTTP, and an
  answer for another connection than the one chosen is passed over. Adding, renaming, and setting up again
  are actions written to the store; `agentSetup.ts` makes the configuration of a draft, or says what
  it still wants. A form about an agent that is gone closes. An agent's role and its removal are its
  membership's, in the settings.
- `feature/channels`: the workspace's channels, each by its name with the connection that receives
  its conversations and the group they open in, whether they open as tasks, and marked as sending
  while a change to it is on its way. Where they may manage a channel, they send its conversations
  to come to another group, one they belong to, and remove it; where they may create channels, they
  add one over a connection that gives channels, into a group they belong to, with a name and
  whether its conversations open as tasks, and a channel that lacks any of them is refused, with
  why, before it is written. Adding, moving, and removing are actions written to the store. The
  Block reads the connections and groups itself, a team belonged to by the admissions the person
  holds and a conversation by its members, and is informed by the workspace page of the host's
  integrations, or of why they could not be reached, to know which connections give channels, by
  the connections feature's `connectionsGiving`; the person then asks again, and the Block asks the
  page, by its out message `RequestedIntegrations`. A form about a channel that is gone closes.
- `feature/actions`: the person's actions the server has not finished, each with why it was
  refused, until they dismiss it, shown as toasts over the shell's corner.
- `page/signIn`: signing in, a step at a time: an email to send a code to, then the code, from
  which the person can change the email or ask for a new code to the same address; it keeps the
  session a right code gives, and reports it.
- `page/workspaces`: the workspaces the person belongs to, listed over HTTP, each with how many
  members it has and the name the person goes by in it; it reports the one picked.
- `page/workspace`: a workspace the person opened, as their member of it, on the design's shell. The
  rail has "Home", "Connections", "Agents", and "Channels" buttons and, below them, "Settings", each
  marked while its destination is open; Home is open while nothing, the inbox, or a group is. The
  sidebar, named by the workspace, has the workspace's name over a button to all workspaces, an
  "Inbox" item with how many notifications wait, the groups' sections, and, in its footer, who is
  signed in with a Sign out button. The main pane shows one destination: nothing yet, titled by the
  workspace, the inbox, the connections, the agents, the settings, or the channels, which are always
  read, or the open group, a keyed occurrence; the side pane shows the thread open in that group,
  only while one is, and the actions' toasts come over both. The workspace's name in the sidebar and
  the home pane is the settings' once they hold the workspace, so it follows a rename, and the one
  the workspace was opened with until then. The page's view takes the account's email as a view input. Picking a group opens it; Home or any other destination leaves no group
  marked in the list; opening a notification's thread opens its group with the thread already open,
  and marks the group. Below 64rem the sidebar is a drawer, and below 48rem the rail with it, which
  the shell's Menu button opens: the page's model keeps `isMenuOpen`, a "Close menu" scrim over the
  rest of the window closes it, and every navigation, the rail's, the sidebar's Inbox, a group picked,
  and a notification's thread opened, closes it too (a `closeMenu` step among theirs). The drawer is
  moved by CSS from that flag; it does not yet trap focus, make the rest of the window inert, or
  close on Escape, which come in a later step. Opening the workspace lists the host's integrations
  once, over HTTP, and informs its connections, agents, and channels of them, or of why they could
  not be reached; it lists them again when one of the three asks. It reports when the person leaves
  it and when they ask to sign out.
- The root, `composition.ts` with `model.ts`, `message.ts`, `init.ts`, `update.ts`, and `view.ts`:
  the page the person is on, signed out at the form or signed in with their account, workspaces, and
  the one open. Signing in lists the workspaces; signing out, from the workspace list or from the
  open workspace's sidebar, which asks the root, is one step in `composition.ts`, and its command,
  `command.ts`, forgets the session, the person's stores, and their sync identity first, so it works
  offline, then removes the browser's sync key and ends the session as far as the host can be reached.
  `entry.ts` assembles the application over `services.ts`, which supplies the stores, the session,
  and the browser's services beneath them.

A Block's commands and subscriptions reach the store through `store/Stores.ts`, an ordinary service:
it opens the person's store of a workspace on the first read or write, shares it among all of them,
and closes it a while after the last one lets go. The session, `session.ts`, is a service too: the
sign-in command keeps it, and no model carries the token. What no replica holds goes over HTTP from
the Block that needs it, `api.ts`: listing workspaces, saying the person types in a thread,
following a turn's log, which its Block's subscription reads while the log is followed, and listing
the host's integrations, which the workspace page does once for the connections, the agents, and the
channels, adding a connection, replacing its key, checking it, and listing the models a connection
offers an agent.

`settingsForm.ts`, an integration's settings form as the person fills it in, is the connections
feature's, and `agentSetup.ts`, an agent's setup as the person fills it in, is the agents feature's.
`memberChoice.ts`, the choice of a workspace member over the design's select, is the groups'
conversation form's, the group's admit form's, and the task's assignee, each saying what its empty
choice is.

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
  could not be; a thread started from the composer and the thread picked; a composer filling in its
  draft only while nothing was written, keeping what is written, and sending it once; a group
  opening its settings on General, with the draft of the team's name started only for someone who
  may rename it, renamed from the name seen, writing nothing when the name is unchanged, and closing
  its settings, which drop their drafts, whichever way they close; followed, left from its settings,
  or joined, a member admitted and an admission removed,
  and the thread picked opened and closed, or open already as the group opens; the groups starting a
  team or a conversation in a dialog it opens on a blank form and closes when the form is submitted
  or the dialog closes, dropping what was being started, and reporting the group picked once; the inbox
  listing what waits, newest
  first, reporting the thread of the notification opened, marking one seen or all through the newest
  that waits, and why a write could not be kept; the connections keeping the integrations the page
  informs them of or why they could not be listed, asking the page to list them again, adding a connection over
  HTTP once its integration, name, required settings, and key are in, once while it sends, and
  refused with why, renaming, changing the settings of, and removing one as actions from what was
  seen, replacing a key and checking over HTTP, closing a form about a connection that is gone,
  naming the connections whose integration gives a capability, and why a read or a write could not
  be kept; the agents keeping the integrations the page informs them of or why they could not be
  listed, asking the page to list them again, adding an agent as an action
  with the configuration its draft makes and refusing a draft with what it still wants, loading the
  models of the model connection the form chooses over HTTP and passing over a late answer for
  another connection, choosing the model again when the connection changes, renaming and setting up
  an agent again from what was seen, closing a form about an agent that is gone, offering the roles
  the person may give, and why a read or a write could not be kept; the channels keeping the
  integrations the page informs them of or why they could not be listed, asking the page to list
  them again, adding a channel as an action once its connection, group, and
  name are chosen and refusing one that lacks any, with why, offering only the connections that give
  channels and the groups the person belongs to, by name, moving a channel's conversations to
  another group of theirs and removing it, closing a form about a channel that is gone, and why a
  read or a write could not be kept; the settings renaming the workspace from the name seen and the
  person, one name at a time, changing a member's role from the assignments seen, removing a member,
  handing the workspace over from the owner's assignment seen, inviting by email with the role
  chosen, revoking an invitation, and what an owner, an administrator, and a member may do to the
  members; a workspace listing the integrations once as it opens, informing its connections, agents,
  and channels of them or of why they could not be listed, and listing them again when one asks,
  opening the group picked, showing
  the inbox, the connections, the agents, the settings, or the channels in its place with no group
  marked, going home from a group or a destination, handing the settings and the channels what the
  person does in them, opening a notification's thread in its group, naming the thread open in the
  group open, opening the navigation drawer and closing it by every navigation, and asking the root
  to sign out; and the root signing in a step at a time, listing the
  workspaces, opening and closing one, and signing out, from the list or from the open workspace.
- Scene tests drive a Block's view as a person does: a thread's messages by their authors' initials
  and names and their times, the opening first, how many replies follow it, a reply on its way, an
  edited one, who types, a reply written and sent, the title renamed from its form, and a message
  edited from its form and deleted by the person who wrote it; a group's threads as messages by the
  author of their opening, their time, how much is new and where their task stands, the one open
  marked as current, the thread picked reported, why they could not be read, and a thread started
  from the composer, whose box is named for the group; a task changed by someone who may, read as
  rows by someone who may not, and made by someone who may create tasks; a thread's turns by their
  agents' names and initials and the badges of how they stand, stopped and run again by someone who
  may use the agent and not otherwise, a turn's log followed as it is written, until the turn ends
  or it could not be followed, and the thread listing its agents' turns; a group's main pane, titled by its name or by
  a conversation's other member, with the person's part in it and the gear to its settings, and
  joining in place of the threads of a team they do not belong to,
  with the composer to start a thread in its footer; its settings in a dialog named for them, in a
  team's name beside the title, with General and Members as tabs, the name a field for someone who
  may rename the team, saved only once it differs, and text for everyone else, the visibility and
  the membership in words, with leaving, closing the dialog, and joining, which keeps it open, and a conversation's with neither tabs nor
  visibility; its members, those present marked
  Online and one on its way marked sending, with removing for the others, admitting, offered only to
  someone who manages them; and its side pane for the thread open in it,
  with the composer to reply in its footer, closed by its Close button or its Back, which send the
  same message; the groups listed in the
  sidebar's sections apart from the teams to join, a conversation by its other member, one still on
  its way marked "Sending…" at the end of its row, with the thread open under the group picked, and a new team taken in a dialog named for it, with the name
  field holding the focus, made public by its switch, and closed by Cancel, by its Close button, or
  once written, only from someone who may create one, a conversation started with the member chosen in
  a dialog of its own, and the same team taken from the workspace's sidebar; the inbox's notifications by their author, the
  thread and group they come from, and the message they are about, with the thread alone while the
  group is unknown and the activity alone while the thread is, marked all seen, one seen with its
  failure shown, and one's thread opened by its text, and an empty inbox saying it is all caught up;
  the connections added by an owner
  to an integration, with a key field only for the method that takes one, then checked, with their
  settings shown, their key replaced, renamed with a failure shown, and removed; read by an ordinary
  member without the controls until the person is given the role that manages them, marked as
  sending with none while a change is on its way, by how ready each is, with why the integrations
  could not be listed and a way to ask again, and why they could not be read; the agents added by an
  owner with a harness, a model connection whose models load, a model, an effort, and a sandbox, or
  a model the connection does not list by its id, refused with why until the connection and the
  model are chosen, with the reason a connection's models could not be listed, renamed and set up
  again with a failure shown, read by how ready each is and what it runs on, by an ordinary member
  without the controls until the person is given the role that manages them, marked as sending with
  none while a change is on its way, offering to add only once the host listed its integrations and
  a connection gives models, and why they could not be read; the settings' two names renamed, the
  members listed with their roles as badges, or as a select to change for the members the person may
  act on, changed, removed, and handed the workspace by the owner, the invitations listed by their
  address, role, and end, revoked, and sent, what is on its way marked in each section, a name
  left as it was when renaming is cancelled, a member offered only their own name to change, and the
  store's changes and failure to read shown; the channels listed with their
  connection and group, a conversation's group by the others in it, added by an owner over a
  connection that gives channels into a group they belong to, refused with why when one is lacking,
  moved and removed with a failure shown, read by an ordinary member without the controls until the
  person is given the role that manages them, marked as sending with none while a change is on its
  way, with why the integrations could not be listed and a way to ask again, and why they could not
  be read; and a workspace on the shell: counting what waits beside "Inbox" whichever destination
  shows, then showing the inbox, the connections, the agents, the settings, or the channels, which
  it reads whichever destination shows, each in a main pane named for it, with the rail marking the
  destination open, Home from the inbox and the groups too, the sidebar naming the workspace with
  who is signed in and the way out in its footer, the group's threads as messages in the main pane
  with the composer to start one, the thread picked opened in the side pane with its messages and the
  composer to reply, marked in the list and under the group in the sidebar, the group's settings
  opened in a dialog from its main pane, the Menu button opening the drawer and its scrim, or a
  link of the sidebar or the rail, a group picked among them, closing it, and what the server
  refused as toasts, and the connections listing the integrations again after the host could not be
  reached. The root's own scenes show
  the open workspace with no header of its own, signing out from its sidebar. A scene opens and closes
  a dialog by resolving its commands and mount, `Dialog.test.ShowDialog`, `Dialog.test.AcquireResources`,
  and `Dialog.test.CloseDialog` from `@foldkit/ui`, and a story sends the dialog's own message through
  its Binding's `embedView`.
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
  and its move shows at once; and the settings' reads, as the settings Block reads them together,
  give the owner the workspace with its members, roles, assignments, and invitations, and the grant
  to rename it. `Store.viewTurns` is
  tested apart: which turns may run again, and `settingsForm.ts`: the fields an integration's form
  gives, a draft from its defaults or a connection's settings, and the settings a draft makes, and
  `agentSetup.ts`: an agent's draft, and the configuration a draft makes. `Drafts`' tests keep a
  draft for each place, the last one written, through being closed and opened again.

`bun run --filter @amends-dev/app-v2 build` bundles the app, which CI builds too.
