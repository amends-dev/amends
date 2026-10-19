# @amends-dev/app-v2

The workspace app, being built on [Foldkit](https://foldkit.dev) Blocks: a browser app that signs
people in over the [HTTP API](../../packages/http/README.md) and keeps each workspace they open in
sync through [`@amends-dev/sync`](../../packages/sync/README.md), so it reads, and will write,
offline. It signs in, lists the person's workspaces, and opens one: the groups they can see, to
pick one or to browse, those they belong to and those they may join; a group's threads with who replied to each and how much of it is new, where they start a thread, and its tasks, the threads that track one, as a table to narrow by status and by search, where they start a task; and a thread's
messages, where they reply, rename the thread, edit or delete their own messages, and follow or
stop following it, which opening reads through its latest activity; their inbox, their
notifications under the days they came, all of them or only those waiting, each by who wrote what it
is about, what they did, where it comes from, and how long ago, to open its thread beside the inbox,
which marks it seen, or to mark all of them seen at once; the tasks they can see across their groups, those waiting in triage and every
open one, as a table to narrow by assignee, by status, and by search, each to open in its group; and a
search for anything in the workspace, groups, threads, and people, from the sidebar or from the keyboard;
the workspace's settings, its name and their own, its members and their roles,
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
and the pane of each destination, `feature/groups` renders the sidebar's sections, the pane where the
groups are browsed, as a table of the design's `directory` rows under its `columns`, and the modal where
a team or a conversation is started, `feature/search` the modal where anything is found, `feature/group` the main pane, the modal of its settings, and the side pane, `feature/actions` the toasts, and every destination's view wraps
its content in its own `pane`. The panes that read or are filled in, the settings, the connections, the agents,
the channels, and the side panes, keep the `paneColumn`'s measure; the panes that list, the group's
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
current, with Mark all seen among the header's actions, and `paneEmpty` when a tab has nothing. The settings are a `paneColumn` of `paneSection`s: each name is a `settingRow` of the name, a
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
`hint` in the body, and a failure to list them a `notice` over a quiet Try again in a `column`. Each
connection is an entry of its name, its integration and how ready it is as `badge`s, a hint of why it can't be
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
  completed a success, failed a danger), with who ran it again and "Sending…" after it, then why it
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
  task stands; the thread open is the current row. On the Tasks tab it is the threads that track a
  task as a table, latest active first by `lastActiveAt`: under a search field, whose label is hidden and
  whose placeholder says "Search tasks…", beside a select of the status, All statuses or one by its name
  (`statusLabel`), whose label is hidden too, a line says "Threads that track a task." with how many
  tasks the search and the status leave at its end, "12 tasks", over the labels of the columns, Task,
  Status, and Activity, and a row for each task: the initials of its assignee, or a dash for no one, the
  thread's title or its opening's words (`threadWords`), "Started by Alice · 3 replies" under it, with
  "Sending…" while the thread is being started, a badge of the status, a success for done and a caution
  for held, how long ago the thread was last written in (`ageLabel`), and "Open →", the row opening the
  thread as a row of the list does; the table is `taskTable.ts`'s, which `feature/tasks` draws too. The
  search finds the letters in the thread's title or in its
  opening's words, whatever their case and accents (`threadContains`); a mention in it is the member's current name. With
  no task the tab says "No tasks yet" and to start one from the composer, and with a search or a
  status that leaves none, "No tasks match". `composerView` is the composer to start one, for the
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
  they apply; and a gear that opens the settings; and under them the tab's content, threads or tasks,
  with the composer to start one in the footer, which a team the person has not joined does
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
  thread with "Thread in #Design" or "Thread in Bob" under it (`threadSubtitle`), with a button that closes it, Close, and, below 48rem where the pane is full screen over
  the main pane, Back before the title, both sending `ClickedAllThreads`, the thread's messages, and
  the reply composer in the footer, and nothing while none is open. The page embeds the Block twice, `view` in the shell's main pane
  and `threadView` in its side pane, giving both the time now, which they give on to the threads Block
  and the thread Block. The main pane embeds the threads Block three times, for the tabs in its header, for
  its content, and for its composer, and the side pane the thread Block twice, once for its content and once for its
  composer, each in a slot of its own.
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
  which reports `RequestedBrowse`, shown to everyone. `browseView` is the page it asks for, a main
  pane titled Groups with two tabs, Your groups, the teams the person belongs to and their
  conversations, as the sidebar lists them, and Discover, the public teams they may join and do not
  belong to, each counted, Your groups at first, and Create group, the same as the sidebar's "+" for
  a team, where they may start one. Under a search field, whose label is hidden and whose
  placeholder follows the tab, and which takes no focus as the page opens, a line says what the tab
  lists with how many groups the search leaves at its end, "4 groups", over the labels of the
  columns, Group, Visibility, and Members, and a row for each group: `#` for a team and the other
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
  nothing, since it asked. The Block offers a count of what waits for its parent to show. It lacks
  "Show older", the mock's page of older notifications: the store gives every notification the
  person has at once, and paging them waits for the store to page.
- `feature/tasks`: the tasks the person can see across their groups, from the store's `tasks`: each
  with its thread, its group's name, how many replies the thread has, and when it was last active,
  and the members and contacts that name who started a thread and who is assigned to it. It is made
  from the workspace as the member, writes nothing, and has two views, each a main pane that takes
  the time now from its parent. `triageView` is titled Triage, "Tasks waiting for a decision.", and
  lists the tasks in triage (`triageTasks`); `tasksView`, the Block's canonical view, is titled Tasks,
  "Every open task you can see.", and lists every task that is neither done nor dismissed (`openTasks`).
  Under the title are a search field, whose label is hidden and whose placeholder says "Search
  tasks…", beside a select of whom a task is assigned to, Anyone, Me, or No one, and, on Tasks
  alone, a select of the status, All statuses or one of the statuses of an open task, with its label
  hidden too. A line says "Tasks in triage across your groups." or "Open tasks across your groups."
  with how many tasks the filters leave at its end, "12 tasks", over the labels of the columns,
  Task, Group, Status, and Activity, and a row for each, latest active first (`matching`): the same
  row as the group's Tasks tab has (`taskTable.ts`), with the name of the task's group as its first
  cell, "General · To do · Sep 20" described after "Started by Alice · 3 replies", and "Open →". The
  row reports `OpenedThread` with the thread and its group, which its parent opens in that group,
  where the task's controls are. The search finds the letters in the thread's title or in its
  opening's words as the group's Tasks tab does (`threadContains`), Me is the member the Block is
  made for, and No one a task with no assignee. The filters are the Block's, one for both views,
  except that Triage leaves out the status (`withAnyStatus`), since it shows no choice of one. With
  no task the pane says "Nothing to triage" or "No open tasks" and that the tasks the person can see
  will be listed there, and with filters that leave none, "No tasks match" and to try different
  ones. `triageCount` is how many tasks wait in triage, for the sidebar to show.
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
  marked while its destination is open; Home is open while nothing, the inbox, the tasks in triage,
  every open task, the groups to browse, or a group is. The
  sidebar, named by the workspace, has the workspace's name over a button to all workspaces, an
  "Inbox" item with how many notifications wait, a "Triage" item with how many tasks wait in
  triage (`triageCount`), a "Tasks" item, the groups' sections, and, in its footer, who is
  signed in with a Sign out button. Over them, the sidebar's header has a button, Find anything…, with
  the shortcut ⌘K beside it, hidden from assistive technology, which sends `ClickedSearch`; it reads
  ⌘K on every platform, though off an Apple platform the key is Control+K. The main pane shows one destination: nothing yet, titled by the
  workspace, the inbox, the tasks in triage, every open task, the groups to browse, the connections,
  the agents, the settings, or the channels, which are always read, or the open group, a keyed
  occurrence. The tasks Block, which the page binds as `tasks` (`TasksBinding`), is the same child
  under two slots, `triage` and `tasks`, with `triageView` and `tasksView`; a task's thread opened
  there is opened in its group, which a notification's is not: its thread opens beside the inbox,
  which stays. The groups to browse are
  the groups Block's `browseView`, the same child as the sidebar's under a second slot, which the
  Block asks for with `RequestedBrowse`: the page goes there as it goes to any destination, closing
  the drawer, the side pane's dialog, and the thread beside the inbox, and marking no group open, and
  picking a group on that page opens it, which leaves the page. The side pane shows the thread open
  in the open group, or beside the open inbox (`inbox-thread`, the inbox's `threadView`), only while
  one is, and the actions' toasts come over both. The groups' `dialogView`, the same child
  under a third slot, is lent to the shell's `dialogs`, where it is in the frame at every width, and
  so is the search, which the page binds as `search` (`SearchBinding`). Both are in the document after
  the drawer and the side pane's dialog, so the one opened last is over the rest. `ClickedSearch` and
  `RequestedSearch`, which the root sends, ask the search to open. The search reports what was opened
  and the page folds it as it folds the same thing from elsewhere: a group is opened alone, as a group
  picked is, and marked; a thread is opened in its group, as a task's is; and a person is a
  conversation with them, which the groups Block selects or starts. A group or a thread opened closes the navigation drawer, as any
  navigation does. The
  workspace's name in the sidebar and
  the home pane is the settings' once they hold the workspace, so it follows a rename, and the one
  the workspace was opened with until then. The page's view takes the account's email and the time now as
  view inputs, and gives the inbox, the tasks, and the open group, in the main pane and the side pane, the time now. Picking a group opens it; Home or any other destination leaves no group
  marked in the list; opening a task's thread opens its group with the thread already open,
  and marks the group, while opening a notification's leaves the inbox where it is. The shell lays itself out by the window's width: below 64rem the sidebar is
  not in the frame but in a navigation drawer, and below 48rem the rail with it, which the shell's Menu
  button opens. The drawer is a `DialogBlock` the page binds as `menu` (`MenuBinding`, id
  `workspace-menu`) and lends the shell, so the framework traps focus in it, makes the rest of the
  window inert, closes it on Escape and on a click on its scrim, and returns focus when it closes. The
  Menu button asks it to open (`ClickedMenu`), and every navigation, the rail's, the sidebar's Inbox,
  Triage, Tasks, and Browse groups, a group picked, and a task's thread opened,
  asks it to close (a close of a closed dialog does
  nothing). The thread's side pane is in the shell's card beside the main pane only from 80rem
  (`Split`); at every other width it is in a dialog of its own, so it gets what the drawer gets, and
  the toasts come inside whichever dialog is open, where they can be read and dismissed. The page
  binds another `DialogBlock` for it as `aside` (`AsideBinding`, id `workspace-aside`) and lends the
  shell the pane's view with the dialog's, and whether the dialog is open. `isAsideFloating(viewport)`
  decides whether the pane is a dialog. The page opens the dialog (`showAside`, which does nothing
  at `Split`) as the open group or the inbox reports `OpenedThread`, and as a task's thread opens
  its group, and closes it (`hideAside`) as the group or the inbox reports `ClosedThread` and in every
  navigation, since the thread goes with its group. Every navigation that leaves the inbox, those that
  hide the dialog and a group or a task's thread opened, also asks the inbox to close its thread
  (`requestCloseThread`), since the inbox keeps its state while another destination shows, so that
  coming back shows no stale pane. When the dialog closes by itself, by Escape or its scrim, the
  page closes the thread with the open group's or the open inbox's `requestCloseThread`, except at
  `Split`, where its closing is the pane moving beside the main pane and the thread stays open. When the window's width changes
  with a thread open, the page puts the pane where the width wants it: crossing 80rem either way
  moves the pane between its dialog and the card without closing the thread. Opening the workspace lists the host's integrations
  once, over HTTP, and informs its connections, agents, and channels of them, or of why they could
  not be reached; it lists them again when one of the three asks. It keeps the window's width, which
  the root gives it as it opens and informs it of when the width changes (`informViewport`); once the
  sidebar is in place, from `Desktop`, it closes the drawer, so a window that grows past 64rem while
  the drawer is open gets its sidebar back. It reports when the person leaves it and when they ask
  to sign out.
- The root, `composition.ts` with `model.ts`, `message.ts`, `init.ts`, `update.ts`, `subscription.ts`,
  and `view.ts`: the page the person is on, signed out at the form or signed in with their account,
  workspaces, and the one open, the width of the window, and the time now. Signing in lists the workspaces; signing
  out, from the workspace list or from the open workspace's sidebar, which asks the root, is one step
  in `composition.ts`, and its command, `command.ts`, forgets the session, the person's stores, and
  their sync identity first, so it works offline, then removes the browser's sync key and ends the
  session as far as the host can be reached. The width is the design's `Viewport` (`Phone`, `Tablet`,
  `Desktop`, or `Split`), which a view that changes with it cannot leave to CSS. It starts from the
  flags, `flags.ts`, which read the session kept from the last visit and ask `window.matchMedia` the
  design's `viewportQueries`: the runtime processes no Message until the first render has painted, so
  a subscription alone would paint the desktop layout on a phone before correcting it. The
  subscription `WatchViewport`, in `subscription.ts`, keeps it current: it follows the three queries,
  drops a width that did not change, and sends `ChangedViewport`, whose update sets the width and
  informs the open workspace of it, and a workspace opened later starts from the width the root has
  then. What the clock decides, such as which day a time falls on and how long ago it was, needs the
  time now, which enters the same way: the flags read it with `DateTime.now`, and the subscription
  `Tick` sends `Ticked` each minute (the first at once, a moment after the flags read it), whose update sets it.
  The subscription `OpenSearch` follows Control+K, or Command+K on an Apple platform, also from a
  field, and sends `PressedSearchKey` while a workspace is open, which the update asks the workspace
  to open its search for; with none open the key is left to the browser. Nothing acts on the time, so it goes no further than views: the root's view gives the open
  workspace's view the time now beside the email, as a view input and not a message, and the page
  gives it on to the inbox and the open group, the destinations that show ages and days. `entry.ts` assembles the application over `services.ts`, which supplies the stores, the
  session, and the browser's services beneath them.

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
of each status and the choices of a status to narrow them to, is the threads feature's Tasks tab's and
the tasks feature's, which adds a column for the group.
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
  replica lacks is left out, since it could not be opened), `inbox` the person's notifications with
  the threads they come from, which the store
  shows each by the message its activity is about, `thread` what a thread holds, with its task
  and turns, `group` a group with its admissions and the person's follow of it, `groups` every group
  the replica holds with how many members it has, a team's admitted ones, which a removed
  admission leaves out, and a conversation's own, and `grants` what
  the person may do, resolved by core's `GrantResolver` from their active assignments and the
  workspace's roles; the store reads each through `overlay`, and offers each turn's retry by core's
  `Turn.whyNotRetryable`, from where its agent stands among the thread's turns, by
  `TurnStore.latestOf`, and who takes part in it. `get` and `getActions` read a record and the
  actions once, for an action being written.
- `search(query)` is an Effect and not a stream, since a search runs when it is asked: it reads the
  groups, the members, the threads, and their messages once, as the person's unfinished actions leave
  them, and `findMatches` decides what has the query in it. It gives `SearchResults`: the groups whose
  names, as the person reads them (a conversation by the other members), contain it; the threads
  whose title, or whose opening message's words, a mention as the member's current name, contain it,
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
browser's storage. Each Block's tests sit beside it:

- Story tests drive a Block's update: the thread read through its latest activity, once, its title
  and messages changed from what was seen, following and unfollowing, typing said once while a reply
  is written and stopped once it is sent, and why a write could not be kept; a task made and changed
  from what was seen, unless nothing changes; a thread's turns stopped while they are active and run
  again only when nothing else keeps them from it, and a turn's log followed from showing it until
  the turn ends or the person hides it, passing over another turn's, and followed again after it
  could not be; a thread started from the composer, a task started on the Tasks tab, the tab and the task
  filter chosen, the thread picked, and the tasks of a group's threads kept to a status and a search and
  ordered, and counted while open; a composer filling in its
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
  one opened in its place, newest first, as its tab chooses, opening the thread of a notification,
  which writes it seen only while it waits, selects it, and reports it, opening none for a notification
  from no thread, moving the selection to the next one opened, clearing it with Close and reporting
  that, or as its parent asks and reporting nothing, finding the group the thread is in, marking all through
  the newest that waits while the thread stays open, and why a write could not be kept; the tasks keeping the tasks and
  the people they are told of, or why they could not be read, telling the tasks in triage and the open
  ones apart and counting those in triage, keeping those a status, an assignee, with Me the member the
  Block is made for and No one a task with none, and a search keep, latest active first, however they
  are given, leaving out the status for a list that has no choice of it, and reporting the thread of
  the task picked with its group; the connections keeping the integrations the page
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
  the inbox, the tasks in triage, every open task, the groups to browse, the connections, the agents, the settings, or the channels in its
  place with no group marked, and opening a group from the groups to browse, going home from a group or a destination, handing the settings and the channels what the
  person does in them, keeping what the tasks were narrowed to between Triage and Tasks, opening a
  task's thread in its group, and a notification's beside the inbox, which stays, naming the thread
  open in the group open or beside the inbox, opening the navigation drawer, closing it as its dialog asks and by every navigation, and
  asking the root to sign out, and taking the window's width, closing the drawer once the sidebar is in
  place; the thread opening the side pane's dialog where the pane is one, from a notification, from a
  task, from a thread picked in the group, and as the window narrows, and not beside the main pane; its dialog closing
  with the thread, with every navigation, and as the window widens to `Split`, which leaves the thread
  open; the thread closing as its dialog closes by itself, below `Split`; the thread beside the inbox
  closing with every navigation that leaves the inbox, so that coming back shows none; and
  the root signing in a step at a time, listing the workspaces, opening and closing one, signing out,
  from the list or from the open workspace, and following the window's width, for the workspace it
  opens too, and keeping the time now from the flags and from each minute's report, which informs no
  one. The commands that write a message's text run their handlers over `test/recordingStores.ts`, a
  `Stores` whose store keeps what is written: a thread, a reply, an edit, and a conversation written
  with the members their text mentions, and with none when it mentions no one.
- Scene tests drive a Block's view as a person does: a thread's messages by their authors' initials
  and names and their times, the opening first, how many replies follow it, a reply on its way, an
  edited one, a mention as a chip with its member's current name, a deleted one, the message highlighted drawn current and none otherwise, who types, a reply written and sent, the title renamed from its form, and a message
  edited from its form and deleted by the person who wrote it; a group's threads as messages by the
  author of their opening, their time, a mention in the opening as a chip, who replied and how many
  times, how much is new and where their task stands, the one open marked as current, the thread picked reported, why they could not be read, and a thread started
  from the composer, whose box is named for the group; a group's tabs, Tasks counted while any task is
  open and chosen to show the tasks as rows by their assignee, title, who started them, replies, status,
  and age, latest active first, narrowed by status and by search, saying there are none yet or that none
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
  what waits counted, and an empty All saying there is nothing yet and an empty Unread saying all is
  caught up, only once the thread is closed; the inbox's side pane, titled by the thread under the
  group it is in, with the message the notification is about drawn current, the reply composer in
  its footer, closed by its Close or its Back, and absent while no thread is open; the tasks in triage as a main pane titled
  Triage, and every open task as one titled Tasks, each task by its group, its assignee's initials,
  who started it or the contact who did, its replies, where it stands, and how long ago, as a row
  under the labels of its columns, on its way while its thread is being started, listing the tasks in
  triage alone, or those neither done nor dismissed, latest active first, narrowed by an assignee, by
  a status of an open task, which Triage has no choice of and ignores, and by a search, in any case,
  and together, saying there are none to triage, no open tasks, or that none match, why they could
  not be read, and opening a task's thread by its row; the connections added by an owner
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
  be read; and a workspace on the shell: counting what waits beside "Inbox", and the tasks that wait
  beside "Triage", whichever destination shows, then showing the inbox, the tasks in triage, every open
  task, the connections, the agents, the settings, or the channels, which
  it reads whichever destination shows, each in a main pane named for it, with the rail marking the
  destination open, Home from the inbox, the tasks, and the groups too, and the sidebar marking Triage
  or Tasks while it shows, the groups to browse opened from the
  sidebar's button, from an open group and its thread, and from the drawer, which it closes, with
  a group opened from its row and a team started from Create group, also at `Phone` where the sidebar is
  in the shut drawer, the sidebar naming the workspace with
  who is signed in and the way out in its footer, the group's threads as messages in the main pane
  with the composer to start one, the thread picked opened in the side pane with its messages and the
  composer to reply, marked in the list and under the group in the sidebar, the group's settings
  opened in a dialog from its main pane, the sidebar in place with no Menu button from `Desktop`, the
  Menu button at `Phone` opening the drawer as a dialog named Navigation that holds the rail and the
  sidebar, its scrim closing it, or a link of the sidebar or the rail, a group picked among them,
  closing it, the thread picked opened beside the main pane at `Split` with no dialog, and below it in
  a dialog named Thread that holds the pane, closed by the pane's Close, by its Back on a phone, or by
  the scrim, which also closes the thread, a notification's thread opened the same way beside the inbox,
  which stays with its row current and loses both as the thread closes or the person leaves the inbox,
  and what the server refused as toasts, over the shell and
  inside the side pane's dialog while it is open, and the connections listing the integrations
  again after the host could not be reached. The root's own scenes show
  the open workspace with no header of its own, signing out from its sidebar, its Menu button
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
  assistive technology, opening in a dialog from it and, at `Phone`, from the drawer over the
  drawer, and a group found opening and closing the search. The root's show the key that
  opens the search opening it in an open workspace and doing nothing before one is open. A scene opens and closes
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
  them; the groups listed with their members, a team's counted by its admissions, one removed no
  longer counted, and a conversation's by the members it was made with, before the server has them
  and after; an invitation by address reaches that address's account, and a role change becomes the
  server's under the ID the browser gave it; and another member's reply reaches the person's
  inbox, which reading the thread settles at once and then on the server; and a thread made a task
  and changed shows at once and becomes the server's, while a change from a stale value comes back
  refused, and a thread started as a task shows its task in its group's list at once in triage and then as the
  server made it, and a task in each of two groups lists with the name of its group and the replies its
  thread has, as it is written and once the server has it; and a connection added over HTTP, to an integration the test host installs, reaches the
  store, and its rename and removal show at once, then as the server made them; and an agent added
  in the browser, with its membership, role, and admission, comes back as the server's under the
  IDs the browser gave them; and a channel added in the browser is the server's under the same ID,
  and its move shows at once; and the settings' reads, as the settings Block reads them together,
  give the owner the workspace with its members, roles, assignments, and invitations, and the grant
  to rename it; and a search finds a team, a thread, and a conversation the person started, and
  the member they are with, before the server has them and after, whatever the case or accents of
  the query, and not the person themselves. `Store.viewTurns` is
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
  times fixed on the clock of the machine the tests run on, and of how many replies a thread has, and a count with the word for one or many, whether a thread's title or opening has the letters searched for, and which statuses leave a task open, and the runs of a text and of a message and of a thread's row,
  a mention as "@" and the member's current name or the name it recorded, and the rest of the
  markdown as written, and `settingsForm.ts`: the fields an
  integration's form gives, a draft from its defaults or a connection's settings, and the settings a
  draft makes, and `agentSetup.ts`: an agent's draft, and the configuration a draft makes. `Drafts`'
  tests keep a draft for each place, the last one written, through being closed and opened again.

`bun run --filter @amends-dev/app-v2 build` bundles the app, which CI builds too.
