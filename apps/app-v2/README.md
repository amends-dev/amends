# @amends-dev/app-v2

The workspace app, being built on [Foldkit](https://foldkit.dev) Blocks: a browser app that signs
people in over the [HTTP API](../../packages/http/README.md) and keeps each workspace they open in
sync through [`@amends-dev/sync`](../../packages/sync/README.md), so it reads, and will write,
offline. It signs in, lists the person's workspaces and the invitations waiting for them, creates a workspace, joins one an invitation offers, or opens one: the groups they can see, to
pick one or to browse, those they belong to and those they may join; a group's threads with who replied to each and how much of it is new, where they start a thread, and its tasks, the threads that track one, as a table to narrow by status and by search, where they start a task; and a thread's
messages, where they reply, rename the thread, edit or delete their own messages, and follow or
stop following it, which opening reads through its latest activity; their inbox, their
notifications under the days they came, all of them or only those waiting, each by who wrote what it
is about, what they did, where it comes from, and how long ago, to open its thread beside the inbox,
which marks it seen, or to mark all of them seen at once; the tasks they can see across their groups, those waiting in triage and every
open one, as a table to narrow by assignee, by status, and by search, each to open in its group; and a
search for anything in the workspace, groups, threads, and people, from the sidebar or from the keyboard;
the workspace's settings, its name and their own, its members and their roles,
and its invitations; the workspace's connections to the integrations the host installs, each with a
page of its own, to add, check, rename, set up, replace the key of, and remove; its agents, each with how ready it is and what it runs on, and a
page of its own, to add, rename, set up again, and remove; and its channels, which bring in conversations from them, to add,
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
the fix belongs upstream in `packages/foldkit/src/block/keyedBinding.ts`, and that part of the patch
goes when a build carries it.

The patch also limits the check of a Block's handler contracts to the Block's own `EffectsLayer`.
In the canary, `assembleBlock` checks them against the complete layer, which carries every
descendant's, so each descendant is checked again at every Block above it, and with enough Blocks
bound under the workspace page TypeScript stops at 5,000,000 type instantiations in one expression
(TS2589). A descendant's contracts were checked when it was assembled, and a placement prefixes the
keys of its subtree's handlers, so those of different subtrees stay apart: a handler a Block's layer
leaves out is still reported at that Block. The patch adds `LocalBlockLayer` to
`dist/block/requirements.d.ts`, which reads the layer a completed Block keeps as
`LocalEffectsLayerTypeId` and stands in for `BlockLayer` in `LocalHandlerContracts`, and that member
to `ImplementationForValidation` in `dist/block/definition.d.ts`. The fix belongs upstream in
`packages/foldkit/src/block/requirements.ts`, and this part of the patch goes when a build carries
it.

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
forms, fields, rows, and the modal that creates a workspace or joins one from the design's `centered`, `control`, `form`, `directory`, `pane` (its empty state), `toast`, and `modal` modules.
The brand is the design's `logo`: the header of the centered screens holds it beside "amends", over `centeredAccount`
and a Sign out for who is signed in, and the rail's is a button named "Amends home" that goes Home. The rail ends with
the person's account, the design's `railAccount`, a menu of their Appearance, the way to another workspace, the
workspace's settings, a dialog that changes their name, and Sign out, which `page/workspace` binds. The Appearance,
System, Light, or Dark, is the root's: `src/appearance.ts` shows it as `data-theme` on the page's root element, which the
design's theme follows (System removes the attribute and leaves the browser's preference), and keeps it in the browser's
key-value store under the key `amends/appearance`, so that the next visit starts in it: a script in `index.html`, before
the stylesheet, reads that key and sets `data-theme` for a kept Light or Dark before the page first paints, which the
app's own script comes too late for, and does nothing when nothing was kept, what was kept is not one, or the browser
refuses its storage. A list's search and the choices that narrow it are the design's
`paneToolbar` over its rows, a `searchField` and menus (`choiceMenu`, over Foldkit's `Menu` Block, which the list's
Block binds to hold the menu's state and to fold its choice), where they were a row of selects. What a pane says
when it has nothing to list, or could not read what it lists, is the design's `paneEmpty` with the `stateArt` that
`@amends-dev/ui` draws for the state, in `@amends-dev/ui`'s words: `sew-in` for a first thing to make (no agents,
no workspaces, no groups), `reach` for nothing connected (no connections, no channels), `fill` for a place waiting
for its first thing (a group's Tasks tab, a roster), `caret` for nothing said yet (no activity, a new conversation), `rest` for nothing
left to do (all caught up, nothing to discover, every agent set up, no task to triage or open), `nothing-here` for a search
or filter that finds none, `came-apart` for what could not be read, and `lost-thread` for what is gone or out of reach
(a host that cannot be reached, an agent, connection, or member that is not there). A list read for the first time
shows the design's `loadingRows` under a line, "Loading agents…" or "Loading connections…", and a pane or a page
shows `loadingLine`, "Loading your inbox…", "Loading settings…", "Loading the conversation…", "Loading agent…", and
"Loading connection…"; a destination's first read that failed says why in the place of the list, "Couldn't load
agents", "Couldn't load connections", "Can't load your inbox", with a Try again, as the settings have, that forgets why
and reads again (`ClickedTryAgain`, which raises the Block's `reads`, the dependency that restarts its subscription, and
shows the loading rows or line until the read answers).
A turn's `badge` carries the
logo moving while the turn waits (`thread`), runs (`working`), or stops (`tug`). The open workspace is on the design's shell: `page/workspace` renders `shell`, `rail`, `sidebar`,
and the pane of each destination (`page/workspace/home` renders Home's sidebar, main pane, side pane, and dialogs from its children's views), `feature/groups`, `feature/agents`, and `feature/connections` render the sidebar's sections of their destinations and the modals they open, `feature/groups` the pane where the
groups are browsed, as a table of the design's `directory` rows under its `columns`, and the modal where
a team or a conversation is started, `feature/search` the modal where anything is found, `feature/group` the main pane, the modal of its settings, and the side pane, `feature/actions` the toasts, and every destination's view wraps
its content in its own `pane`. The panes that read or are filled in, the settings, the connections,
the channels, and the side panes, keep the `paneColumn`'s measure; the panes that list, the agents, the group's
threads and tasks, the groups to browse, the inbox, and the tasks' Triage and Tasks, pass it `isWide`,
so that a list spans the pane. Inside the group's panes, the threads, the thread's messages, and the
composers are the design's `message`, `divider`, and `composer`, in a `messageList`, with a person's
initials and when a message was, by its time of day today and by its day before, from `src/seen.ts`,
which also groups what has a time by the day it was (`groupByDay`, under a `divider` each) and says where a
group is: its mark in a list (`groupMark`), as a line says it, `#general` or the others in a conversation
(`placeName`), and as a side pane's subtitle (`threadSubtitle`).

A message's text is markdown as the person wrote it, and a mention in it is a link to the member,
`[@Ada](member:<id>)`, labelled with the name they had when mentioned. Wherever a message's text is
shown, in a thread, in a group's list of threads, and in the inbox, `seen.ts` reads it as runs
(`textRuns`, `messageRuns`, `threadRuns`; core's `ThreadMessage.parts` finds the mentions) and the
design shows each mention as a chip of "@" and the member's current name among the members the view
has, or the name the mention recorded while they are not among them, inline with the words. The
text shows nothing else of its markdown yet: emphasis, links, lists, and code appear as written, with
their marks, and the form that edits a message shows its text as written, mentions too. A title taken
from a thread's opening is its words as a reader hears them, a mention as "@" and the member's
current name (`titleOf`, by `messageWords`), in the pane's header and under the group in the
sidebar. Every write of a message's text, a thread's opening, a reply, an edit, and a conversation's
first message, says whom the message addresses by the mentions in its text (core's
`ThreadMessage.mentionedIn`, each member once).

The person writes a mention in the composer by typing "@" and some letters of a member's name, and
picking the member from a list that opens over the box, which writes the link in their place and a
space after it. Foldkit's builder gives a handler the key pressed and the value of the box, and nothing
gives the caret, so the composer reads the mention being typed at the end of the text, an "@" at its
start or after a space and the letters after it with no space among them, and suggests members for
that alone; a mention typed in the middle of the text is left as typed. A link written there, or by
hand, still addresses its member, since a write reads the text. The textarea that edits a message,
and the one that begins a conversation, are not the composer, and suggest no one.

The task and the turns a thread embeds are the
design's `paneSection`s: the task's status, priority, and assignee are a `fieldGrid` of selects, or
a `detailList` for someone who may not change them, and the turns are an `entryList` of `entry`s,
each its agent's initials and name with a `badge` for how it stands, its buttons in a `buttonRow`,
and its `log`. The inbox has `paneTabs` of All and Unread, which counts those waiting while any wait, under its title, and lists its
notifications as `notification`s in a `messageList`, under a `divider` for each day, each its
author's initials and name and what they did, its place, its text, which opens the thread, how long
ago it came, and a dot while it waits, the row of the notification whose thread is open drawn
current, with Mark all seen among the header's actions, a quiet Show older after the list, in a
centered `buttonRow`, while there are older notifications, and `paneEmpty` when a tab has nothing. The settings' Workspace page is a `paneColumn` of a `form` of the workspace's name, and `paneSection`s
whose `detailList` has the ID with a quiet Copy ID and who made the workspace as a `person`, and whose
Ownership has the owner as a `person`; its Members page, which passes `isWide`, is a toolbar of a search
and a menu of Active or Removed members over the `directory`'s `columns` and `row`s with a 32px mark in a 56px
row, and a member opens in the side pane as
a `person`, a `paneForm` of their role, and `paneSection`s of their access and membership, under `paneBack`. The
invitations waiting after the roster are a `section` over `rowWithButton`s, or on a phone a `section` over one
`row`; the settings' dialogs are `modal`s, the invitations in them an `entryList` of `entry`s with a `badge` each. The
channels are a `paneColumn` of what failed, the list, and the form open among it: the list is an `entryList` of
`entry`s, or a `paneEmpty` that says what adding one does, and the form is a `paneForm` titled as the form is
named, holding the design's fields, selects, switches, and textarea, its failure as a `notice`, and a
`buttonRow` of its submit and a quiet Cancel, which holds "Adding…" in place of the submit while the host
answers. Adding is the secondary button among the header's actions, shown only when the person may, the host's
integrations are listed, and a connection gives what the thing needs; the line that says the integrations are
loading, or that no connection gives channels, is a `hint` in the body, and a failure to list them a `notice`
over a quiet Try again in a `column`. The agents are a list and pages, and their adding and removing a `modal`: each
agent a `row` under `columns` of its lilac mark with
the patch of how it stands, its name, its harness over its sandbox, and its model over its connection, and
an agent's own page a `paneColumn` of a `noticeBox` for why it can't run, the `form` of its name, the `paneForm`
of its setup under a stitch, and a `paneSection` of its `detailList`. The connections are a list and pages the
same way, and their adding, key replacing, and removing a `modal`: each connection a `row` under `columns` of a
drawing of the connections icon on its mark with the patch of how it stands, its name over its integration and
what it gives, and how it authenticates as a cell, and a connection's own page a `paneColumn` of a `noticeBox` for
why it can't be used, a Check `paneSection` whose result is a `noticeBox` in a live region, the `form` of its name,
the `paneForm` of its integration's settings under a stitch, and `paneSection`s of how it authenticates, of its
`detailList`, which links its integration's documentation with `link`, and of its removal; each channel an entry of its name, a badge when it opens tasks, a hint of where its
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

Each `block.ts` exports its completed Block under a name of its own: the assembled value stays
private as `XBlockValue`, `type XBlockType = typeof XBlockValue` takes its type,
`interface XBlock extends XBlockType {}` names that, and `XBlock` is the value, declared as the
interface. The parents that bind the Block, and theirs, then refer to the name, where otherwise each
would work through the whole structure of the Block and of everything it binds again. That keeps
room for the app to grow: TypeScript stops checking one expression at 5,000,000 type instantiations
(TS2589), and the workspace page's `makeUpdate` is the first to reach it, with every Block bound
below it counted at each level above.

- `feature/composer`: what the person writes at a place, a reply in a thread or a new thread in a
  group, kept as a draft in their browser until they send it. It reports what it sends, and that
  its text changed. Its view takes how the box is labelled, what it shows while it is empty, what
  its button says, and the workspace's members, and is the design's `composer`. While the text ends in
  a mention being typed (`tailQuery`), the Block lists up to six of the members whose names contain its
  letters, whatever their case or accents, other than the person and the removed, in the members' order
  (`suggestMembers`), and the view hands the design's list the keys: the arrows move the active
  suggestion around the list (`MovedSuggestion` carries the index the view counted), Enter or Tab picks
  it (`PickedMention` writes `ThreadMessage.mentionText` in place of the "@" and the letters, and a
  space, as typing does: kept as the draft and reported), and Escape dismisses the list
  (`DismissedSuggestions`) until the letters change. A draft read as the place opens opens no list.
- `feature/thread`: a thread as the person reads and takes part in it: its title and messages, their
  part in it, how far they have read, who types there, the task it tracks, its agents' turns, and a
  composer to reply. They rename it, edit and delete their own messages, and follow it or stop;
  reading it marks it read through its latest activity, once for each. The reply composer's changes
  say the person types, at once, then at most as often as typing lasts, by core's
  `Presence.typingRepeats`, and sending says they stopped. It has two views. `view`, its canonical
  one, is the body of a side pane, which takes the time now as its view input, and, optionally, the
  id of a message to highlight (`highlightedMessageId`), which it draws as the current row, so the
  person sees what a notification was about, and the group gives none: Follow or Unfollow and Rename in a row, the form to rename it while
  the person does, the task and the turns, then its messages as a list, the opening first, how many
  replies follow it, and the replies, each by its author's initials, name, and when it was published
  (`whenLabel`: its time of day today, "Yesterday" or the day's name before), with "Sending…" or
  "edited" after it, its text with each mention a chip (`messageRuns`, by the thread's members),
  and Edit and Delete on the person's own, which the form to edit it replaces while they do; and who
  else types, in a live region under them. It shows no title, which
  the pane's header has. `replyView` is the reply composer, for the pane's footer, which suggests the
  workspace's members the thread has read.
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
  completed a success, failed a danger), the logo moving in it while the turn is queued, running, or stopping, with who ran it again and "Sending…" after it, then why it
  failed, the buttons Stop, Run again, and Show log or Hide log, and, while the log is shown, the log
  as a list, once it has items, with where following it stands under it (still opening, nothing
  written yet while it is followed with no items, the turn ended, or why it failed); a log still
  opening shows that alone. A thread with no turns shows only why they could
  not be read. The thread embeds it.
- `feature/threads`: a group's threads, each with its opening message, how many messages follow it and
  who wrote them, when it was last active, its task, whether it is still being started, and how much is new, and a composer to
  start one, which suggests the group's members as it is typed in. It reports the thread picked. It has
  three views, and its tab, Threads or Tasks, Threads at first, says what `view` and `composerView` show.
  `tabsView` is the tabs, a `paneTabs` named Group: Threads, and Tasks, counted by the tasks that are
  neither done nor dismissed while there are any, for the group's header, which takes nothing from its
  parent. The other two take the group's members, its name and whether it is a team, the thread open in
  it, and the time now from their parent. `view`, its canonical one, shows the tab chosen. On the Threads
  tab it lists the
  threads as messages, oldest first by when each thread was created (core's `Thread.createdAt`, the
  moment its opening was published), whatever order the store gives them, under a `divider` for each
  day they were created on by the person's own clock, named as it is from the time now (`dayLabel`):
  each the opening's author, by initials and name ("Someone" until the members are read, and "A thread"
  when the opening is not read yet), when the thread was created (`whenLabel`: its time of day today,
  "Yesterday" or the day's name before), which it says before the opening is read too, and the thread's
  title or its opening, each mention in it a chip (`threadRuns`, by the group's members), as the text
  that opens it, with "Sending…" while it is being started, under it,
  while the thread has replies, a reply line: the initials of those who replied, in the order of their
  first reply, and "1 reply" or "4 replies" (`repliesLabel`), and then how much is new and where its
  task stands; the thread open is the current row. Until the store has answered (`isLoaded`) the tab says "Loading the
  conversation…", and once it has, a group with no thread welcomes the person, "Welcome to #General" for a team and
  "Your conversation with Bob" for a conversation, with "Send the first message to start the conversation." and the
  caret blinking. On the Tasks tab it is the threads that track a
  task as a table, in the order the person chose, latest active first by `lastActiveAt` at first: under a toolbar, the
  threads Block's `toolbarView`, which the group's pane draws over the rows while the tab is open, as `apps/ui`'s
  `GroupTasks` has it, of a search field, whose label is hidden and whose placeholder says "Search tasks…", beside a
  menu of the status (`StatusFilterMenu`), Any status or one by its name (`statusLabel`), named "Status: Any status",
  and a menu of whom a task is assigned to (`AssigneeFilterMenu`), Anyone, Unassigned, then each member still in the
  workspace by name with their mark at 22px, named "Assignee: Anyone", both the ones `taskFilter.ts` gives the
  workspace's Triage and Tasks, whose buttons say Status and Assignee while they narrow to nothing, Unassigned for the
  tasks of no one, and the member's name for theirs, and, at its end, a menu of the order (`TaskSortMenu`), Latest activity, Newest, or Oldest,
  named "Sort: Latest activity", the last two by when the thread was created, and New task, which moves the focus to the composer in the
  footer (`ClickedNewTask`, the command `FocusComposer`). Each menu is a Foldkit `Menu` Block the Block binds
  (`StatusBinding`, `AssigneeBinding`, `SortBinding`, with the ids `group-tasks-status`, `group-tasks-assignee`, and
  `group-tasks-sort`), and choosing from it changes only the Block's own model (`taskFilter`, `taskSort`), so the Block
  has no message for the choice. A line says "Threads that track a task." with how many
  tasks the search, the status, and the assignee leave at its end, "12 tasks", over the labels of the columns, Task,
  Status, and Activity, and a row for each task: the initials of its assignee, or a dash for no one, the
  thread's title or its opening's words (`threadWords`), "Started by Alice · 3 replies" under it, with
  "Sending…" while the thread is being started, a badge of the status, a success for done and a caution
  for held, how long ago the thread was last written in (`ageLabel`), and "Open →", the row opening the
  thread as a row of the list does; the table is `taskTable.ts`'s, which `feature/tasks` draws too. The
  search finds the letters in the thread's title or in its
  opening's words, whatever their case and accents (`threadContains`); a mention in it is the member's current name. With
  no task the tab says "No tasks yet" and to start one from the composer, and with a search or a
  status that leaves none, "No tasks match", each with its art. `composerView` is the composer to start one, for the
  pane's footer, whose box shows "Message" and the group's name until the person writes. On the Tasks
  tab it starts a thread that tracks a task, in triage: its box is named New task, shows "New task in"
  and the group's name, with a `#` before a team's, and its button says Create task. The draft is the
  same on both tabs.
- `feature/group`: a group as the person has it open: its name, their part in it, its threads, and
  the thread open among them, a keyed occurrence, so opening another makes a fresh one and a late
  result cannot land in the wrong one, and its settings in a modal. It opens with a thread already
  open when its parent gives one, and reports nothing for it. It reports `OpenedThread` when the
  person picks a thread and `ClosedThread` when they close it, by Close or Back, so its parent can
  hold the side pane in step; its parent closes the thread with the operation `requestCloseThread`,
  which reports nothing, since it asked. They follow a group or stop, join a public team, and, in its
  settings, rename a team, leave one, and, where they manage its members, admit and remove them. It
  has two views. `view`, its canonical one, is the group's main pane, titled by its name, under the
  tabs of the threads Block, Threads and Tasks, which a team the person has not joined does not have,
  with, as the header's buttons, its members as a cluster of their marks named for how many there are
  ("7 members", for a team its admitted ones and for a conversation both people), which opens the
  settings on the Members tab, or on General for a conversation, which has none; Follow as a bell,
  which is filled, named Unfollow, and pressed while the person follows the group, or Join, where
  they apply; and a gear that opens the settings; and under them, on the Tasks tab, the toolbar of the tasks, and the
  tab's content, threads or tasks, with the composer to start one in the footer, which a team the person has not joined does
  not have. The settings' dialog is a child of the Block, bound from `@foldkit/ui/dialog` and
  rendered with the design's `modal` inside the pane, titled "Group settings" with the group's name
  beside it. Its General tab holds the team's name, a field with a line under it saying who sees the
  name, and Save changes, which is disabled while the draft is the name the team has, for someone
  who may rename the team, its draft starting from the name as the dialog opens, and plain text for
  everyone else; the team's visibility in words, which nothing changes yet; and the person's
  membership, with Leave for a team they belong to, except general, and Join for a public team they do not. Its
  Members tab, for a team only, lists the members, each marked Online while they have the workspace
  open, with Remove and the form to admit another where the person manages them, and counts them in
  the tab. The dialog opens on General, and closing it, by Cancel on General or Done on Members and in a conversation,
  as `apps/ui` words them, Close, Escape, a click on the scrim, Save changes, or Leave, drops the draft of the name and
  the member chosen to admit.
  `threadView` is the thread open in it as a side pane, titled by the
  thread with "Thread in #Design" or "Thread in Bob" under it (`threadSubtitle`), with a button that closes it, Close, and, below 48rem where the pane is full screen over
  the main pane, Back before the title, both sending `ClickedAllThreads`, the thread's messages, and
  the reply composer in the footer, and nothing while none is open. The page embeds the Block twice, `view` in the shell's main pane
  and `threadView` in its side pane, giving both the time now, which they give on to the threads Block
  and the thread Block. The main pane embeds the threads Block three times, for the tabs in its header, for
  its content, and for its composer, and the side pane the thread Block twice, once for its content and once for its
  composer, each in a slot of its own.
- Every dialog's footer follows `apps/ui`'s `Modal.Actions`, through the design's `modal`: a Cancel or Close and the
  primary action together at the end, for a team, a conversation, the settings' dialogs, the workspaces', and the
  group's General section; the Cancel at the start of the footer and the primary action alone at its end for adding
  an agent, removing one, replacing a connection's key, and removing a connection; Back at the start and the primary
  action at the end for the connection's form; and Invite people at the start and Done at the end for the
  invitations' history.
- `feature/groups`: the groups the person can see, as the sidebar's sections: the teams they belong
  to by name, their conversations by the other members in them, then the public teams they may join,
  to pick one from; and where they start a team, or a conversation with another member, in a modal
  over the page: a dialog the Block binds from `@foldkit/ui/dialog` and renders with the design's
  `modal`, a team by its name and whether anyone in the workspace can join, with the name field taking
  the focus as the dialog opens, and a conversation by the member and the first message, with the
  member choice taking it, or the first message when the member is already chosen. Cancel, Close, Escape, a click on the scrim, and submitting each close the
  dialog, which drops what was being started. A group still on its way shows "Sending…" at the end
  of its row. It reports the group picked, and its parent tells it which group is open, so the one
  marked is the one shown. Its view takes the title of the thread open in that group, from its
  parent, which it shows under the group. The Groups section's header has a button, Browse groups,
  which reports `RequestedBrowse`, shown to everyone, and so does the title, Groups, which is a
  button too and is current while the page it opens shows (the view input `isBrowsing`). `browseView` is the page it asks for, a main
  pane titled Groups with two tabs, Your groups, the teams the person belongs to and their
  conversations, as the sidebar lists them, and Discover, the public teams they may join and do not
  belong to, each counted, Your groups at first, and Create group, the same as the sidebar's "+" for
  a team, where they may start one. The toolbar over the rows holds a search field, whose label is hidden and whose
  placeholder follows the tab, and which takes no focus as the page opens; under it, a line says what the tab
  lists with how many groups the search leaves at its end, "4 groups", over the labels of the
  columns, Group, Visibility, and Members; and then a row for each group: `#` for a team and the other
  members' initials for a conversation, the group's name as the person reads it, a badge of Public,
  Private, or Direct, how many members it has, "12 members", "Sending…" under the name while it is
  on its way, and Open →, which reports the group picked as the sidebar's row does. The search
  keeps the groups whose name contains what was typed, in any case, ignoring spaces at either end;
  the tabs keep one search between them. A search that finds none says "No groups match" with what was
  typed, and a tab with no groups says so: Discover, "Nothing to discover", since every public team is
  one the person is in, and Your groups, "No groups yet". The dialog for a new team or a conversation
  is `dialogView`, a view of its own that renders only that dialog, with nothing in it while it is
  closed, and neither the sidebar's view nor the browse page holds it: below 64rem the sidebar is on
  the page only while the navigation drawer is open, and a dialog the framework shows has to be in the
  document. The page lends it to the shell's `dialogs`, so the sidebar's "+" and Create group open it
  at every width. Its parent can ask for a conversation with a member (`requestConversationWith`,
  `RequestedConversationWith`): the Block selects the conversation the person already has with just
  that member, and, when there is none, opens the dialog for a conversation with the member chosen.
- `feature/search`: finding anything in the workspace, groups, threads, and people, in a modal named
  Find anything, which the Block binds from `@foldkit/ui/dialog` and renders with the design's
  `modal`, wide, over a search field of type search whose label is hidden and which takes the focus as
  the dialog opens, with its parent asking it to open (`requestOpen`) on an empty field. What is typed
  is searched for with the store's `search` once it holds more than spaces, a search for each
  keystroke, and an answer for a query that is no longer the one typed is dropped. The rows of the
  last answer stay while the next is on its way, so the list does not flicker. They are listed under
  Groups, Threads, and People, each only when it has something: a group by `#` for a team or the other
  members' initials for a conversation, and its name; a thread by the words it opened with and a badge
  of its group; a person by their initials and name. Nothing typed says "Type to search."; nothing
  found, `Nothing found for "zzz".`, with the query trimmed; a search that failed, why. The first row is
  active; the arrow keys walk the rows, around the list, and keep the active one in view
  (`ScrollToResult`), Enter opens the active one, and a click opens the one clicked. The active row
  is marked with `aria-current` and named as the field's `aria-activedescendant`. A key with
  Shift, Control, Alt, or Meta held is left to the browser, as are the keys it does not answer. The
  Block reports what was opened, a group (`OpenedGroup`), a thread in its group (`OpenedThread`), or a
  person (`OpenedPerson`), and closes its dialog, which, however it closes, forgets what was typed and
  found. It does not act on a person itself: its parent decides what opening a person is.
- `feature/inbox`: the person's notifications, newest first, on two tabs: All, every notification
  the store gives, waiting or seen, and Unread, those still waiting, counted while any wait, All at first. Each
  tab's notifications sit under a divider for each day they came on by the person's own clock, named
  as it is from the time now (`dayLabel`), and each is a row of its own: who wrote the message its
  activity is about, by their name and initials, and what they did, which is why the person is told
  (`notificationReason`): the message mentions them ("mentioned you"), it opens the thread ("started
  a thread"), or it replies ("replied"); where it comes from, a team as `#` and its name, a
  conversation as the others in it and "Direct message", and "Unavailable thread" while the store
  lacks the thread, with no place while it lacks the thread's group; what the message says, each
  mention in it a chip (`notificationText`, by the inbox's members); and how long ago it came (`ageLabel`), with a dot while it waits. While the store lacks the message, the
  first line says "Activity in a thread" under the mark "?", and the text says what it can. The time
  now is its view input, as the page gives it, so the days and ages follow the clock. A notification's
  text opens its thread beside the inbox, which marks it seen at once, if it waits, and selects it:
  the row stays selected, in its place, with `aria-current` and the design's current look, while its
  thread is open, even on Unread, where a seen notification would otherwise leave, and selecting
  another row moves the selection. The selection (`selected`) is the notification, its thread and
  group, the message its activity is about, and the thread Block that shows the thread, bound as a
  keyed occurrence as the group binds its own, so opening another makes a fresh one. There is no way
  to mark one notification seen but to open it; Mark all seen, in the header while any wait, marks
  every one up to the newest that waits and keeps the selection. The Unread count and Mark all seen
  follow what waits alone (`waitingCount`), so the count can be none while the selected row is still
  listed (`shownItems`), and the caught-up state shows only once the thread is closed and nothing
  waits. `threadView` is the thread open as a side pane, as the group's is: titled by the thread,
  "Thread in #General" or "Thread in Bob" under it, or only "Thread" while the store lacks the group
  (`threadSubtitle` in `seen.ts`, which the group's pane uses too), with Close beside the title and, below 48rem, Back before it, both sending
  `ClickedClose`, the thread's messages, with the one the notification is about drawn current, and
  the reply composer in the footer, and nothing while none is selected. It reports `OpenedThread`
  when a thread opens and `ClosedThread` when the person closes it, so its parent can hold the side
  pane in step; its parent closes the thread with the operation `requestCloseThread`, which reports
  nothing, since it asked. The Block offers a count of what waits for its parent to show.
  Until the store has answered (`isLoaded`) the list is a line, "Loading your inbox…", and when the first read failed
  it is "Can't load your inbox" with why, in the place of the list. A tab with nothing says "No activity yet" on
  All, and "You're all caught up" on Unread with a "View all activity" button that chooses All. The store gives every
  notification the person has at once, so the list is paged by the view: the model's `shown` is how
  many of the newest the list shows, `pageSize` (20) at first, and `ClickedShowOlder` adds a page. While
  the tab keeps notifications older than those listed (`hasOlderItems`), Show older, a quiet button,
  centered, follows the list. The tabs keep what is shown, and the notification opened stays listed in
  its place even when newer ones push it past the page.
- `feature/tasks`: the tasks the person can see across their groups, from the store's `tasks`: each
  with its thread, its group's name, how many replies the thread has, and when it was last active,
  and the members and contacts that name who started a thread and who is assigned to it. It is made
  from the workspace as the member, writes nothing, and has two views, each a main pane that takes
  the time now from its parent. `triageView` is titled Triage, "Tasks waiting for a decision.", and
  lists the tasks in triage (`triageTasks`); `tasksView`, the Block's canonical view, is titled Tasks,
  "Every open task you can see.", and lists every task that is neither done nor dismissed (`openTasks`).
  The pane's toolbar has a search field, whose label is hidden and whose placeholder says "Search
  tasks…", beside a menu of whom a task is assigned to (`AssigneeFilterMenu`), Anyone, Unassigned, or a member by name
  and mark, whose button says Assignee while it narrows to none and is named "Assignee: Anyone", and, on Tasks
  alone, a menu of the status (`StatusFilterMenu`), Any status or one of the statuses of an open task, named
  "Status: Any status". Each menu is a Foldkit `Menu` Block the Block binds (`AssigneeBinding`, `StatusBinding`), and
  choosing from it sets the filter, so the Block has no message for the choice. The toolbar goes on with a line that says "Tasks in triage across your groups." or "Open tasks across your groups."
  with how many tasks the filters leave at its end, "12 tasks", over the labels of the columns,
  Task, Group, Status, and Activity, and a row for each, latest active first (`matching`): the same
  row as the group's Tasks tab has (`taskTable.ts`), with the name of the task's group as its first
  cell, "General · To do · Sep 20" described after "Started by Alice · 3 replies", and "Open →". The
  row reports `OpenedThread` with the thread and its group, which its parent opens in that group,
  where the task's controls are. The search finds the letters in the thread's title or in its
  opening's words as the group's Tasks tab does (`threadContains`), and the assignee is anyone, no one,
  or the member the filter names, whoever the Block is made for. The filters are the Block's, one for both views,
  except that Triage leaves out the status (`withAnyStatus`), since it shows no choice of one. With
  no task the pane says "Nothing to triage" or "No open tasks" and that the tasks the person can see
  will be listed there, and with filters that leave none, "No tasks match" and to try different
  ones. `triageCount` is how many tasks wait in triage, for the sidebar to show.
- `feature/settings`: the workspace's settings as `apps/ui` has them, two pages, a member in the side pane, and
  six dialogs, read together from the store. The Workspace page (`view`) is the workspace's name in a form with
  Save changes, which waits for a name that is new and which only the owner may use, the field being disabled with
  "Only the workspace owner can rename it." for another; Details, with the workspace's ID, which the quiet button
  Copy ID, named "Copy workspace ID" as `apps/ui` names it, puts on the browser's clipboard (the `Clipboard` service, which the browser's services provide, so the command
  `CopyWorkspaceId` needs no `navigator`) and the button then says Copied for two seconds, the command
  `ExpireCopied` ending the copy it was started for and no later one, and Created by, the member whose account made
  the workspace; Ownership, with the owner as "{name} · You" when it is the person, "Workspace owner", and that a
  workspace has one owner, and, for the owner, that transferring ownership makes them an administrator and a
  Transfer ownership button, which waits, with "Invite another person before transferring ownership.", while there
  is no one who can become the owner. The person's own name is not on the page: the account menu's "Change your name…"
  opens a dialog for it, below. The Members page (`membersView`, which takes the time now, the
  window's width, and the member the page has open as view inputs) is a toolbar of a search, "Search members…", and a menu of
  Active or Removed members (`choiceMenu`, bound as `MemberStatusBinding`, its button named "Active members" or "Removed members"), over the roster: `columns` for Member, Workspace role, and
  Status, and a `row` for each member, by name, with a 32px mark in a row 56px tall (`markSize: "md"` and `isCompact`),
  their name, "Agent" under an agent's, their role, and their status, the row of the member the page has open drawn
  current. `apps/ui` does not sort its roster, which its fixture lists in no order a name or a role explains, so the
  roster is by name, in any case and whatever the accents, then by ID among those of one name (`shownMembers`). A phone shows the role and status under
  the name. Where the person manages invitations, Invite people is in the page's header, and after the roster are
  the Pending invitations, with how many, each a `rowWithButton` of the address over what it gives and when it ends
  ("Member · Expires in 7 days", the days left rounded up as `apps/ui` rounds them and at least one, so that an
  invitation just made for a week says seven: `expiryLabel`) with a quiet Revoke named for the address, held while the
  invitation is itself on
  its way, or "No invitations are waiting.", and View history; on a phone the invitations are one card, "1 pending
  invitation" over "View and manage invitations", that opens the same history. A row reports `OpenedMember` and
  the member opens in the side pane (`memberView`, "Member details", with Back to Members on phones): who they are,
  "Workspace role" with Save role where the delegation rule, by core's `Delegation.recipientDenial`, lets the
  person act on them, which replaces the roles they saw the member hold with Member, or Administrator when the
  person owns the workspace; Access, the member's assignments with where each reaches and whether it still does,
  or "No access is assigned.", where the person may read them; and Membership, which for a member who left says
  the membership ended and that they can be invited again, and otherwise says that rejoining after removal takes
  a new invitation, with Remove member where the person may remove them. Closing it reports `ClosedMember`.
  What is on its way is marked "Sending…". Until the workspace is read the page says "Loading settings…", and
  "Can't load settings" with Try again when it could not be.

  The six dialogs are one `DialogBlock` the Block binds (`DialogBinding`, id `settings-dialog`) and `dialogView`,
  which the workspace page lends the shell, renders for what the person is doing in it (`Entering`): Invite member,
  the address ("Sign-in email") and the role an invitation gives, with "No email is sent." and a Create invitation
  that sends it, ending seven days from when it is made; Invitations, every invitation newest first, each the
  design's `historyRow` as `apps/ui` draws its history: the address over what it gives and when it ends or was made,
  where it stands in words (Pending, Accepted, Expired, or Revoked, which the state and the clock tell) beside them,
  and a quiet Revoke at the end of each that waits, with Invite people at the start of the footer and Done at its
  end; Revoke invitation?, naming the address; Transfer ownership, choosing the new owner
  among the people who can become it and saying who becomes the only owner; Remove {name}?, saying what they
  lose and that they need a fresh invitation to rejoin; and Change your name (`ChangingName`), a compact dialog of one
  field, "Your name", that starts from the name the person has, takes the focus with its text selected (the
  `SelectOnFocus` mount, `selectOnFocus.ts`), and a Save name that waits for a name that is not blank and not the one
  they have. It opens from the person's account at the foot of the rail, which the Block draws (`accountView`, given the
  address the person signed in with and their Appearance) as a Foldkit `Menu` Block it binds (`AccountBinding`, a menu
  of `AccountEntry`, id `account`): choosing "Change your name…" opens the dialog once the replica holds the person, and
  every other entry is reported as `ChoseAccountEntry`.
  Each says "Creating…", "Revoking…", "Transferring…", or
  "Removing…" while its request is on its way, and closing the dialog then is ignored: it opens again to show how
  the request ends. A request that ends well closes the dialog; one that does not stays open under the failure.
  Revoking from the invitations replaces them in the same dialog, so Cancel and the end of the request close it
  and do not return to them. A failure is worded by `settingsMessage` for the place the action was made, with
  Refresh where `needsRefresh` says that what the person sees is out of date. The Block tells what it can: what
  was entered does not decode (`Invalid`) and the browser could not keep it (`Failed`) come from the commands, and
  the person's grants and the replica, which the Block holds, tell it that they may no longer do it (`Denied`) or
  that what they act on is gone (`Gone`) before anything is sent, and a read that fails is `Outdated`. What the
  server refuses afterward is not the Block's: the store replays it as a rejection, which `feature/actions` shows
  as a toast. It reports the member opened and closed, and what the person did once the store kept it, by name:
  the workspace or the person renamed, a role changed, the workspace handed over, a member removed, an invitation
  created or revoked, which the page confirms in a toast (`settingsToast`). The workspace page reads the
  workspace's name from the Block, so a rename shows in the page's sidebar and in the panes of the connections, the agents, and the settings that name it.

- `feature/connections`: the workspace's connections, as the store holds them, once the store has
  answered (`isLoaded`, which keeps "No connections yet" from showing before, and shows `loadingRows` until it has), marked as sending while a
  change to one is on its way; the members who made them, and what the person may do. The host's
  integrations are listed by the workspace page, once, which informs the Block of them or of why they
  could not be reached; the person then asks again, and the Block asks the page, by its out message
  `RequestedIntegrations`, which Refresh asks too, where what the person sees is out of date. The Block has four
  views. Its `sidebarView`, which the page puts in the sidebar for the Connections, Connection, and Channels
  destinations, has a section for each thing a connection gives, Models, Tools, Sandboxes, and Harnesses, listing
  the connections whose integration gives it, so one that gives two is in both, then a last section, Channels. A
  connection is a row on the connections icon, with its status as a shape at the end of the row, named after the
  status and with it in a tooltip on hover: Needs setup, a caution triangle, with why, when it can't be used, and
  Unavailable, a danger square with a bar, when its integration isn't installed on this host (such a connection
  gives nothing the sidebar can tell, so it is in no section while the list shows it); a connection that is ready
  shows nothing, and so does one still on its way, which says "Sending…". The row of the connection whose page
  is open is current, in every section it is in. Each section has a title that opens the list on its tab, and is
  current while the list shows on it, Browse ("Browse models"), which does the same, and, where the person may
  add a connection and the host listed its integrations, Add ("Add model connection"), which opens the dialog
  narrowed to what the section gives. Channels has the title and Browse, which open the channels and mark the
  title current while they show (the view input `isChannelsOpen`), and no Add. A section with no connections says
  "None yet" only once the connections are read and the integrations are listed. `view` is the list, the
  main content: All, Models, Tools, Sandboxes, Harnesses, and Channels on a tab each, with how many connections
  each holds once the connections and integrations are read (`connectionsOnTab`, a connection being on the tab of
  each thing its integration gives, and on All alone once its integration is not installed), a toolbar with a search that
  narrows the tab by the name of a connection or of its integration in any case and whatever the accents
  (`shownConnections`), the labels of its columns, Connection and Authentication, which a phone leaves out, and a
  row for each: the connections drawing on a mark with the status's patch, the name over the integration and
  what it gives ("Anthropic · Models", or "Integration not installed"), and how it authenticates ("API key", or
  "No authentication"). With none it says "No connections yet", and what a person who may add one can do, with
  the primary Add connection in its body as the header has it; a tab with none says "No sandboxes connections
  yet." and a search that matches none says what it searched for, with Clear search. `connectionView` is a
  connection's page, in one column, for the view inputs `connectionId` and `workspaceName`: a note when its
  integration refuses its setup ("MCP server refuses this setup", with why) or is not installed, which nothing can
  use the connection for, and no Check then; for a person who may manage it, Check, which asks its system over
  HTTP whether it answers and accepts the key and shows what it found in place (Working, Key refused, Settings
  don't work, Couldn't reach it, each with its line, or the integration's own words), and Check again; the
  connection's name with Save name; the settings its integration asks for, as `settingsFields` draws them, with
  what the integration says of each and which are optional, with Save settings, which waits for a change and for
  the settings to be whole, or, once the integration is gone, the settings it saved to read; how it
  authenticates, "API key saved", whose key is never shown, with Replace key where the person may and its
  integration is installed, or "No authentication"; its details, the integration with a link to its
  documentation, what it gives, and who made it and when; and its removal. A person who may not manage the
  connection reads the same values with nothing to check, save, replace, or remove. A connection the workspace
  does not list says "This connection isn't here", and offers the list. `dialogView`, which the page lends the
  shell's `dialogs`, is the one dialog of the Block, which a `DialogBlock` keeps: the integrations to choose among
  ("Add connection", or "Add model connection" from a section, with the workspace's name, a search that takes the
  focus, the `modalList` of each integration with what it gives and how it authenticates, and "No integrations
  available" when the host installs none that does); the form for the integration chosen ("Configure connection",
  with the integration and what it gives, its name, which starts as the integration's, with the hint "A name
  your workspace will recognize.", its settings, how it authenticates, a choice when it has several ways, and the
  masked API key where one is used, with "Stored securely. Once saved, it cannot be viewed or copied.", and Back
  and Create connection); the dialog that replaces a key ("Replace API key", which says the current key stays until
  the new one is saved); and the confirmation that removes a connection ("Remove connection?", which says its saved
  key goes with it, if it has one). Closing the dialog forgets what the person entered, except while a request
  from it is on its way, when it stays open to show how it ends. Renaming, changing the settings, and removing are
  actions written to the store, which show under their forms why this browser could not keep them; adding a
  connection, replacing a key, and checking go over HTTP, since a key never enters an action, and no replica holds
  what a system answers. `failureOf` maps what each of those calls answers into the reasons the Block tells apart:
  that the person may not (`Denied`), that what they name is gone (`Gone`), that the host no longer installs the
  integration (`Uninstalled`), that the integration refuses what it was given, saying why (`Refused`), that the
  connection takes no key (`Changed`), that the host keeps no keys (`StorageUnavailable`), that what they entered
  does not hold (`Invalid`), and, of anything else, including a host that could not be reached, that the call
  failed (`Failed`); `connectionsMessage` words each, for the action under whose form it shows, with Refresh where
  `needsRefresh` says what the person sees is out of date. Adding sends a request key, a new one for each form and
  the same one on every retry of it, so that a retry returns the connection the host first made and not a
  second; a change to the form drops it, and the failure with it. The dialog stays on the connection the host made
  until the store lists it, then closes, checks it, and reports `CreatedConnection`. The Block's other out
  messages are `RequestedBrowse`, for the titles, Browse, and the list's tabs, `OpenedConnection` for a connection
  picked, `RequestedChannels`, `SavedName`, `SavedSettings`, `ReplacedKey`, and `RemovedConnection`; the page shows
  the list, the connection's page, or the channels, and confirms in a toast (`connectionsToast`). A form about a
  connection that is gone closes. `connectionItemsGiving` lists the connections whose integration gives a
  capability, from the connections and integrations a Model keeps, and `connectionsGiving` names them, for the
  agents and channels features to choose among.
- `feature/agents`: the workspace's agents, as the store holds them, once the store has answered
  (`isLoaded`, which keeps "No agents yet" from showing before, and shows `loadingRows` until it has). The Block has four views. Its
  `sidebarView`, which the page puts in the sidebar for the Agents destination, is a section named
  Agents: each agent by its membership's first letter on a lilac mark and its name, with Browse
  (`list`, "Browse agents") and, where the person may create agents and the host listed its integrations,
  "Add agent", whose dialog says beside the model connection when no connection gives models, and the title a button that opens the list and is current while it shows (the view
  input `isListOpen`), an agent's row being current instead while its page shows (`openAgentId`); an agent that needs setup has a caution triangle on its mark, with "Needs
  setup" in a tooltip on hover and after its name for assistive technology, "Atlas, Needs setup"; one that is
  ready shows nothing, and so does one still on its way, which says "Sending…" at its end. The
  Block's list page, `view`, is a pane titled Agents with All and Needs setup tabs, each with how
  many agents it holds, an "Add agent" button that opens the dialog, a toolbar with a search that narrows the tab by name, in any case
  and whatever the accents, and a row for each agent in the design's columns Agent, Harness,
  Model, and Activity: the lilac 32px mark and name, the harness (a connection's name, or "Auto")
  over its sandbox (a connection's name, or "No sandbox"), the model's id over its connection's
  name ("Removed connection" once it is gone), and the activity, which stays blank until turns
  say what an agent is at work on. An agent that needs setup shows what keeps it from running,
  the first reason, in a sentence on its mark. With no agents the list offers adding the first
  ("An administrator can add agents to your workspace." for a person who may not), the Needs setup
  tab says every agent can run, and a search with no match says so and clears from "Clear search".
  The Block reports `RequestedBrowse` when the person browses from the sidebar, and `OpenedAgent`
  with the agent picked, from the sidebar or the list, asking once for the models of the agent's
  connection to show its model and its efforts; the page opens the agent's page for it. That page, `agentView`, with the view inputs `agentId` and
  `workspaceName`, is a pane titled by the agent's name on a 24px lilac mark with the patch of how it
  stands, and, on a phone, the workspace's name under the title. One `paneColumn` holds, in order: where the
  agent can't run, a boxed note, "This agent can't run as it is set up", with a line for each reason; a Name
  form, the field "Agent name" with a secondary "Save name", disabled until the name is changed to one that
  is not blank; a Setup form, under a dashed stitch, of the setup fields with a primary "Save setup", disabled
  until the setup changes, and "Discard changes" beside it while it has; and Details: the role, which is
  changed in Settings › Members, as any member's is, the current activity, "Idle" until turns say what an agent
  is at work on, and who created the agent, with the day. A person who may not configure the agent reads the
  same fields disabled, with no buttons; an agent the workspace does not list says "This agent isn't here" and
  offers "Show all agents", and nothing shows before the agents are read. The Block keeps what the person
  changed on each agent's page (`edits`: a name and a whole setup, each saved apart, from the name the agent
  has and the setup it has), and drops the edits of an agent that is gone. Below Details the page has
  Removal, for a person who may remove members and an agent that is not on its way: "Removing this agent ends
  its membership. Its messages stay in their threads." and a secondary "Remove agent", which asks to confirm.
  Adding and removing happen in a dialog, a `DialogBlock` the Block binds as `dialog` (`DialogBinding`, id
  `agents-dialog`) and its `dialogView` lends the shell, with the view input `workspaceName`, so it is in the
  frame whichever page the buttons that open it are on, the sidebar's, the list's, and the agent's. The
  dialog opens over the page that shows, without leaving it. Where they may create agents, they add one, in
  a `modal` titled "Add agent" with the workspace's name beside it, with an "Agent name" (with "How the
  workspace calls and mentions it.", holding the focus), a role they may start it with, a "Role" select of
  Member and Administrator, the latter listed as unavailable, "Only the owner can give this role", to anyone
  but the owner, instructions, a harness,
  `Auto` or a connection that gives harnesses, a model connection, a model from what that connection offers
  or any model's ID where the connection takes one, an effort, and a sandbox, none or a connection that gives
  sandboxes. "Create agent" waits, disabled, until a name, a role, and a model are chosen. These setup fields
  (`setupFields.ts`) are the same on the agent's page and in the dialog that adds one. The host's integrations, which say what each
  connection gives, are listed by the workspace page, once, which informs the Block of them or of
  why they could not be reached; the person then asks again, and the Block asks the page, by its out
  message `RequestedIntegrations`. Choosing a model connection lists its models over HTTP, kept for each
  connection apart, so that an answer arriving late is the models of the connection it was asked of.
  Adding, renaming, setting up again, and removing are actions written to the store. A request from the
  dialog is on its way until the store keeps it, and an agent being added until the store lists it, which
  the Block tells from the agents it had when the form was sent, by who made it and its name: the fields
  are disabled, the button says "Creating…" or "Removing…", and closing the dialog opens it again to show
  how the request ends, as the workspaces page does. The dialog then closes, and the Block reports
  `CreatedAgent` with the agent, for the page to open, or `RemovedAgent`, for the page to show the list.
  Saving a name or a setup reports `SavedName` or `SavedSetup`. A setup that can't be saved as it is
  sends nothing: `checkSetup` marks each part beside its field, a model connection, harness, or sandbox that
  was removed or no longer gives what the part needs, a model that its connection, which lists only its own,
  does not offer, a harness that works only in a sandbox the setup has none of, and what `agentSetup.ts` finds
  it still wants, a model connection, a model, instructions the store can't keep, or a model ID of 1 to 200
  characters. A save the store could not keep, or a name or setup it refused to decode, is worded under the form
  that made it, the dialog's under its fields: "Use 1 to 80 characters, with no invisible ones.", "Check the
  instructions and model, then save again.", "Check the name, instructions, and model, then try again.", and,
  for the store, "The name couldn't be saved. Try again when the host is available." and its likes, "The agent
  couldn't be removed. Try again when the host is available." among them. The removal asks for no checking of
  its own, and which agents the person may remove it reads from their permission to remove members alone, not
  from the delegation rule the settings apply, which the server still applies. What the server refuses
  afterwards comes back as a rejection, which `feature/actions` shows as a toast, and is not routed back to the
  form. An agent's role is its membership's, in the settings.
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
  refused, until they dismiss it, shown as toasts over the shell's corner; and what the page confirms to the
  person that they did, which a Block reports and the page hands it with `confirm`, such as "Name saved",
  shown in the same stack as a status toast with a Dismiss that goes by itself after five seconds
  (`ExpireConfirmation`), each under an ID of its own (`nextConfirmationId`) so that the time of one the person
  dismissed cannot take another's.
- `page/signIn`, `page/workspaces`, `page/workspace`'s listing of the integrations, and `feature/agents`' listing of a
  connection's models are commands that call the host and end in a message whatever happens to the call: the client
  reports a status its contract does not list as a defect, which a failure handler misses, so each handles the whole
  cause and words it as it words a host that cannot be reached, and a form never stays on "Sending…" or "Checking…".
- `page/signIn`: signing in, a step at a time: an email to send a code to, then the code, from
  which the person can change the email or ask for a new code to the same address; it keeps the
  session a right code gives, and reports it. It starts with an address, which the root gives when it
  has one, and a notice, such as that the session ended, which shows over the email field in the caution tone,
  stays as the address is typed, and goes when the address is sent. The code is the design's `codeInput`, six cells
  over one native input with the hint "Use your most recent code.", which keeps digits only and checks the code
  as soon as the sixth is in (`CompletedCode`), as "Verify code" does (`SubmittedCode`), both through the one check.
- `page/workspaces`: the workspaces the person belongs to, listed over HTTP, each with how many
  members it has and "Owner" when they own it, such as "4 members · Owner"; it reports the one picked. It
  takes the account's email as its init argument, not a view input, since `update` needs it: the model keeps
  `suggestedName`, the part of the address before its "@" with its first letter in capitals
  (`suggestNameFromEmail`, "Dave" for dave@example.com), as the name a person joining is offered. The line under
  the heading counts what the listing holds, "2 workspaces · 2 pending invitations", the workspaces alone when
  none wait, "2 invitations waiting for you." when the person belongs to none, and "Create a workspace to get
  started." when there is nothing, which also shows the design's `paneEmpty` (`sew-in`), "No workspaces yet", its line, and a
  primary "Create workspace" button with the `mark-new` icon, and no button at the end of the heading's line. The
  invitations still open to the person, which the host lists with the workspaces, follow them under an
  "Invitations" heading with their count, each keyed by its ID, as the design's `rowWithButton`: the first
  letter of the workspace's name ("?" when the host has none), the name or "Workspace invitation", "Pending
  invitation · Expires in 7 days" (`expiryLabel` in `seen.ts`, from the time now, which the root gives the view),
  and an "Accept invite" button named for the workspace; with invitations and no workspace, the design's
  `footnote` after them says "Accept an invitation above, or create your own workspace.". Each workspace's row
  is the design's `row` with an ID, `workspace-{id}` (`workspaceRowId`), which focus moves to.
  - The listing, `Workspaces`, is `Loading`, `Loaded`, or `Unreachable`. Until the host answers the first read, a
    session restored from the browser or a person who has just signed in, the screen is the design's `paneEmpty` with
    the working logo and `level: 1`: "Checking your session", "Connecting to your workspace host…", in a live
    region, under the header that holds the account and Sign out. The first read failing is
    `Unreachable`, a screen of its own, the design's `paneEmpty` (`lost-thread`) with `level: 1`: "Can't reach your workspace
    host", "You're still signed in. Try again once the host is running.", and a primary Try again that reads it
    again, with no heading and no Create workspace button. A read after the list was shown, as it is once a
    workspace is created or joined, or on Try again, keeps what was listed: `Loaded` carries `reloadFailed`,
    and when the read failed it says "Couldn't refresh your workspaces." as an alert over the list with a quiet
    Try again, which reads it again and takes the alert away until it fails again.
  - A "Create workspace" button at the end of the heading's line, while the listing is loading or has anything
    to list, and the empty listing's, and an invitation's "Accept invite" button open one modal, on a
    `DialogBlock` bound as `dialog`. The model's `entering` is what the person is doing in it, which is
    `Entering`: filling the form for creating (`FillingCreate`), the request on its way (`SendingCreate`), and
    `Opening`, once the workspace exists, with its ID, its name, and whether the listing could be read again;
    and for joining, filling the form (`FillingJoin`), the request on its way (`SendingJoin`), and `Joined`,
    once the person is in the workspace, with the invitation and whether the listing could be read again.
  - Creating asks for the workspace's name and what people there will call the person, and creates it over HTTP,
    `client.workspaces.create`, as its owner and first member. Each attempt sends a request key as the
    `idempotency-key`, made by the command with the browser's `Crypto`, and a failed attempt keeps the key it
    used so that the request sent again after an uncertain outcome returns the workspace the first created, not
    a second; changing a name starts a new request, since it is no longer the one that was sent. The command
    takes the names without the space around them and words each refusal for the person: at the name or the
    member name ("Use 1 to 80 characters, with no invisible ones."), or about the whole form for an identity that
    may not create workspaces, values the host did not accept, and, for a host that was unavailable, unsure, or
    not reached, "We couldn't confirm creation. Try again with this name to safely check the same request.", which
    is safe with the same key. Once the workspace exists the dialog is titled "Workspace created", described by
    "{name} is ready.", and says "Opening your workspace…" while the listing is read again; the page reports the
    opened workspace once the listing has it. If the listing cannot be read, the dialog says "Your workspace was
    created, but we couldn't refresh the list. Try again to open it." with Close and a primary Try again.
  - Joining is "Join {workspace}" ("Join this workspace" when the host has no name for it), over the invitation
    the person answered, described by "What should people there call you? You can change it later.", and asks for
    the name people there will call them, `client.workspaces.acceptInvitation`, in a "Your name" field filled in
    with `suggestedName` and selected when it takes focus, by the `SelectOnFocus` mount on the field, which the
    design's `field` takes among its `attributes`. Accepting again returns the same member, so the request
    carries no key and may be sent again as it was. The command takes the name without the space around it and
    words each refusal for the person: at the name when it does not hold
    ("Use 1 to 80 characters, with no invisible ones."), or about the form: "This invitation changed while you
    were accepting it. Try again." (`Changed`), "This invitation isn't addressed to this address." (`Denied`),
    "This invitation is no longer available." (`Conflict`, an invitation revoked or expired, and `NotFound`),
    "This invitation can't be accepted as it is." (`Invalid`), and, for a host that was unavailable, unsure, or
    not reached, "We couldn't accept the invitation. Try again when the host is available." A failure returns to
    the form with its reason, to send again. Once the person is in the workspace the listing is read again, and
    once it is the dialog closes, a toast says "Joined {workspace}" (the name the listing has), and focus moves to
    that workspace's row in Your workspaces, since the invitation's button has gone; the workspace is not opened.
    If the listing cannot be read, the dialog stays and says "Joined, but we couldn't load your workspaces. Try
    again." with Close and a primary Try again, which reads the listing again and sends nothing.
  - The toast is the design's `toast` with `role: "status"` and a Dismiss, in its `toastStack`, which the page
    renders at the end, since the centered screen has no shell. The model keeps `toasts`, each with an ID taken
    from `nextToastId`, so that the time of a toast the person dismissed cannot take another's. Showing one
    starts `ExpireToast`, a command that waits five seconds (`Effect.sleep`, so a test moves the clock) and
    reports `ExpiredToast`, which takes the toast away as `DismissedToast` does; `FocusWorkspaceRow` moves focus
    to the row with `Dom.focus`, completing when the row is not there.
  - A request the host answers with `Authentication.Unauthorized` (told with `Schema.is`), because it does not
    know the session, ends in `RejectedSession`, whichever request it was, and the page reports `EndedSession`;
    the root signs the person out. Any other failure is worded for the person, as each request does.
  - Closing the dialog ends what was being done, except while a request is on its way: it opens again, so that a
    workspace is not created, nor an invitation accepted, unseen. Closing it while the listing is read again
    leaves the listing to show the result alone, without a toast.
- `page/workspace`: a workspace the person opened, as their member of it, on the design's shell. The
  rail has the logo, a button named "Amends home" that goes Home, over "Home", "Agents", and "Connections" buttons, then "Search", and, below, "Settings" and the person's account. Each
  destination is marked while it is open; Home is open while the page shows it (`Open.Home`), whatever Home shows, and
  Connections while the connections, one connection, or the channels are. Search is no destination: it is never
  marked, and it sends `ClickedSearch`, as the sidebar's Find anything… does. The rail picks a destination and the
  sidebar lists its items, so the sidebar changes with the rail. The
  sidebar, named by the workspace, has the workspace's name over a button to all workspaces and, under them,
  the destination's sections; it has no footer, since who is signed in and the way out are in the account menu on the rail.
  Home's are the Home Block's `sidebarView`, in the slot `home-sidebar`. The Agents destination's is the agents Block's
  `sidebarView`, in the slot `agents-sidebar`, and the Connections destination's, and the Channels',
  the connections Block's, in `connections-sidebar`, which is how the channels are reached, since the
  rail has no button for them. The Settings destination's is one section, Settings, with the items
  Workspace and Members, which each open a page of their own and are marked while it shows (`Open.Settings`
  takes `page`, Workspace or Members, so that the sidebar and the main pane agree on which; the rail's Settings
  opens Workspace). Over them, the sidebar's header has a button, Find anything…, with
  the shortcut beside it, hidden from assistive technology, which sends `ClickedSearch`; the shortcut
  reads ⌘K on an Apple platform and Ctrl K on any other, the key it names being Command+K or Control+K, by
  the view input `isApplePlatform`. The main pane shows one destination: Home (the Home Block's `view`, in the slot
  `home`, given the time now), the connections, the agents, one agent's page (`Open.Agent`,
  with the agents Block's `agentView` in the slot `agent`), one connection's page (`Open.Connection`, with the
  connections Block's `connectionView` in the slot `connection`), the settings' Workspace page (`view`, in the slot
  `settings-workspace`) or Members page (`membersView`, in `settings-members`), or the channels, which are always
  read. The side pane shows Home's thread, while Home has one open (the Home Block's `threadView`, in the slot
  `home-thread`, labelled "Thread"), or the member open beside the settings' Members (`settings-member`, the
  settings Block's `memberView`, labelled "Member details"), only while one is, and the actions' toasts come over
  both. The member is part of what is open (`Open.Settings` has `memberId`) and not only of the settings Block's
  model, so that showing another page or destination leaves it; the Block asks to open and close it with
  `OpenedMember` and `ClosedMember`, which the page folds, opening the side pane's dialog where the pane is one, and
  closing the member closes the dialog and the dialog's closing closes the member. The shell is given the pane's
  label, which names its dialog. Home's `dialogView` (the slot `home-dialog`), the groups' dialogs, is lent to the
  shell's `dialogs`, where it is in the frame at every width, and so are the connections' `dialogView`, for adding a
  connection, replacing its key, or confirming its removal, and the agents' `dialogView`, for adding an agent or
  confirming its removal, and the settings' `dialogView` (the slot `settings-dialog`, given the time now), for
  inviting someone, reading the invitations, revoking one, handing the workspace over, or removing a member, and the
  search, which the page binds as `search` (`SearchBinding`). All are in the document after the drawer and the side
  pane's dialog, so the one opened last is over the rest. `ClickedSearch` and `RequestedSearch`, which the root
  sends, ask the search to open. The search reports what was opened and the page asks Home to open it, as Home's
  own lists do: a group (`requestOpenGroup`), a thread in its group (`requestOpenThread`), as a task's is, and a
  person as a conversation with them (`requestConversationWith`), which Home's groups select or start. A group or a
  thread opened shows Home and closes the navigation drawer and the side pane's dialog, as any navigation does. The
  workspace's name in the sidebar and
  in the panes that name it is the settings' once they hold the workspace, so it follows a rename, and the one
  the workspace was opened with until then. The page's view takes the account's email, the Appearance the person chose, the time now, and whether the page runs on an Apple
  platform as view inputs, and gives Home and the settings' Members page the time now. The shell lays itself out by the window's width: below 64rem the sidebar is
  not in the frame but in a navigation drawer, and below 48rem the rail with it, which the shell's Menu
  button opens. The drawer is a `DialogBlock` the page binds as `menu` (`MenuBinding`, id
  `workspace-menu`) and lends the shell, so the framework traps focus in it, makes the rest of the
  window inert, closes it on Escape and on a click on its scrim, and returns focus when it closes. The
  Menu button asks it to open (`ClickedMenu`), and every navigation to an item of a sidebar, the
  sidebar's Workspace and Members, what the agents and the
  connections Blocks ask to be shown by their titles, Browse, Add, and rows, and what the connections ask to be shown by a connection picked, asks it to close (a close of a closed
  dialog does nothing), which is `goTo`; so does Home's `Navigated`, which Home reports when the person moves within it,
  from the sidebar's Inbox, Triage, Tasks, and Browse groups, by a group picked, and by a task's thread opened, and
  which shows Home and closes the side pane's dialog too. A destination picked on the rail does not: it switches
  to the destination (`switchTo`), showing it in the main pane, closing the side pane's dialog, and asking Home to reset
  (`requestReset`), and leaves the drawer open at a phone's width, where the rail is in it, so the
  person sees the sidebar of the destination they picked and picks from it, which closes the drawer.
  The member's side pane is in the shell's card beside the main pane only from 80rem
  (`Split`); at every other width it is in a dialog of its own, so it gets what the drawer gets, and
  the toasts come inside whichever dialog is open, where they can be read and dismissed. The page
  binds another `DialogBlock` for it as `aside` (`AsideBinding`, id `workspace-aside`) and lends the
  shell the pane's view with the dialog's, and whether the dialog is open; Home binds its own for its thread. The design's
  `isAsideInDialog(viewport)` decides whether the pane is a dialog. The page opens the dialog (`showAside`, which does nothing
  at `Split`) as the settings report `OpenedMember`, and closes it (`hideAside`) as they report `ClosedMember` and in
  every navigation, since the member goes with its page. What the agents report that the person did is confirmed in
  a toast: saving a name or a setup ("Name saved", "Setup saved"), adding one ("{name} created", with its page
  opened), and removing one ("{name} removed", with the list shown); and what the connections report, in the words of
  `connectionsToast`: saving a name or the settings ("Name saved", "Settings saved"), replacing a key ("API key
  replaced"), adding one ("{name} created", with its page opened), and removing one ("{name} removed", with the list
  shown); and what the settings report, in the words of `settingsToast`: renaming the workspace ("Workspace
  renamed") or themselves ("Name saved"), changing a role ("Role saved for {name}"), handing the workspace over
  ("{name} is now the owner"), creating an invitation ("Invitation created") and revoking one ("Invitation
  revoked"), each on the page it was made on, and removing a member ("{name} was removed"), which also closes the
  member and the side pane's dialog. When the dialog closes by itself, by Escape or its scrim, the
  page closes the member open beside the settings, except at
  `Split`, where its closing is the pane moving beside the main pane and the member stays open. When the window's width changes
  with a member open, the page puts the pane where the width wants it: crossing 80rem either way
  moves the pane between its dialog and the card without closing the member. Opening the workspace lists the host's integrations
  once, over HTTP, and informs its connections, agents, and channels of them, or of why they could
  not be reached; it lists them again when one of the three asks. It keeps the window's width, which
  the root gives it as it opens and informs it of when the width changes (`informViewport`), and informs Home of; once the
  sidebar is in place, from `Desktop`, it closes the drawer, so a window that grows past 64rem while
  the drawer is open gets its sidebar back. It reports when the person leaves it and the entries of the
  account menu that the root acts on.

  The rail's account is the settings' `accountView`, which the page embeds with the address the person signed in with
  and their Appearance: a button named "Account: {name}", their initials on a mark, with their name once the settings
  hold it and the address until then. It opens to the right of the rail with that name over the address, an Appearance
  group of System, Light, and Dark with the current one checked, then Switch workspace, Workspace settings, "Change your
  name…", and Sign out. The settings open the name dialog themselves and report the other entries. The page shows the
  Workspace page of the settings for Workspace settings, as the rail's Settings does, and forwards the rest to the root as
  `ChoseAccountEntry` (`AppAccountEntry`): the root shows and keeps an Appearance, leaves the workspace for the list of
  the person's workspaces, or signs out. Menu items are `menuitem`s whose names say `(selected)` for the Appearance chosen, since the Block cannot
  draw a `menuitemradio`.

- `page/workspace/home`: Home, the first destination of the rail, a Block of the page's own that owns what the
  person reads from and starts in the workspace and the side pane for it, as every rail destination owns its sidebar,
  its main pane, and its side pane. It binds the groups (`GroupsBinding`), the inbox (`InboxBinding`), the tasks
  (`TasksBinding`), the open group, a keyed occurrence (`GroupBinding`), and a `DialogBlock` for the thread's side
  pane (`AsideBinding`, id `home-aside`). Its main pane (`view`, given the time now) shows the
  inbox, which it opens on, the tasks in triage, every open task, the groups to browse, or the open group (`Open`:
  `Inbox`, `Triage`, `Tasks`, `Groups`, `Group`); it has no state of showing nothing. Its sidebar (`sidebarView`) is an
  "Inbox" item with how many notifications wait, a "Triage" item with how many tasks wait in triage
  (`triageCount`), a "Tasks" item, and the groups' sections; picking a group opens it and marks it in the list, and
  resetting Home, as showing any other destination does, leaves no group marked and shows the inbox. The tasks Block is the same child
  under two slots, `triage` and `tasks`, with `triageView` and `tasksView`; a task's thread opened there is opened in
  its group with the thread already open, and the group marked, which a notification's is not: its thread opens
  beside the inbox, which stays. The groups to browse are the groups Block's
  `browseView`, the same child as the sidebar's under a second slot, which the Block asks for with `RequestedBrowse`:
  Home goes there as it goes to any list, closing the side pane's dialog and the thread beside the inbox and marking
  no group open, and picking a group on that page opens it, which leaves the page. Its side pane (`threadView`, given
  the time now) is the thread open in the open group, or beside the open inbox (`inbox-thread`, the inbox's
  `threadView`), only while one is, and `asideDialogView`, given the `toView` the shell passes the page, is the
  dialog around it; `dialogView` is the groups' dialogs, for starting a team or a conversation. The page lends the
  shell each of them. The thread's side pane is beside the main pane only from 80rem (`Split`); at every other width
  it is in the dialog, which Home opens (`showAside`, which does nothing at `Split`) as the open group or the inbox
  reports `OpenedThread`, and as a task's thread opens its group, and closes (`hideAside`) as the group or the inbox
  reports `ClosedThread` and in every navigation, since the thread goes with its group. Every navigation that leaves
  the inbox, those that hide the dialog and a group or a task's thread opened, also asks the inbox to close its thread
  (`requestCloseThread`), since the inbox keeps its state while another destination shows, so that coming back shows
  no stale pane. When the dialog closes by itself, by Escape or its scrim, Home closes the thread with the open group's
  or the open inbox's `requestCloseThread`, except at `Split`, where its closing is the pane moving beside the main
  pane and the thread stays open. When the window's width changes with a thread open, which the page informs Home of
  (`informViewport`), Home puts the pane where the width wants it: crossing 80rem either way moves the pane between
  its dialog and the card without closing the thread. The Block reports `Navigated` when the person moved within it,
  from the sidebar's Inbox, Triage, Tasks, and Browse groups, a group picked, or a task's thread opened, so the page
  closes the navigation drawer and the side pane's dialog and shows Home. The page asks it for the rest: to reset
  (`requestReset`), which closes the thread, leaves no group marked, shows the inbox, and closes the dialog, as leaving
  Home does; to open a group without a thread (`requestOpenGroup`) or a thread in its group (`requestOpenThread`);
  and to select or start the conversation with a member (`requestConversationWith`), which reports `Navigated` only
  when the groups select a conversation.

- The root, `composition.ts` with `model.ts`, `message.ts`, `init.ts`, `update.ts`, `subscription.ts`,
  and `view.ts`: the page the person is on, signed out at the form or signed in with their account,
  workspaces, and the one open, the width of the window, the time now, and whether the page runs on an Apple
  platform. Signing in lists the workspaces, which the page asks for with the account's email, so that it can
  suggest a name for joining one; signing
  out, from the workspace list or from the open workspace's account menu, which asks the root, is one step
  in `composition.ts`, and its command, `command.ts`, forgets the session, the person's stores, and
  their sync identity first, so it works offline, then removes the browser's sync key and ends the
  session as far as the host can be reached. A session the host no longer knows, which the workspace
  list reports as `EndedSession` (as when the host was started over another database), signs out the same
  way and lands on the sign-in form with the account's address filled in and "Your session has ended.
  Sign in again." over it (`endSession`). The width is the design's `Viewport` (`Phone`, `Tablet`,
  `Desktop`, or `Split`), which a view that changes with it cannot leave to CSS. It starts from the
  flags, `flags.ts`, which read the session kept from the last visit and ask `window.matchMedia` the
  design's `viewportQueries`: the runtime processes no Message until the first render has painted, so
  a subscription alone would paint the desktop layout on a phone before correcting it. The flags also
  say whether the page runs on an Apple platform (`isApplePlatform`), read once as the page boots from
  the user agent's platform, `navigator.userAgentData.platform`, in the browsers that have one, and from
  `navigator.platform` in the others, which `namesApplePlatform` takes for macOS, iOS, or iPadOS. The
  root keeps it in its model, since nothing changes it, and gives it to the open workspace's view, which
  writes the search's shortcut by it. The flags also carry the Appearance the browser kept (`readKeptAppearance`: System
  when none was kept or what was kept is not one), which the root keeps in its model and the open workspace's account menu
  checks. `init` shows it on the page (`ShowAppearance`), and choosing another in the menu shows and keeps it again
  (`ShowAppearance`, `KeepAppearance`; a browser that refuses to keep it loses it only for the next visit). The runtime
  paints once before it runs a command, so `index.html` shows a kept Light or Dark itself, before the page first paints,
  and `init` shows it again. The
  subscription `WatchViewport`, in `subscription.ts`, keeps it current: it follows the three queries,
  drops a width that did not change, and sends `ChangedViewport`, whose update sets the width and
  informs the open workspace of it, and a workspace opened later starts from the width the root has
  then. What the clock decides, such as which day a time falls on and how long ago it was, needs the
  time now, which enters the same way: the flags read it with `DateTime.now`, and the subscription
  `Tick` sends `Ticked` each minute (the first at once, a moment after the flags read it), whose update sets it.
  The subscription `OpenSearch` follows Control+K, or Command+K on an Apple platform, which Foldkit's
  `Mod` decides from the user agent, also from a field, and sends `PressedSearchKey` while a workspace is open, which the update asks the workspace
  to open its search for; with none open the key is left to the browser. Nothing acts on the time, so it goes no further than views: the root's view gives the open
  workspace's view the time now beside the email, as a view input and not a message, and the page
  gives it on to the inbox and the open group, the destinations that show ages and days; the workspace
  list's view takes it too, for when each invitation closes. `entry.ts` assembles the application over `services.ts`, which supplies the stores, the
  session, and the browser's services beneath them, and gives it `crash.ts`'s view for when it stops on an unexpected
  error: apps/ui's crash screen, outside the session, so with the brand alone in its header, the state art of something
  that came apart, "Something went wrong", what happened, and a primary Reload. Foldkit draws it after it has stopped
  dispatching, so its builder has no message to send, and Reload is a link to the page's own address, which loads the page
  again.

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
`taskTable.ts`, tasks as the design's `directory` rows under the labels of its columns, with the badge
of each status, is the threads feature's Tasks tab's and the tasks feature's, which adds a column for the group.
`taskFilter.ts`, what a list of tasks is narrowed to besides the letters typed, the status and the assignee, each
chosen from a menu, is theirs too. The assignee is an `AssigneeFilter`: `Anyone`, `Unassigned`, or `Member` with the
member's ID. The menu reports a choice as a string, `Anyone`, `Unassigned`, or `Member:` and the ID
(`assigneeChoiceOf`, `assigneeFilterOf`), and `assigneeChoices` lists the members still in the workspace, by name, with
the mark `seen.ts` gives them (`memberMark`: their initials, lilac for an agent).
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
  of a kind at a place, `threads` a group's threads with their messages, and, for each thread, how many messages follow its
  opening and who wrote them (`summarizeReplies`) and when it was last active (`deriveLastActiveAt`: when its
  latest message was published, or when the thread was created while it has none), and `actions` the person's
  unfinished actions, each again after every change, `every` the records of a kind wherever they
  sit, `tasks` every task with the thread that tracks it, summarized as `threads` summarizes one, its
  opening, its replies, and when it was last active, and the name of its group as the person reads
  it, and whether the thread is still being started (`viewTasks`; a task whose thread or group the
  replica lacks is left out, since it could not be opened; the replica reads the threads that track
  tasks and their messages alone, each by the place it sits at, in one transaction, so that what it
  reads follows the number of tasks and not of threads, and reads those of the tasks the person's
  unfinished actions create too, since their actions hold the tasks), `inbox` the person's
  notifications with the threads they come from, which the store
  shows each by the message its activity is about, `thread` what a thread holds, with its task
  and turns, `group` a group with its admissions and the person's follow of it, `groups` every group
  the replica holds with how many members it has, a team's admitted ones, which a removed
  admission leaves out, and a conversation's own, and `grants` what
  the person may do, resolved by core's `GrantResolver` from their active assignments and the
  workspace's roles; the store reads each through `overlay`, and offers each turn's retry by core's
  `Turn.whyNotRetryable`, from where its agent stands among the thread's turns, by
  `TurnStore.latestOf`, and who takes part in it. `get` and `getActions` read a record and the
  actions once, for an action being written.
- `members`, `contacts`, and `people` are the workspace's members, its contacts, the people its channels
  heard from, and the two together as `{ members, contacts }`, as values and not held records, each
  again after each change to them or to the person's actions, as `list` is. The thread, the inbox, and
  the tasks read `people`, to name who wrote what; the group, the groups, the turns, the channels, the
  agents, and a thread's task, for the members of its group, read `members`. The settings list the
  members with `list`, since they show which are unfinished. `workspacePlace` is the place of the
  records the workspace holds itself, which a Block lists the other kinds at, such as groups, roles,
  assignments, connections, and channels.
- `search(query)` is an Effect and not a stream, since a search runs when it is asked: it reads the
  groups, the members, the threads, and their messages once, as the person's unfinished actions leave
  them, and `findMatches` decides what has the query in it. It reads every message, since the replica
  keeps no index of a thread's opening. It gives `SearchResults`: the groups whose names, as the
  person reads them (a conversation by the other members), contain it; the threads whose title, or whose opening message's words, a mention as the member's current name, contain it,
  each with the name of its group and the words the person reads it by, its title or its opening's;
  and the active members, other than the person, whose names contain it. Each kind is at most eight
  (`maxSearchResults`), in the order of the records, and the query is matched whatever its case or
  accents (`foldAccents` in `seen.ts`, which the composer's list of members compares names with too).
  An empty query, or one of spaces, finds nothing. A thread whose group the replica lacks is left
  out, since it could not be opened, and so is one whose only words are a deleted message's.
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
browser's storage. Each Block's tests sit beside it. The commands that call the host are run over a client that answers
what a test names, which can be that its call dies, and the message they end in is given to the form's update, to show
it leaves its sending state with the general failure. `appearance.test.ts` runs the script of `index.html` against the
key `keepAppearance` keeps, to show the two agree. `crash.test.ts` renders the crash view: the heading and its words, the
state art, the brand alone in the header, and Reload as a link to the page's own address:

- Story tests drive a Block's update: the thread read through its latest activity, once, its title
  and messages changed from what was seen, following and unfollowing, typing said once while a reply
  is written and stopped once it is sent, and why a write could not be kept; a task made and changed
  from what was seen, unless nothing changes; a thread's turns stopped while they are active and run
  again only when nothing else keeps them from it, and a turn's log followed from showing it until
  the turn ends or the person hides it, passing over another turn's, and followed again after it
  could not be; a thread started from the composer, a task started on the Tasks tab, the tab chosen, and the status, the
  assignee, and the order chosen from their menus, which change only the Block's own model, the thread picked, and the
  tasks of a group's threads kept to a status, an assignee, and a search and ordered latest active, newest, or
  oldest first, and counted while open; a composer filling in its
  draft only while nothing was written, keeping what is written, and sending it once, listing members for
  a mention typed at the end of the text and for no other, keeping the list closed for the letters it
  was dismissed for, opening none for a draft read, and writing the member picked as a link; a group
  opening its settings on General, with the draft of the team's name started only for someone who
  may rename it, renamed from the name seen, writing nothing when the name is unchanged, and closing
  its settings, which drop their drafts, whichever way they close; followed, left from its settings,
  or joined, a member admitted and an admission removed,
  and the thread picked opened and closed, each reported, open already as the group opens without a
  report, or closed as its parent asks, without one; the groups starting a
  team or a conversation in a dialog it opens on a blank form and closes when the form is submitted
  or the dialog closes, dropping what was being started, and reporting the group picked once, asking
  to browse each time, and keeping the browse page's tab and search, and selecting the conversation
  with a member asked for, or opening the dialog with the member chosen when there is none, a team
  with that member in it not being that conversation; the search opening on an empty field, searching
  for what is typed only once it holds more than spaces, keeping the rows shown while the next search
  is on its way, dropping an answer for an earlier query, saying why a search failed and searching again
  as the person types on, listing groups, threads, and people in that order, moving the active result
  and scrolling it into view, and opening the active result or one clicked, reporting a group, a thread,
  or a person, closing the dialog and forgetting the search, and opening none while there is nothing
  found or the rows shown are for an earlier query; the inbox
  saying why the person is told, who wrote what and what they did, where it comes from, and what it
  says, grouping the notifications by the day they came on, listing every one or those waiting, and the
  one opened in its place, newest first, as its tab chooses, the newest page of them and a page more each
  time older ones are asked for, whichever tab shows, with the one opened kept past the page, opening the thread of a notification,
  which writes it seen only while it waits, selects it, and reports it, opening none for a notification
  from no thread, moving the selection to the next one opened, clearing it with Close and reporting
  that, or as its parent asks and reporting nothing, finding the group the thread is in, marking all through
  the newest that waits while the thread stays open, and why a write could not be kept; the tasks keeping the tasks and
  the people they are told of, or why they could not be read, telling the tasks in triage and the open
  ones apart and counting those in triage, keeping those a status, an assignee, with Me the member the
  Block is made for and No one a task with none, and a search keep, latest active first, however they
  are given, leaving out the status for a list that has no choice of it, and reporting the thread of
  the task picked with its group; the connections keeping the integrations the page
  informs them of or why they could not be listed, asking the page to list them again, reading the connections by
  name once the store has answered, who may add one and who may manage one, putting a connection on All and on
  the tab of each thing its integration gives, narrowing the list by tab and by search, opening the dialog on the
  integrations, narrowed to what a section gives, and choosing one, which starts the form on its defaults, going
  back, sending a connection over HTTP once its name, required settings, and key are in, once while it sends,
  with the same request key on a retry and a new one once the form changes, keeping what failed, the dialog
  waiting for the store to list the connection the host made and then closing, checking it, and reporting it,
  closing the dialog except while its request is on its way, renaming, changing the settings of, and removing
  one as actions from what was seen, replacing a key and checking over HTTP, closing a form about a connection
  that is gone, wording each failure for the form it shows under, and the page's toasts, asking the page to show
  the list, a connection, or the channels, and why a read or a write could not
  be kept; the agents keeping the integrations the page informs them of or why they could not be
  listed, asking the page to list them again, opening the dialog on a blank form that adds an agent without
  leaving the page, sending nothing from it until it has a name and a model, adding an agent as an action
  with the configuration its draft makes and marking beside its fields what a draft can't be saved with,
  keeping the dialog open on the request on its way, since closing it then opens it again, and until the
  store has listed the agent, which it tells from the agents it had by who made it and its name, then closing
  the dialog and reporting the agent for the page to open, in either order of the store keeping the action and
  listing the agent, asking for the models of its connection if the form had not, saying under the form that an
  agent could not be created, loading the
  models of the model connection the form chooses over HTTP and keeping those of each connection
  apart, so that a late answer is the models of the connection it was asked of, choosing the model
  again when the connection changes, offering a new agent the roles it may start with and which the person may give, being read once the store has answered, narrowing the list by tab and by name
  without regard to case or accents, counting those that need setup and not those on their way, asking the
  page to show the agents when the person browses, opening the confirmation that removes an agent only
  where the person may remove it and it is not on its way, removing its membership once confirmed and
  once, closing the dialog and reporting the name it had, saying under the question that it could not be
  removed, closing the question of an agent somebody else removed, and reporting the agent picked, asking once for
  the models of its connection, keeping what the person changed on the page of an agent, a name and a setup
  apart, from the name and the setup it has, saving each as an action only once it differs and the person may
  configure the agent, once while it is on its way, marking what a setup can't be saved with beside its field
  and sending nothing, dropping the edits of an agent that is gone, and why a read or a write could not be
  kept; the channels keeping the
  integrations the page informs them of or why they could not be listed, asking the page to list
  them again, adding a channel as an action once its connection, group, and
  name are chosen and refusing one that lacks any, with why, offering only the connections that give
  channels and the groups the person belongs to, by name, moving a channel's conversations to
  another group of theirs and removing it, closing a form about a channel that is gone, and why a
  read or a write could not be kept; the settings renaming the workspace from the name seen and the
  person, sending nothing for a name that is not new, refusing a rename the person may not make or that has no
  workspace to place it in, opening a member and reporting it, changing a member's role from the assignments seen
  and refusing it when the person may no longer or the member is gone, copying the workspace's ID for the attempt
  that was made and ending only that attempt's Copied, reading again on request, narrowing the roster by search and
  by status, inviting by email with the role chosen and refusing it for a blank address or a person who may not, listing
  every invitation by the state and the clock, revoking one that waits and refusing one that is gone, handing the
  workspace over from the owner's assignment seen to a member who can still become the owner, removing a member
  and closing the member open, what is on its way kept as it is, the dialog closing while a request is on its way
  opening again, what the person did told to the page by name, and what an owner, an administrator, and a member
  may do to the members and the invitations; the actions confirming what the page says the person did, each under an ID of its own, going when
  its own time is up or the person dismisses it, apart from what the server refused; Home opening the group picked and reporting that the person moved, as it does for an item of its sidebar, the groups to browse,
  and a task's thread, showing the inbox, the tasks in triage, every open task, or the groups to browse in place of the open group with no group
  marked, showing nothing when its parent resets it, which reports nothing, keeping what the tasks were narrowed to between Triage
  and Tasks, opening a task's thread in its group, and a notification's beside the inbox, which stays, naming the thread open in the group open
  or beside the inbox, opening the group, the thread in its group, or the conversation its parent asks for, or the groups' dialog when there is no
  conversation, and taking the window's width; the thread opening the side pane's dialog where the pane is one, from a notification, from a
  task, from a thread picked in the group, and as the window narrows, and not beside the main pane; its dialog closing with the thread, when Home
  is reset or the groups are browsed, and as the window widens to `Split`, which leaves the thread open; the thread closing as its dialog
  closes by itself, below `Split`; the thread beside the inbox closing with every navigation that leaves the inbox, so that coming back shows
  none; a workspace listing the integrations once as it opens, informing its connections, agents, and channels of them or of why they could not be
  listed, and listing them again when one asks, going home from a group or a destination, to the inbox in Home, showing the connections, the agents,
  the settings, or the channels in place of Home with its group unmarked and its thread closed, and an agent's page from a row of its sidebar or the
  list, showing Home with the group a person's conversation or a search result opens, handing the settings and the channels what the person does in
  them, opening the navigation drawer, closing it as its dialog asks and by every navigation to an item of a sidebar, and not by a destination picked
  on the rail, which shows it, showing the connections, the agents, and the settings for what their sidebars ask, reporting to the root each entry of
  the account menu it acts on, asking the settings for their name dialog, and no one, when the person chooses to change their name, showing the
  settings' Workspace page when the person chooses the workspace's settings in the account menu, which the root is told nothing of, and taking the window's width, closing the drawer once the sidebar is in place and informing Home of
  it, which moves the thread open between its dialog and the card; the member open beside the settings' Members and its dialog, which
  every navigation closes; and
  the root signing in a step at a time, listing the workspaces, opening and closing one, signing out,
  from the list or from the open workspace's account menu, showing and keeping the Appearance chosen there, and the one
  the flags name, leaving the workspace for the list, and showing the workspace's settings, signing out to the sign-in form with the address and a notice when the
  host no longer knows the session, and following the window's width, for the workspace it
  opens too, and keeping the time now from the flags and from each minute's report, which informs no
  one, and the platform from the flags. The commands that write a message's text run their handlers over `test/recordingStores.ts`, a
  `Stores` whose store keeps what is written: a thread, a reply, an edit, and a conversation written
  with the members their text mentions, and with none when it mentions no one. The workspaces page's
  stories start the listing for the person's address with the name it suggests, open an empty form, send
  its names with no key and read the list again once the workspace exists to report it opened, keep the key
  of a failed request for the request sent again and start a new one once a name changes, clear the refusal at
  the field typed in and the one about the form, ignore a close while the request is on its way, which opens
  the dialog again, end on a close at any other point, and show the list alone when the workspace is not in
  it or the dialog was closed; for joining they open the form over the invitation clicked, with the name
  suggested, and none for one the listing does not hold, send the name with the invitation's IDs and read the
  list again once the person is in, then close the dialog, show a toast naming the workspace the listing has,
  and focus its row, without opening it, start the toast's time and take the toast away when the time is up
  or the person dismisses it, with an ID of its own that a later toast does not take, return to the form with
  why a request failed and send it again as it was, clear the refusal as the name is typed, ignore a close
  while the request is on its way, close without a toast when the dialog was closed or the list does not have
  the workspace, keep the dialog on the join when the list could not be read and read it again, sending
  nothing, on request, and end as creating does; for the listing they keep the list when reading it again
  fails and say the host was not reached when the first read does, and report the session ended when any
  request is rejected as unauthorized; the `LoadWorkspaces`, `CreateWorkspace`, and `AcceptInvitation`
  handlers run over `test/host.ts`, a stub `HttpClient` that gives a canned status and body, to show the path, key, and names
  they send and each refusal as the person reads it, and that a session the host does not know (status 401,
  `Authentication.Unauthorized`) ends each of them in `RejectedSession`; `FocusWorkspaceRow` runs over a button
  in the document, which it focuses, and `ExpireToast` over `TestClock`, which it waits five seconds on. The connections'
  `CheckConnection`, `AddConnection`, and `ReplaceConnectionKey` run over the same stub host, to show the path they call,
  the request key `AddConnection` sends, new or the earlier attempt's, and the reason each of the host's refusals, and
  a host that answers what the contract does not say or cannot be reached, is read as; `RenameConnection`,
  `ConfigureConnection`, and `RemoveConnection` run over `test/recordingStores.ts`, and `FocusField` over a field in the
  document.
  The sign-in Block's stories and scenes show the notice it starts with, kept as the address is typed and
  gone once it is sent.
- Scene tests drive a Block's view as a person does: a thread's messages by their authors' initials
  and names and their times, the opening first, how many replies follow it, a reply on its way, an
  edited one, a mention as a chip with its member's current name, a deleted one, the message highlighted drawn current and none otherwise, who types, a reply written and sent, the title renamed from its form, and a message
  edited from its form and deleted by the person who wrote it; a group's threads as messages by the
  author of their opening, their time, a mention in the opening as a chip, who replied and how many
  times, how much is new and where their task stands, the one open marked as current, the thread picked reported, why they could not be read, and a thread started
  from the composer, whose box is named for the group; a group's tabs, Tasks counted while any task is
  open and chosen to show the tasks as rows by their assignee, title, who started them, replies, status,
  and age, latest active first, narrowed by search and by the status and assignee menus, ordered by the sort menu,
  with the menus in the toolbar's order and New task at its end, saying there are none yet or that none
  match, opening a thread by its row, and a task started from the composer, named for the task; a composer listing the members whose names
  contain the letters after the "@" that ends the text, and not the person, saying which is active and
  what the textarea completes from, picking by a click, by Enter, and by Tab, moving around the list
  with the arrows, and closing on Escape until other letters are typed; a task changed by someone who may, read as
  rows by someone who may not, and made by someone who may create tasks; a thread's turns by their
  agents' names and initials and the badges of how they stand, stopped and run again by someone who
  may use the agent and not otherwise, a turn's log followed as it is written, until the turn ends
  or it could not be followed, and the thread listing its agents' turns; a group's main pane, titled by its name or by
  a conversation's other member, with its tabs, its members as a cluster that opens them in the settings,
  the person's part in it as a bell pressed while they follow, and the gear to its settings, and
  joining in place of the threads and the tabs of a team they do not belong to,
  with the composer to start a thread in its footer; its settings in a dialog named for them, in a
  team's name beside the title, with General and Members as tabs, the name a field for someone who
  may rename the team, saved only once it differs, and text for everyone else, the visibility and
  the membership in words, with leaving, closing the dialog, and joining, which keeps it open, and a conversation's with neither tabs nor
  visibility; its members, those present marked
  Online and one on its way marked sending, with removing for the others, admitting, offered only to
  someone who manages them; and its side pane for the thread open in it, titled by the thread
  under the group it is in, with the composer to reply in its footer, closed by its Close button or its Back, which send the
  same message; the groups listed in the
  sidebar's sections apart from the teams to join, a conversation by its other member, one still on
  its way marked "Sending…" at the end of its row, with the thread open under the group picked, and a new team taken in a dialog named for it, with the name
  field holding the focus, made public by its switch, and closed by Cancel, by its Close button, or
  once written, only from someone who may create one, a conversation started with the member chosen in
  a dialog of its own, both in a view apart from the sidebar's, with the sidebar's buttons that open
  them and the same team taken from the workspace's sidebar, the dialog for a conversation taking the
  focus on its member choice, or on the first message when the member is chosen, and the groups to browse: the button in the sidebar's header asking for them, the tabs counted and chosen, each
  group's mark, visibility, and members, a team and a conversation told apart, the search narrowing
  either tab in any case and with spaces ignored, nothing matching, nothing to discover, no groups yet, a
  team on its way, a group opened from its row, and Create group only for someone who may create
  one, opening the dialog with no sidebar on the page; the inbox's notifications under the day they came, by their
  author and what they did, the place they come from, how long ago, and what they say, with a mention
  in it as a chip and a deleted message said so, a mention, the opening of a thread, and a reply told
  apart, with no place while the group is unknown and the
  activity alone while the thread is, the unread ones with a dot and no button to mark one seen, the
  seen ones on All without the dot and not on Unread, the tabs counted and chosen, all marked seen,
  which keeps the thread open, one's thread opened by its text, which marks it seen unless it was and
  fails visibly, its row current and moving as another is opened, kept on Unread once seen with only
  what waits counted, an empty All saying there is nothing yet and an empty Unread saying all is
  caught up, with a button back to All, and no activity yet on All, the list a line that says it is being read until the store has answered
  and the reason it could not be read in its place, the list kept when a later read fails, only once the thread is closed, and the newest page with Show older after it, which goes
  once older ones are asked for and is not offered on a tab that keeps none; the inbox's side pane, titled by the thread under the
  group it is in, with the message the notification is about drawn current, the reply composer in
  its footer, closed by its Close or its Back, and absent while no thread is open; the tasks in triage as a main pane titled
  Triage, and every open task as one titled Tasks, each task by its group, its assignee's initials,
  who started it or the contact who did, its replies, where it stands, and how long ago, as a row
  under the labels of its columns, on its way while its thread is being started, listing the tasks in
  triage alone, or those neither done nor dismissed, latest active first, narrowed by an assignee, by
  a status of an open task, which Triage has no choice of and ignores, and by a search, in any case,
  and together, saying there are none to triage, no open tasks, or that none match, why they could
  not be read, and opening a task's thread by its row; the connections as a list, with tabs and their counts,
  a search by name or by integration, its rows with their status and how they authenticate, and what it says
  when there are none, none on a tab, or none that match; a connection's page, with a note of why it can't be
  used, its check and what it found in place, its name and its settings saved apart with a failure shown under
  each, how it authenticates, its details, and its removal, read by an ordinary member without the controls,
  marked as sending with none while a change is on its way, and missing when the workspace does not list it; the
  dialog that adds a connection, narrowed to a section's integrations and searched, then the form for the one
  chosen, with a key field only for the method that takes one, sent once, with its failure shown, and a retry
  of the same values sent under the same key; the dialog that replaces a key and the one that removes a
  connection; why the integrations could not be listed and a way to ask again, and why they could not be read; the
  connections' sections of the sidebar, Models, Tools, Sandboxes, and Harnesses, then Channels, each connection
  under every thing it gives with the shape of its status at the end of its row and none while it is
  ready or on its way, "None yet" only once the connections and the integrations are read, the
  titles, Browse, and Add opening the list on a tab, or the dialog, for a person who may add one and the channels
  opening their own, and the connection picked reported; the agents added by an
  owner with a harness, a model connection whose models load, a model, an effort, and a sandbox, or
  a model the connection does not list by its id, refused with why until the connection and the
  model are chosen, with the reason a connection's models could not be listed, read as rows by what each runs
  on, picked to be reported, with the patch and the sentence for one that needs setup and none for one that is ready, by an
  ordinary member without the controls until the person is given the role that manages them, marked as
  sending with none while a change is on its way, offering to add only once the host listed its
  integrations, saying in the dialog when no connection gives models, and why they could not be read; the list's tabs with their
  counts, its search and the quiet line and Clear search for no match, its empty states, its columns,
  and nothing shown before the agents are read; the sidebar's section with its title, Browse, and Add
  agent, the agents by name with a patch on those that need setup, the one whose page is open marked
  current in place of the title, the one picked reported, and "No agents yet" once the agents are read; an
  agent's page: its name on a lilac mark with the workspace under it on a phone, its name and its setup as
  they are with nothing yet to save, its details, the note of why it can't run, a line for each reason,
  its name renamed from the name it has and saved once, with the failure under the name, and a blank name
  or the name it has not saved, its setup set up again as a whole and saved once, discarded, with a part
  that can't be saved marked beside its field and nothing sent, and the failure under the setup, read
  disabled and without buttons by a person who may not configure the agent, on its way, the agent that
  is not there with a way to the list, and nothing before the agents are read, the Removal section for a person
  who may remove the agent and not for any other or an agent on its way; the dialog for adding an agent
  named for it with the workspace beside the title, holding its focus on the name, with Create agent waiting
  for a name and a model, loading the models of the connection chosen, taking a model it does not list by its
  id, offering Administrator as unavailable with why to a person who is not the owner, marking a connection
  that is gone beside its field, keeping the dialog open under a failure, creating the agent and closing once it
  is listed, and closing with Cancel and Close to open a fresh form the next time; the dialog for confirming
  a removal, naming the agent and saying it leaves and its messages stay, removing it once confirmed, saying
  under the question that it could not be, and left alone on Cancel; the settings' Workspace page, with the name renamed when it is new
  and the reason it could not be kept, the ID copied and shown Copied until its time is up, who made the
  workspace and who owns it, the person's own name changed in a compact dialog the page asks for, which starts from the name they have with it
  selected, saves only a name that is new, says why it could not, and closes once it is kept, with no form for it on the page, what
  is on its way marked, loading, not loading, and a way to read again, and the store's changes shown; the Members
  page, with the members listed under their headings with their role and status, an agent said to be one,
  narrowed by search and by a menu of whether they left, its labels kept under the toolbar only while it has someone to show, a row marking the member open and reporting it; and a member in the
  side pane, with their role changed or refused and the reason said, with Refresh where what the person sees is
  out of date, their access, a member who left, one the person may only read, and one the records no longer hold,
  and Remove member offered only to those who may use it; the Workspace page's Transfer ownership, offered to the
  owner and waiting while there is no one to choose; the Members page's Invite people, the invitations waiting with
  what they give and when they end, held while one is on its way, as one card on a phone, and left out for a member
  who may not manage them; and the five dialogs, each opened from where its button is, drafting an invitation and
  creating it, with the address refused under its field and the other failures under the form, listing every
  invitation with where it stands and Revoke for the one that waits, asking before revoking, choosing the new owner
  and saying who becomes the only owner, and asking before removing a member, each disabled while its request is
  on its way and closing on its end or with Cancel; the channels listed with their
  connection and group, a conversation's group by the others in it, added by an owner over a
  connection that gives channels into a group they belong to, refused with why when one is lacking,
  moved and removed with a failure shown, read by an ordinary member without the controls until the
  person is given the role that manages them, marked as sending with none while a change is on its
  way, with why the integrations could not be listed and a way to ask again, and why they could not
  be read; and a workspace on the shell: reading the inbox and the tasks, and the connections, the agents, and the
  channels, whichever destination shows, then showing the connections, the agents, an agent's page, the settings, or
  the channels, each in a main pane named for it, and Home in the inbox's, with the rail listing Home,
  Agents, and Connections, then Search, which opens the search and is never marked, and Settings below, and
  marking the destination open, Home from the inbox, the tasks, and the groups too, Connections from the
  channels, and the sidebar marking Triage or Tasks while it shows, changing with the rail: Home's
  items and the groups;
  the agents' section with its rows and its title marked, and, with an agent's page open from a row of
  it or of the list, that row marked in place of the title; the connections' sections, by what they give,
  with a connection's page open from a row of one or of the list, that row marked in place of the title, and
  Channels, marked while the channels show; and the settings' Workspace and Members, which each open
  their page and are marked while it shows, with a member opened in the side pane beside the Members, in its dialog
  below `Split`, and left whenever another page or destination is picked; the groups to browse opened from the
  sidebar's button, and from the drawer, which it closes, with
  a group opened from its row and a team started from Create group, also at `Phone` where the sidebar is
  in the shut drawer, the sidebar naming the workspace with
  who is signed in and the way out in its footer, the sidebar in place with no Menu button from `Desktop`, the
  Menu button at `Phone` opening the drawer as a dialog named Navigation that holds the rail and the
  sidebar, its scrim closing it, or an item of the sidebar, a group picked among them, closing it, and
  a destination picked on the rail leaving it open with that destination's sidebar in it, the thread picked opened below `Split` in
  a dialog named Thread that holds the pane, closed by the pane's Close, by its Back on a phone, or by
  the scrim, which also closes the thread, a notification's thread opened the same way beside the inbox,
  and what the server refused as toasts, over the shell and
  inside the side pane's dialog while it is open, and what the person did to an agent confirmed in a
  toast that goes by itself, the dialog of the agents opened from the sidebar over the destination that shows,
  an agent added, shown by its page with its row current, and one removed, shown by the list, a connection's
  name and settings, key, adding, and removal confirmed the same way, the dialog of the connections opened from
  the sidebar and from the list, a connection added, shown by its page after it is checked, and the
  connections listing the integrations
  again after the host could not be reached. Home's scenes show the sidebar counting what waits beside "Inbox" and "Triage", its groups in their sections, and the Groups title opening
  the groups to browse and marked while they show, then the inbox, the tasks in triage, and every open task in a main pane named for it,
  the inbox saying nothing waits or that it is being read, the group's threads as messages in the main pane with the composer to start
  one, the thread picked opened in the side pane beside the main pane with no dialog, with its messages and the composer to reply, marked in
  the list and under the group in the sidebar, and closed by its button, a notification's thread opened the same way beside the inbox, which stays with
  its row current and loses both as the thread closes or the person leaves the inbox, the group's settings opened in a dialog from its
  main pane, a team started from the sidebar's heading and from Create group in the dialog the page keeps, and the groups to browse left to
  by an open group, whose thread's side pane goes with it. The root's own scenes show
  the open workspace with no header of its own, and no footer in its sidebar, signing out from the account menu on its rail,
  an Appearance chosen there shown and kept and the one in use checked, switching workspace and opening the workspace's settings, its Menu button
  appearing and the sidebar leaving as the subscription reports a narrower window, and the reverse,
  and the thread open moving from its place beside the main pane into its dialog as the window narrows
  to `Desktop`, staying there at `Phone`, and back as it widens to `Split`, and the open inbox's
  notifications growing older as the subscription reports each minute.
  The search's scenes show it
  open on a field named Find anything that takes the focus, searching for what is typed, the sections
  that have something in them, the first result active and the field's active descendant following the
  arrow keys round the list, Enter and a click opening a result and closing the dialog, the keys with a
  modifier and those it does not answer left to the browser, nothing found, a search on its way, and a
  failed search. The workspace's scenes show the search in the sidebar's header with its shortcut hidden from
  assistive technology and written ⌘K on an Apple platform and Ctrl K on another, opening in a dialog from
  it and, at `Phone`, from the drawer over the drawer, and a group found opening and closing the search.
  The root's show the key that opens the search opening it in an open workspace and doing nothing before
  one is open, and the shortcut it gives the workspace by the platform. The workspaces page's scenes
  show each row with its members and "Owner" only for a workspace the person owns, on a button with an ID of
  its own, the count line in each of its forms, the invitations under their heading, each by its
  workspace's mark and name or "Workspace invitation" with when it expires, read from the time now, and its
  Accept invite button named for the workspace, and the line after them when the person belongs to no
  workspace; the session being checked as a screen with the working logo until the host answers; the heading's secondary Create workspace button while the listing loads or has anything to list;
  the host not reached the first time as a screen of its own, with a primary Try again, read again; a read that
  failed after the list was shown as an alert over the list it kept, with a quiet Try again; the empty
  listing as its heading, its line, and the empty state with a primary Create workspace, which opens the
  form, in place of the heading's button; and the dialog taking a workspace's names, sending them, saying at each
  field and for the form why they were refused, and opening the workspace created, or saying the list could not
  be refreshed, with Close and a way to try again; the dialog from an invitation's button, "Join {workspace}" or
  "Join this workspace", described by its line, with its field filled in with the name suggested, taking the
  focus and watching it to select the text, the sending state, each refusal at the field and under it, and
  joining closing the dialog and showing the toast with its Dismiss, the workspace's row focused and the
  toast gone when its time is up, or the dialog saying the person joined and the list could not be loaded,
  with Close and a primary Try again that reads it again. A scene opens and closes
  a dialog by resolving its commands and mount, `Dialog.test.ShowDialog`, `Dialog.test.AcquireResources`,
  and `Dialog.test.CloseDialog` from `@foldkit/ui`, resolves the field's `SelectOnFocus` mount and expects it
  ended, and a story sends the dialog's own message through its Binding's `embedView`.
- Every state that says it has nothing, is being read, or could not be read has a scene that finds its words and its
  drawing, which `test/fixtures.ts`'s `art(kind)` finds by the part of it that moves, and a scene of the root view
  holds the logo in the brand, the session being checked under the account's header, and the host that could not be
  reached. A list that is being read is found by its `status` line and its rows hidden from assistive technology, and
  a turn's badge by the motion class of the logo in it.
- The flags' tests stub the browser's `navigator`: the page runs on an Apple platform by
  `userAgentData.platform` where the browser has it, over `navigator.platform`, and by the latter where it
  has not, and `namesApplePlatform` takes the names macOS, iOS, and iPadOS give and no other system's.
- The replica's tests cover the cascade, its positions, and the actions it holds: completed,
  rejected, dismissed, and kept through a reset, and the tasks it reads with the threads that track
  them and those threads' messages, and no other thread's, and with the threads of the tasks its
  unfinished actions create, until the server rejects the action. `overlay`'s cover what an action
  creates giving way to the server's, its changes over the server's records, actions applied in
  order, edits and deletes, a team renamed, members removed and leaving, a group's follow ended and taken up, the
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
  them; the groups listed with their members, a team's counted by its admissions, one removed no
  longer counted, and a conversation's by the members it was made with, before the server has them
  and after; an invitation by address reaches that address's account, and a role change becomes the
  server's under the ID the browser gave it; and another member's reply reaches the person's
  inbox, which reading the thread settles at once and then on the server; and a thread made a task
  and changed shows at once and becomes the server's, while a change from a stale value comes back
  refused, and a thread started as a task shows its task in its group's list at once in triage and then as the
  server made it, and a task in each of two groups lists with the name of its group and the replies its
  thread has, as it is written and once the server has it; and a connection added over HTTP, to an integration the test host installs, reaches the
  store, and its rename and removal show at once, then as the server made them (the stub host the page's and the connections' command tests send their requests through is `test/host.ts`); and an agent added
  in the browser, with its membership, role, and admission, comes back as the server's under the
  IDs the browser gave them; and a channel added in the browser is the server's under the same ID,
  and its move shows at once; and the settings' reads, as the settings Block reads them together,
  give the owner the workspace with its members, roles, assignments, and invitations, and the grant to rename it; and the members, the contacts, and the people together: a contact a channel heard
  from reaches them, and a member renamed here shows at once, then as the host has it; and a search
  finds a team, a thread, and a conversation the person started, and the member they are with,
  before the server has them and after, whatever the case or accents of the query, and not the
  person themselves. `Store.viewTurns` is
  tested apart: which turns may run again, and so is `Store.summarizeReplies`: no replies, and each
  replier once in the order of their first reply, and so is `Store.deriveLastActiveAt`: the creation of a thread
  with no messages, and the later of two messages, and so is `Store.viewTasks`: each task with its
  thread, its group's name, and the summary of its messages, a conversation's group named by the other
  member, a thread still being started, and no task whose thread or group the replica lacks, and so
  is `Store.findMatches`: nothing for an empty
  query or one of spaces, a group by the name the person reads and a conversation by the other member,
  a thread by its title or its opening's words and shown by its title, a mention in an opening as
  the member's current name, no thread by a deleted opening or without its group, the active members
  but the person by name, whatever the case or accents, and at most eight of each in the order given,
  and `seen.ts`: the text folded to lower case without accents, the initials of a name, the time of day, the
  start of a day in the person's own time zone, and the labels of a day, of when a message was, and of how long ago it was, from
  times fixed on the clock of the machine the tests run on, and of when an invitation expires, in days rounded up
  and once it has, and of how many replies a thread has, and a count with the word for one or many, whether a thread's title or opening has the letters searched for, and which statuses leave a task open, and the runs of a text and of a message and of a thread's row,
  a mention as "@" and the member's current name or the name it recorded, and the rest of the
  markdown as written, and `settingsForm.ts`: the fields an
  integration's form gives, a draft from its defaults or a connection's settings, and the settings a
  draft makes, and `agentSetup.ts`: an agent's draft, and the configuration a draft makes. `Drafts`'
  tests keep a draft for each place, the last one written, through being closed and opened again.

`bun run --filter @amends-dev/app-v2 build` bundles the app, which CI builds too.
