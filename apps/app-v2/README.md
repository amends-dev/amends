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
a Jump to for the workspace's pages, groups, people, agents, and threads, from the rail, the sidebar, or the
keyboard;
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
or filter that finds none, except in the lists of tasks, which say it in a quiet line as `apps/ui` does, `came-apart` for what could not be read, and `lost-thread` for what is gone or out of reach
(a host that cannot be reached, an agent, connection, or member that is not there). A list read for the first time
shows the design's `loadingRows` under a line, "Loading agents…" or "Loading connections…", and a pane or a page
shows `loadingLine`, "Loading your inbox…", "Loading settings…", "Loading the conversation…", "Loading agent…", and
"Loading connection…"; a destination's first read that failed says why in the place of the list, "Couldn't load
agents", "Couldn't load connections", "Can't load your inbox", with a Try again, as the settings have, that forgets why
and reads again (`ClickedTryAgain`, which raises the Block's `reads`, the dependency that restarts its subscription, and
shows the loading rows or line until the read answers).
A turn's state is the design's
`turnStatus`, which carries the logo moving while the turn waits (`thread`), runs (`working`), or stops (`tug`), and a
check, a warning, or a dash once it ended. The open workspace is on the design's shell: `page/workspace` renders `shell`, `rail`, `sidebar`,
and the pane of each destination (`page/workspace/home` renders Home's sidebar, main pane, side pane, and dialogs from its children's views), `feature/groups`, `feature/agents`, and `feature/connections` render the sidebar's sections of their destinations and the modals they open, `feature/groups` the pane where the
groups are browsed, as a table of the design's `directory` rows under its `columns`, and the modal where
a team or a conversation is started, `feature/search` the palette where the person jumps to anything, `feature/group` the main pane, the modal of its settings, and the side pane, `feature/actions` the toasts, and every destination's view wraps
its content in its own `pane`. The panes that read or are filled in, the settings, the connections,
the channels, and the side panes, keep the `paneColumn`'s measure; the panes that list, the agents, the group's
threads and tasks, the groups to browse, the inbox, and the tasks' Triage and Tasks, pass it `isWide`,
so that a list spans the pane. Inside the group's panes, the threads, the thread's messages, and the
composers are the design's `message`, `divider`, and `composer`, in a `messageList`, with a person's
initials and when a message was, by its time of day today and by its day before, from `src/seen.ts`,
which also groups what has a time by the day it was (`groupByDay`, under a `divider` each) and says where a
group is: its mark in a list (`groupMark`), as a line says it, `#general` or the others in a conversation
(`placeName`), and as a side pane's subtitle (`sideSubtitle`, and `reasonSubtitle` for the inbox's), and which
draws a task's status (`statusShape`) with the design's `taskStatus`.

A message's text is markdown as the person wrote it, and a mention in it is a link to the member,
`[@Ada](member:<id>)`, labelled with the name they had when mentioned. Wherever a message's text is
shown, in a thread, as a task's description, in a group's list of threads, and in the inbox, `seen.ts` hands the
design the markdown with the members its mentions may name (`messageText` and `threadText`, which are a `MessageText`
of the design's `message` module) and the design shows it as `apps/ui`'s `RichText` does: paragraphs, emphasis, code,
quotes, lists, tables, and links, a mention as a chip of "@" and the member's current name among the members the view
has, or the name the mention recorded while they are not among them (see the design's `richText`, where `marked` lexes
the markdown; this app imports no markdown library). A thread's messages and a task's description show it as blocks.
A row that is a button, a thread in the group's list, and the text of a notification, show it as the preview, one run
of its words and mentions, since a button holds no block or link. A thread's title is not markdown and shows as it
was written. The form that edits a message shows its text as written, mentions too. What a title or a search reads of a
message is its words without that syntax, a mention as "@" and the member's current name (`messageWords` and
`threadWords`, by the design's `messageTextWords`, which `richTextWords` gives the markdown's words): a title taken
from a thread's opening (`titleOf`), in the pane's header and under the group in the sidebar, and what a search for a
thread's words matches (`threadContains`, and the store's `listJumpTargets`), so that `**` and a link's address are
never found. Every write of a message's text, a thread's opening, a reply, an edit, and a conversation's
first message, says whom the message addresses by the mentions in its text (core's
`ThreadMessage.mentionedIn`, each member once).

The person writes a mention in the composer by typing "@" and some letters of a member's name, and
picking the member from a list that opens over the box, which writes the link in their place and a
space after it. Enter sends what the composer holds and Shift+Enter adds a line, as in `apps/ui`; with the
list open, Enter picks the highlighted person, as Tab does. The keys of an input method that composes text, such as the
Enter that confirms a conversion, neither send nor pick nor add a line: Foldkit's key handler is given a key and its
modifiers and not whether the event is composing, so `inputMethod.ts` keeps those keys, for as long as the app runs,
from every handler of the page. A send that is refused comes back later, from the server, and the text is not
put back in the box, as `apps/ui` keeps the draft of a send that failed. Foldkit's builder gives a handler the key pressed and the value of the box, and nothing
gives the caret, so the composer finds it from what the person typed, the end of the text that differs from the text
before, and reads the mention being typed up to it, an "@" at the start of the text or after a space and the letters after it
with no space among them, so a mention typed in the middle of the text is suggested for too. What a box shows of a
mention is its member's name with an "@", and the box is the text, so the mention is a span the Block keeps of that
text (`src/mentions.ts`), written as a link when the text is kept, reported, or sent, so a draft read from the
browser, or a message loaded for editing, shows the names. A link written by hand still addresses its member, since a
write reads the text. The textarea that edits a message shows its mentions the same way, as names, keeps and drops them as
the composer does, and writes them as links when saved, but suggests no one; it is not the composer. When the person removes a mention whole from the textarea of an edit, the
caret moves to its end, since that form sets no selection.

The composer's toolbar named "Formatting" writes markdown, because the box holds the markdown a message is rendered
from: Bold, Italic, Strikethrough, Link, Numbered list, Bulleted list, Quote, Code, and Code block (`src/feature/composer/format.ts`).
A button reads the selection through a command, which runs before the render commits, and the answer is formatted by a
pure function of the text, its mentions, and the selection: an inline format wraps the selected words in its markers,
leaving the spaces at the ends outside, or takes the markers off when they are just outside the selection or its first
and last characters, and with nothing selected writes the markers twice with the caret between them; a list or a quote
puts its marker on each line the selection touches, numbering a list in order, leaves the empty lines of several alone,
replaces the marker of the other list, and takes the markers off when every line has them; the code block puts fences
on lines of their own, or takes them off. A second command selects the text after the render commits, on what was
formatted, or at the caret where the person goes on writing, since setting a box's value moves its caret to its end. The
keys are `apps/ui`'s, Control or Command with B, I, Shift+X, Shift+U, Shift+7, Shift+8, Shift+9, Shift+C, and
Alt+Shift+C, which the buttons name as `aria-keyshortcuts`. A view does not know which of Control and Command is the platform's,
so either asks. The buttons are not pressed: nothing gives the formats that apply at
the caret, since the selection is read only when asked, so a button would show what it did not know. A link writes
`[text](url)`, "link" for no selection, with the address selected for the person to type in its place, and has no form
that asks for the address as `apps/ui` does. The button "Formatting", beside Send, shows and hides the toolbar, and
is pressed while it is shown; the toolbar starts hidden in a window as narrow as a phone's (`isFormattingShown`), which
each composer follows through its own subscription `WatchViewport`, until the person chooses, and then keeps
their choice. The keys work while the toolbar is hidden.

A draft that is only a slash and some letters, `/fol`, lists the slash commands the composer's holder offers, as
a list named "Commands" in the look of the mentions' list, each row its name, such as `/follow`, and what it does after
it, such as "Follow #general to take part in its new threads" (`slashQueryAt`; `OfferedSlashCommand`, the view input
`commands`, none unless given). The letters narrow the list to the commands whose name starts with them, whatever their
case, and the arrows, Enter or Tab, and Escape work as they do for mentions. A slash later in the text, after other
words or a picked mention, or a draft that is read, lists nothing. Picking a command does not send the draft: it empties
it, as sending does, and the composer reports `RanSlashCommand` with the command's name, `follow`, `unfollow`, or `rename`
(`SlashCommand`), for whoever holds it to do. With no command offered, or none that fits the letters, the draft is a
message like any other and Enter sends it. Only the group's composer on its Threads tab is given commands, as in
`apps/ui`; a reply, a conversation, and the Tasks tab, which starts a task, are given none.

The task a thread embeds is the design's `properties`: its status, assignee, and priority are
`propertyMenu`s under their captions, or `propertyValue`s for someone who may not change them. The
turns its timeline embeds are the design's `turnRow`s, each its agent's mark and name with a `turnStatus` for how it
stands, its buttons, and what it says under its line, or, for a turn that replied, View turn log among its reply's
actions. A turn's log is the side pane, made of the design's `turnLog` pieces. The inbox has `paneTabs` of Unread and All, which counts those waiting, none too, under its title, with the workspace's name under the title
on phones (`phoneContext`), and lists its
notifications as `notification`s in a `messageList`, under a `divider` for each day, its label before the rule that runs on, each its
author's initials, on their tone, and name and what they did, its place, its text, which opens the thread, how long
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
`settingRow` each for the visibility and the person's membership, with Leave group or Join group as its action; the
Members tab is the design's `memberPicker` over its Add button, the `memberCount`, and a `memberList` of each member's
28px mark, name, and a note of You, Agent, Online, or Sending…, and on a phone the picker is a wide button that moves the
modal to its own Add members view, a `memberPickerList` under a Back button.

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

- `feature/composer`: what the person writes at a place, a reply in a thread, a new thread in a
  group, or the first message of a conversation not yet started, kept as a draft in their browser until they send it. It reports what it sends, and that
  its text changed. Its view takes what the box shows while it is empty, which also names it ("Message #general",
  "Message Bob", "Reply in thread"), and the workspace's members, and is the design's `composer`: its button is named
  Send and is unavailable while the draft is empty or only spaces, and Enter sends it. Sending clears the box at once and the
  write is held as the store holds any action, so Send has no state of its own for a message on its way, which `apps/ui`'s
  composer has because it keeps the draft until the send succeeds; a draft of only spaces sends nothing. While the
  caret is at the end of a mention being typed (`mentionQueryAt`: an "@" at the start of the text or after a space and
  the letters after it, up to the caret), the Block lists up to eight of the people with a word of their name starting
  with its letters, whatever their case or accents, other than the person and the removed, in the members' order
  (`suggestMembers`), as a list named "People to mention", each with their mark at 22px in their tone, an agent's
  lilac (`memberMark`), and the view hands the design's list the keys: the arrows move the active
  suggestion around the list (`MovedSuggestion` carries the index the view counted), Enter or Tab picks
  it, and Escape dismisses the list (`DismissedSuggestions`) until the letters change. A draft read as the place opens
  opens no list, and neither does a name already picked. A picked mention shows in the box as "@" and the name, "@Sara
  Lind", in place of the letters typed, and a space follows it, as typing does; the Block keeps which spans of its text
  are picked mentions (`mentions`, from `src/mentions.ts`) and writes each as `ThreadMessage.mentionText`, the link
  `[@Sara Lind](member:<id>)`, in what it saves as the draft, reports (`ChangedText`), and sends (`SubmittedText`), so
  that the draft, the report, and the message stay markdown and what the person sees is the name. A draft read, or a
  message loaded for editing, goes the other way: each mention link shows as its name, and its span is kept. A span
  moves with the text written before it and stays while the text after it changes; it is dropped, leaving its words as
  plain text, when an edit reaches into it or when letters are written against it, which run it on into another word;
  and Backspace just after it removes it whole: an edit that deletes a mention's last letters, by what differs between
  the text before and after (`editedText`), takes the rest of the mention with it, and the caret is put where it was
  (`SelectText`). Where the caret is is found from the same difference, the end of what the person typed, since no
  handler of the builder gives it; the button "Mention someone", beside Send, reads the selection instead
  (`ReadSelection`, which no render has changed yet) and writes "@" there in place of what is selected, after a space
  unless the text before it is empty or ends in one, opens the list for it, and puts the caret after it. A command
  that sets the box's value moves the caret to its end, so the Block sets the selection after the render commits
  (`Render.afterCommit`, in `SelectText`), and no timer is used. The toolbar of formatting is the design's `formatting`,
  one button for each format with the keys that ask for it, and the button "Formatting" beside Send shows and hides it
  (`ClickedFormattingToggle`; `isFormattingShown`, from the person's choice and the window's width, which the Block's
  subscription `WatchViewport` keeps current); a button reads the selection (`ChoseFormat`, `ReadSelection`) and the
  answer is formatted by `applyFormat` in `format.ts`, which says how each format writes its markdown, and the Block
  keeps the draft and selects what was formatted (`SelectText`). A draft that is only a slash and letters lists the
  slash commands the view is given (`commands`, none unless given) as the list "Commands", and picking one
  (`PickedSlashCommand`) empties the draft and reports `RanSlashCommand` in place of `SubmittedText`.
- `feature/thread`: a thread as the person reads and takes part in it: its title and messages, their
  part in it, how far they have read, who types there, the task it tracks, its agents' turns, and a
  composer to reply. They rename it, edit and delete their own messages, and follow it or stop;
  reading it marks it read through its latest activity, once for each. The reply composer's changes
  say the person types, at once, then at most as often as typing lasts, by core's
  `Presence.typingRepeats`, and sending says they stopped. It has two views. `view`, its canonical
  one, is the body of a side pane, which takes the time now as its view input, and, optionally, the
  id of a message to highlight (`highlightedMessageId`), which it draws as the current row and scrolls to the middle
  of the pane when the row is drawn (the `RevealHighlightedMessage` mount, on the row alone), so the person sees what a
  notification was about, and the group gives none. For a thread that tracks no
  task it is a section named Thread: Rename, the form to rename it while the person does, the task
  (making it one, where they may), then its timeline as a list under a `divider` for each day it happened on by the
  person's own clock (`groupByDay`, named as `dayLabel` names it): the opening first, how many replies follow it,
  and the replies, the agents' turns, and the notes of who followed the thread or stopped taking part in it after it,
  in the order they happened (`timeline.ts`, `timelineOf`, which orders what happened at one moment so that a turn
  follows the message that asked for it and a note follows what it came after). Each message is by its
  author's initials, name, in their tone (the slate ground for a person, the lilac for an agent, whose name is in the
  agent's color), and when it was published (`timeOf`: its time of day, since a divider says its day), with
  "Sending…" after it, its text as markdown with each mention a chip (`messageText`, by the thread's members), or
  "Message deleted" in muted italics for a deleted one, " (edited)" quietly after the text of one that was edited, and
  Edit and Delete on the person's own, which the form to edit it replaces while they
  do. A turn is an entry at the moment its agent took on the work (core's `Turn.createdAt`, the time of its
  `turn.created` activity, which a retry gets of its own), drawn by the turns Block as a row, one embedding of its
  view for each turn, whose input is the turn's id; a turn that replied is its reply instead, found by the
  messages its `messageIds` name, which have View turn log among their actions, so a turn shows as a row only while
  none of its replies is among the thread's messages. The log of a turn, from its row or from its reply, is not drawn
  among the messages: it is the side pane, in place of the thread (`turnLogView`, for the group and the inbox to show
  while `hasTurnLog` says the person follows one), and Back to thread returns to the thread at its end. Why the turns could
  not be read shows above the timeline. A note is a quiet line of the design's `note` with the time it happened,
  its full date and time as its title (`fullTimeOf`), from the thread's activity in the replica (the store's
  `deriveParticipationChanges`, by the member whose part it was; the person is "You"): "Sara followed this
  thread", "You stopped following", "Sara left the group", "Sara was removed from the group", "You were removed
  from the workspace" (`noteOf`). Joining a thread by writing in it or being mentioned in it records no activity of
  its own, so it has no note, and a note is not a reply. Who else types shows in a live region under it: "Ada is typing…", "Ada and
  Bob are typing…", and "Several people are typing…" for three or more (`typingLine`). For a thread that tracks a
  task it is a
  section named Task, laid out as `apps/ui`'s task pane is: Rename, which `apps/ui` has no place for
  and so stays at the top of the body, the task's properties, a "Description" caption over the
  thread's opening, which is the task's description, with Edit and Delete on the person's own, and under an
  "Activity" divider the line "Alice created this task · 12:01" and the replies and the turns as they happened, with
  no divider to name a day, so that a time that was not today names its day (`whenLabel`), and who types. `apps/ui` links a task to the discussion it came from ("View original
  discussion"); this view does not, since a thread names the thread it was derived from only in
  `Thread.origin`, no thread the app starts has one, and the link would have to ask the page to open
  another thread from inside a side pane. It shows no title, which the pane's header has. `followView` is the bell for that header, as
  `apps/ui` draws it: an outlined bell named "Follow thread", or, while the person follows, a filled
  one named "Following thread" and pressed, which stops following, and disabled, as it was, while a change
  is on its way. `replyView` is the reply composer, named and shown as "Reply in thread", for the pane's footer, which
  suggests the workspace's members the thread has read. A thread that tracks no task keeps its messages at their end, as
  `conversationScroll.ts` does (below): its list has the id `thread-messages-` and the thread's, the `ScrollMessagesToEnd`
  Command scrolls it to its end as the thread opens, unless a message is highlighted, which the person came for, and,
  from then on, when a message or a note is added while the person was near its end. `sidePane` puts the three into the design's
  side `pane` for the group and the inbox alike: the pane is named Thread, or Task for a thread that
  tracks one; the header has the thread's title, or its first message's words, before a message icon
  or the task's status drawing, a subtitle (the group's, or the inbox's own), Back, named for where
  it goes back to, such as "Back to Design", "Back to Tasks", or "Back to Inbox", before the title on
  a phone, and the bell and Close thread, or Close task, after it. The pane's body is anchored to the bottom for a
  thread that tracks no task, so that a short conversation rests against the composer, and to the top for a task,
  whose activity reads from the top, as `apps/ui`'s timeline has it. The thread tells whether it is shown as the group
  tells it for itself (`availabilityOf`): it is `Loading` until the store has answered its first read
  (`isLoaded`), `Available` once the answer held the thread (`hasThread`, which the store's `thread` read gives from
  the replica's thread), `Unavailable` once it answered without it, as it does for a thread in a group the person no
  longer belongs to or never did, and `Failed` when the read failed before it answered. Until it is shown the body
  says so as `apps/ui` does: "Loading the thread…"; "This thread isn't available" over "It may be in a group you
  no longer belong to."; and "Can't load this thread" over "Try again once the host is reachable." with a Try again
  that reads it again (`ClickedTryAgain` clears why and counts `reads`, which the thread's read depends on, as the
  inbox's and the group's do). A read that fails after the thread was held keeps showing it, with why above it. The
  side pane leaves out the bell while the thread is not shown, since it would say whether the person follows a thread
  they have not read, and the composer when it is not available, as `apps/ui` leaves it out, and keeps it while the
  thread loads or could not be read, as `apps/ui` does.
- `feature/task`: the task a thread tracks: its status, assignee, and priority, which the person
  changes from what they saw, when they may, assigning an agent only when they may use it; or,
  while the thread tracks none, making it one, when they may create tasks in its group. Its view is
  a group named Properties, as `apps/ui`'s task pane has its properties: Status, Assignee, and
  Priority, each a quiet menu under its caption, named "Status: Triage", "Assignee: Unassigned", and
  "Priority: No priority". The status shows its drawing (`statusShape`, the design's `taskStatus`),
  and its menu lists the six statuses, each with its drawing; the assignee shows the person's mark
  and name, or the users icon and "Unassigned", and its menu (`AssigneeMenu`, from `taskFilter.ts`,
  `assigneeProperties`) lists Unassigned, then each person the task can go to with their mark, and
  the current assignee by name alone when the person could not choose them, such as an agent they may
  not use. Priority is a third menu after Assignee, which `apps/ui`'s task pane has none of; Held and
  Dismissed have drawings `apps/ui` lacks, since its `TaskStatus` has only triage, open, progress,
  and done. Each menu is a Foldkit `Menu` Block the Block binds (`StatusBinding`,
  `AssigneeBinding`, `PriorityBinding`, with the ids `task-status`, `task-assignee`, and
  `task-priority`), and choosing from it changes the task from the value the person saw, unless
  it changes nothing, so the Block has no message for the choice. For someone who may not change
  the task the same three are read, each caption over its value. A line says "Sending…" under them
  while a change is on its way. The thread embeds it.
- `feature/turns`: a thread's agents' turns, each as its row where its agent took on the work, with its agent by
  name and how it stands, and the log of one of them as the side pane. The person stops a turn while it is active and
  retries it once nothing but who may direct its agent keeps it from running again, when they may use that agent, by
  core's `Turn.directRequirement`. They follow a turn's log, which opens with its items and then grows as the turn
  writes it, until the turn ends, or until they go back to the thread or it could not be followed, which says why and
  offers to follow it again; one log at a time. The row's views take the id of a turn as their input, and the thread
  embeds them where it places the turn. `view` is the turn's row, as `apps/ui`'s `TurnRow` draws it, a group named for
  the agent's turn, "Atlas's turn": the agent's mark in its tone, its name in the agent's color, and its state as
  `apps/ui`'s `TurnStatus` words and marks it (`stateOf`: "Queued", "Working", "Stopping…", "Completed" with a check,
  "Failed" with a warning in the caution colors, "Stopped" with a dash, the logo moving while it is queued, working, or
  stopping), then its buttons: View log, quiet, which opens the turn's log in the side pane; Stop, the secondary button,
  named "Stop Atlas", for someone who may direct the agent while the turn is active, which while it stops is disabled
  and named "Stopping", to whoever reads it; and Retry, for someone who may direct the agent when nothing else keeps the
  turn from running again, which `apps/ui` offers as Retry too. Under the first line, a finished turn says
  (`endingOf`) why it failed, with Agent settings after it, a `lineButton` as `apps/ui`'s link is, which asks for the
  agent's page (`ClickedAgentSettings`, reported as `OpenedAgent` with the turn's agent); "Atlas stopped taking part in this thread." when its agent left the thread (core's cancel reason
  `participation-ended`), "The task no longer asks Atlas to work on it." when its task was taken from it
  (`task-changed`), nothing when someone asked it to stop, and "No reply posted." when it completed with no
  `messageIds`; "Sending…" says while a change to it is on its way. A stop or a retry that did not go through says why
  under the row as an alert, in `apps/ui`'s words (`problem.ts`, `problemText`): "Couldn't stop the turn. Try again."
  and "Couldn't start another attempt. Try again." when the browser could not keep the action (`FailedStop`,
  `FailedRetry`, forgotten when the person tries again), and, from the rejection the server wrote back, which the
  subscription reads from the store's actions (`refusalsOf`: the latest of each turn's stop and retry, left unsaid
  while a later one is on its way or was kept), "This turn has already finished." (`TurnNotActive`), "This turn is
  still running.", "This turn already replied.", "A newer turn followed this one.", and "Atlas no longer takes part in
  this thread." (the four reasons of `NotRetryable`), "You can't direct Atlas." (`Denied`), and "This turn is no longer
  available." (`NotFound`); the toast of the refusal stays beside it, until the person dismisses it, and takes the
  row's line with it. `replyActionView` is View turn log, the quiet icon button the reply of a turn has among its
  message's actions, which opens the same log. Why the turns could not be read is the Block's `notice`, which the
  thread shows above its timeline.

  `logPaneView`, given where the thread is (`where`, "Thread in #general", which the group and the inbox word as they
  word their side pane's subtitle), is the turn log as `apps/ui`'s `TurnLog` draws it, the design's side `pane`
  titled "Turn log": Back to thread, on every layout (`paneBack` with `isAlways`, since it is not the way the pane
  closes), Stop while the turn can be stopped and Close turn log in the header, and under the title the agent and how
  its turn stands. Its body follows its end (`followsEnd`) and holds, from the top: what the turn ran on, a line each
  (`summaryOf`): where it works, the model by its connection's name and its id, "Harness · opencode", and "Sandbox ·
  Daytona" or "No sandbox", or, before the turn started, why there is nothing to say; the Activity, a list of
  entries, oldest first, each with its time (`timeOf`, in full as its title) in `apps/ui`'s words (`wordsOf`):
  "Work accepted" and "Turn started", which the turn records, "Thread input received" for each input the log holds,
  the request and prior conversation for the first of the turn that began its agent's session in the thread and
  another message or "N more messages" for the rest, a response the agent recorded as a card, "Reply recorded" and
  "This response was posted to the thread." once the turn ended with a reply, "Response recorded" and "Not posted to
  the thread." until then, "Interrupted" with its reason and "Trying again." when the run goes on, and how the turn
  ended, "Reply posted", "Turn completed" with "No reply was posted.", "Turn failed" with why, or "Turn stopped" with
  whether someone asked, its agent left, or its task changed; the Queued card while the turn waits; the caution card
  "Review the agent's setup" for a turn that failed, with an Agent settings button that asks for the agent's page as the
  row's does; and why a stop or retry did not go through, as an alert. The
  footer is the first of these that fits (`footerOf`): "New activity · Jump to latest", which scrolls to the end, when
  the log grew while the person was not near its end; "Retry turn", with "Previous log stays available.", when they
  may use the agent and nothing else keeps the turn from running again; "View reply in thread", when the turn posted
  a reply; "Waiting for activity" while it is queued; "Following live" while it works or stops; and "This turn has
  finished." The pane says "Loading the turn log…" while the log opens, "This turn log isn't available" with "It may
  be in a thread you can no longer open." when the host does not have it for the person (a `NotFound` of the log
  stream, `FoundLogUnavailable`) or the thread has no such turn, and "Can't load this turn log" with why and Try again
  when it could not be followed. The turn log needs the workspace's connections to name what the turn ran on, so the
  Block reads the active ones from the store, and a connection since removed is "Removed connection".

  The pane is the turns Block's own view, not one a parent draws from the Block's state, because closing it leaves the
  thread too, and Agent settings opens a page, which have to reach the page whichever way the pane is drawn, so the
  Block reports `ClosedLog`, `OpenedAgent`, and `ReturnedToThread` and its parents carry them: the thread folds going back into
  scrolling its messages to their end (`ScrollMessagesToEnd` without `onlyIfNearEnd`, as the thread opens) and
  reports `ClosedTurnLog` and `OpenedAgent`, which the group and the inbox fold, the first into closing the thread and
  reported as `ClosedThread`, which Home already folds, and the second not at all, only reported, for Home to report
  to the workspace page, which opens the agent's page as picking the agent does (`OpenedAgent`, which resets Home
  and with it closes the thread); the thread pane is simply not drawn while a log is followed. Going back to the thread
  returns to its end, not to where the person had scrolled, as `apps/ui` remounts it at the bottom too. The app cannot
  tell apart what `apps/ui` draws as a reply draft (the log records only the steps a turn completed, with nothing to
  say that a response is still being written) or as reconnecting (the stream fails to Try again instead of
  reconnecting), so it draws neither card. "New activity · Jump to latest" is decided when the log grows (the Command
  `FollowLogEnd` measures the pane's body before the render and scrolls only if the person was near its end), not as
  they scroll, since Foldkit's scroll message carries only `scrollTop`, so it can stay on until the next arrival or a click.

- `feature/threads`: a group's threads, each with its opening message, how many messages follow it and
  who wrote them, which agents are at work in it, when it was last active, its task, whether it is still being started,
  and how much is new, and a composer to
  start one, which suggests the group's members as it is typed in. It reports the thread picked. It has
  three views, and its tab, Threads or Tasks, Threads at first, says what `view` and `composerView` show.
  `tabsView` is the tabs, a `paneTabs` named for the group, as `apps/ui` names them: Threads, and Tasks, counted by the
  tasks that are neither done nor dismissed while there are any, for the group's header, which takes the group's
  name from its parent. The other two take the group's members, its name and whether it is a team, who belongs to
  a team as its welcome names them, the thread open in it, who is present and in which thread each types, and the time
  now from their parent. `view`, its canonical one, shows the tab chosen. On the Threads
  tab it lists the
  threads as messages, oldest first by when each thread was created (core's `Thread.createdAt`, the
  moment its opening was published), whatever order the store gives them, under a `divider` for each
  day they were created on by the person's own clock, named as it is from the time now (`dayLabel`):
  each a message as `apps/ui`'s timeline draws one (`threadRow`): the opening's author, by initials and name
  ("Someone" until the members are read, and "A thread" when the opening is not read yet), in their tone, the mark on
  the slate ground for a person and the lilac for an agent, with an agent's name in the agent's color
  (`isAuthorAgent`); the time of day the thread was created (`timeOf`, "10:02 AM" under the day's divider, never
  "Yesterday" or a weekday, which the divider says), which it says before the opening is read too; and the thread's
  title as written or its opening's markdown as the message shows it, with each mention a chip (`threadText`, by the
  group's members), with "Sending…" while it is being started. An opening by the same author as the thread before it
  within the day, less than five minutes after it, stacks under it without its mark and name, with the short time of
  day ("10:02", `shortTimeOf`) in the mark's place while the pointer or the keyboard is on it (`openingStacksUnder`,
  from `seen.ts`'s `isStackedUnder`: as `apps/ui`'s `stacked` has it, neither has replies, since a thread's replies
  end a stack and start their own, and an opening not read yet stacks under none and has none stack under it). Under
  the text, the task the thread tracks as a chip, the status drawn and the thread's words beside it, named "Plans for
  the week, Triage" (`taskChip`, in place of the status word the row used to say), then the button that opens the
  thread: while it has replies, "4 replies" (`repliesLabel`) with the marks of those who replied in the order of their
  first reply, a person's on the slate ground and an agent's on the lilac, and a dot, named ", unread" in the button's
  name, while any activity is past the person's position; and while it has none, "Reply in thread", which shows where
  there is no pointer to hover and, where there is, stays only beside what is going on in the thread. A hovered or
  focused thread also offers the reply as an action, "Reply in thread" in a group named "Message actions". The three
  buttons open the thread, say whether it is open (`aria-expanded`), and are described by its words (`threadWords`).
  After the count, or after "Reply in thread", come what is going on in the thread: the agents at work in it, "Yumi
  working", "Atlas queued", or "Scout stopping" (`ThreadItem.working`, read from the thread's turns that are queued,
  running, or being stopped: `agentsAtWork` and `workingLabel` in `agentActivity.ts`), and who types in it besides the
  person, "Ada is typing…" (`typingNames` and `typingLine`, from the `present` the group's Block reads and gives
  `view`); the thread open is the current row. The list has the id `group-threads-` and the group's (`threadsListId`) and
  rests against the composer while the pane shows a conversation (`showsConversation`: the Threads tab, read, with any
  thread), which the group's pane anchors to the bottom. The `ScrollThreadsToEnd` Command scrolls it to its end the first time
  threads are read and whenever the person chooses the Threads tab, and, when a thread is added, only if the person was
  near its end before it (`onlyIfNearEnd`), so that scrolling up leaves them where they are; a read that adds none, and
  the Tasks tab, scroll nothing. Until the store has answered (`isLoaded`) the tab says "Loading the
  conversation…", and once it has, a group with no thread welcomes the person, "Welcome to #General" for a team and
  "Your conversation with Bob" for a conversation, with "Send the first message to start the conversation." and the
  caret blinking. A team's welcome says who belongs to it first, "You, Alex Morgan, and Sara are members." as
  `apps/ui` words it, with `Intl.ListFormat` (`membersLine`): the person as "You" and first, then the others by name in
  the order of the admissions, and "You are a member." for a team of one (`apps/ui` would say "You is a member."); a
  conversation's welcome lists no one. When the first read failed (`isReadFailed`: not loaded, and why in `notice`),
  either tab says "Can't load this conversation" with "Try again once the host is reachable." and a Try again
  (`cantLoadConversation`) in place of the loading line, which `ClickedTryAgain` replaces again while it reads: it clears
  the reason and raises `reads`, the dependency that restarts the subscription. A read that fails after the threads were
  read leaves them and says why above them. On the Tasks tab it is the threads that track a
  task as a table, in the order the person chose, latest active first by `lastActiveAt` at first: under a toolbar, the
  threads Block's `toolbarView`, which the group's pane draws over the rows while the tab is open, as `apps/ui`'s
  `GroupTasks` has it, of a search field, whose label is hidden and whose placeholder says "Search tasks…", beside a
  menu of the status (`StatusFilterMenu`), Any status or one by its name (`statusLabel`), named "Status: Any status",
  and a menu of whom a task is assigned to (`AssigneeMenu`), Anyone, Unassigned, then each member still in the
  workspace by name with their mark at 22px, named "Assignee: Anyone", both the ones `taskFilter.ts` gives the
  workspace's Triage and Tasks, whose buttons say Status and Assignee while they narrow to nothing, Unassigned for the
  tasks of no one, and the member's name for theirs, and, at its end, a menu of the order (`TaskSortMenu`), Latest activity, Newest, or Oldest,
  named "Sort: Latest activity", the last two by when the thread was created, and New task, which moves the focus to the composer in the
  footer (`ClickedNewTask`, the command `FocusComposer`). Each menu is a Foldkit `Menu` Block the Block binds
  (`StatusBinding`, `AssigneeBinding`, `SortBinding`, with the ids `group-tasks-status`, `group-tasks-assignee`, and
  `group-tasks-sort`), and choosing from it changes only the Block's own model (`taskFilter`, `taskSort`), so the Block
  has no message for the choice. A line says "Threads that track a task." with how many
  tasks the search, the status, and the assignee leave at its end, "12 tasks", over the labels of the columns, Task,
  Status, Assignee, and Activity, as `apps/ui`'s `GroupTasks` has them, and a row for each task, the design's
  `taskList` (`taskList.ts`, which `feature/tasks` draws too): the status drawn at 1rem (`statusShape`), the
  thread's title or its opening's words (`threadWords`), in medium weight and quiet once the task is done or
  dismissed, the word for the status (`statusLabel`), the assignee as a 24px mark and name, or the people icon and
  "Unassigned", and how long ago the thread was last written in (`ageLabel`), or "Sending…" in its place while the
  thread is being started; the row opens the thread as a row of the list does, and the one whose thread is open
  beside the list is drawn current. `apps/ui` has a key for each task, which a task here lacks, so the row has no
  column for one, and it has no place for who started a thread, how many replies it has, the status as a badge, or
  "Open →", which the row no longer shows. The row is named by the title and described by all else it says, "Doing ·
  Alice · 10m ago", the status word and the assignee's name included, which the row drops below 64rem and 48rem. The
  search finds the letters in the thread's title or in its
  opening's words without its markdown's syntax, whatever their case and accents (`threadContains`); a mention in it is the member's current name. With
  no task the tab says "No tasks yet" and to start one from the composer, which `apps/ui` has no words for, and with a
  search or a status that leaves none, "No tasks match these filters." in a quiet line under the labels of the columns, as
  `apps/ui` says it (`noTasksMatch`, the design's `taskListEmpty`). `composerView` is the composer to start one, for the
  pane's footer, whose box is named and shows "Message #general" for a team and "Message Bob" for a conversation
  until the person writes. On the Tasks tab it starts a thread that tracks a task, in triage: its box is named and
  shows "New task in #general", or "New task in Bob" for a conversation, which `apps/ui`'s Tasks tab has no composer
  to word. The button says Send on both. The draft is the same on both tabs. Given the slash commands to offer
  (`commands` in its view inputs), `composerView` passes them to the composer on the Threads tab only, and the composer
  reports one run as `RanSlashCommand`, which the Block passes on as it is (`forward`), starting no thread.
- `feature/group`: a group as the person has it open: its name, their part in it, its threads, and
  the thread open among them, a keyed occurrence, so opening another makes a fresh one and a late
  result cannot land in the wrong one, and its settings in a modal. It opens with a thread already
  open when its parent gives one, and reports nothing for it. It reports `OpenedThread` when the
  person picks a thread and `ClosedThread` when they close it, by Close thread, Close task, Back, or Close turn log, so its parent can
  hold the side pane in step, and `OpenedAgent` when they ask, from a turn that failed in the thread, for the settings
  of its agent; its parent closes the thread with the operation `requestCloseThread`,
  which reports nothing, since it asked. They follow a group or stop, join a public team, and, in its
  settings, rename a team, leave one, and, where they manage its members, admit several at once and remove them. The
  composer of its threads offers the slash commands of a team the person belongs to (`slashCommandsOf`): `/follow`,
  "Follow #general to take part in its new threads", while they do not follow it, `/unfollow`, "Stop following
  #general", while they do, neither while a change to their follow is on its way, as the bell is unavailable then,
  and `/rename`, "Rename #general", where they may rename the team; a conversation is offered none, as in `apps/ui`.
  Running one does what the bell and the settings' button do: `/follow` and `/unfollow` write the follow
  (`FollowGroup`, `UnfollowGroup`) and report `FollowedGroup` or `UnfollowedGroup` with where the group is as a line
  says it, for the page to confirm with "Following #general" or "Unfollowed #general", which the bell itself does not
  report, as in `apps/ui`; `/rename` opens the settings on General (`openSettings`, as the settings' button does),
  where the name field takes the focus and holds the team's name, for someone who may rename it. It
  has two views. `view`, its canonical one, is the group's main pane, anchored to the bottom while it lists threads, as
  the threads Block's `showsConversation` says, and to the top otherwise, titled by its name, with the drawing of a
  channel before it for a team and of a message for a conversation, as `apps/ui` marks them, and the workspace's name
  under it on a phone (`workspaceName`, a view input from the page), under the
  tabs of the threads Block, Threads and Tasks, named for the group, which a team the person has not joined does not have,
  with, as the header's buttons, its members as a stack of their first three marks, overlapping, at 22px in their
  tones (`memberMark`, an agent's lilac), named for how many there are
  ("7 members", for a team its admitted ones and for a conversation both people), which opens the
  settings on the Members tab, or, for a conversation, which has no tabs, on its Members, and which a phone does not
  show, as `apps/ui`'s header does not; Follow as a bell named Follow, or Following and filled and pressed while the person
  follows the group, which stops following, and disabled as it was while a change is on its way, or Join, where
  they apply; and a gear that opens the settings; and under them, on the Tasks tab, the toolbar of the tasks, and the
  tab's content, threads or tasks, with the composer to start one in the footer, which a team the person has not joined does
  not have. The group is one of four, by what the store has answered (`availabilityOf`): `Loading` until its first
  answer (`isLoaded`, set by the first `ReceivedGroup`), in which its threads list as they would for a member;
  `Available` once the replica holds it; `Unavailable` once the store has answered without it, as for a group the
  person never had or has lost the right to read, which the replica then lacks, and which differs from loading by that
  answer alone; and `Failed` when the read did, with no answer (`FailedRead`, and `notice`). An unavailable group
  keeps its title, "A group", and says "This group isn't available" with "You may no longer be a member of it." in the
  place of its threads, with no tabs, no composer, and no actions. A group that failed to load says "Can't load this
  conversation" with "Try again once the host is reachable." and a Try again, which clears the reason and raises
  `reads`, the dependency of the subscription that reads it, and keeps the tabs and the composer. The settings' dialog is a child of the Block, bound from `@foldkit/ui/dialog` and
  rendered with the design's `modal` inside the pane, titled "Group settings" with the group's name
  beside it, and closed by a Close button named "Close settings". The window's width (`viewport`, a view input from
  Home, which keeps it) decides how members are added. Its General tab holds the team's name, a field
  that is always shown, with a line under it saying who sees the name and the most it takes, 80
  characters, which only someone who may rename the team can change, its draft starting from the name as the dialog
  opens, and dimmed, with "Only people who manage this group can rename it." under it, for everyone else; the team's
  visibility as a line in `apps/ui`'s words, "Private. Only people added to this group can find it.", which nothing
  changes, since core has no input for it (`GroupService` renames a team and admits or removes members, and the
  visibility is only given when a team is created); the person's membership, "You're a member of this group." or
  "You're not a member of this group." or, for general, "Everyone in the workspace belongs to this group.", with Leave
  group for a team they belong to, except general, and Join group for a public team they do not, either dimmed while a
  change to their own admission is on its way (`isMembershipChanging`, read from the admission the replica holds as
  pending); and Save changes in the footer, dimmed unless the name is changed. Leaving keeps the dialog open, to show
  the change, and it closes of itself when the group stops being there to show, as it does for a private team the person
  left. Its Members tab, for a team, has "Add members" for someone who manages them, the picker of the workspace's
  members who are not in the team (`admissibleMembers`), with the Add button beside it, "Add" while none is
  chosen, dimmed, and "Add 2" for two, which writes **one command**, `AdmitMembers`, that runs one `GroupMemberAdded`
  action for each person chosen, in the order chosen, each its own entry in the person's store, in a single write
  session, so that a failure stops the rest and is shown as the one notice; then "N members", over a dashed rule, and the
  members as rows of a 28px mark in their tone and the name with You, Agent, Online, or Sending… after it, and Remove,
  named for the person ("Remove Sara"), where the person manages the members (`mayManageMembers`: a team they belong to,
  not general, with the right to manage members), none for themself, and dimmed while the admission is on its way. The
  picker is the Create group form's, bound as a combobox child (`MembersBinding`, id `group-admit-members`), with its
  chosen members in the model (`admitting`) and the focus taken back into its input by `FocusAdmitMembers` after a chip is
  removed. On a phone the picker is a wide button, "Add members", that moves the dialog to a view of its own
  (`isAddViewOpen`), titled "Add members" with `# name` beside it and Back to members in place of Close, which shows
  the people who can be added as the design's `memberPickerList`, always under the chips and search (the Foldkit
  combobox's list is an anchored popover, which a phone has no room for), narrowed by `admitQuery`, with a wide
  button, "Add members", "Add 1 member", "Add 3 members", that writes the same command and returns to the members; Back
  keeps who was chosen. A conversation's dialog is titled "Members" with the other member's name beside it, and holds only
  their count and list, with no tabs, no name, no visibility, and no membership, and Done. The dialog opens on General,
  and closing it, by Cancel on General or Done on Members and in a conversation, as `apps/ui` words them, Close
  settings, Escape, a click on the scrim, or Save changes, drops the draft of the name, the members chosen to admit,
  the text typed to search for them, and the phone's own view.
  `threadView` is the thread open in it as a side pane (the thread Block's `sidePane`), titled by the
  thread with "Thread in #Design" or "Thread with Bob" under it (`sideSubtitle`), or, for a thread
  that tracks a task, by the task's status drawing with "Task in #Design" under it, and the thread's own bell,
  Follow thread, beside a button that closes it, Close thread, or Close task, and, below 48rem where the pane is full screen over
  the main pane, Back before the title, named for where it goes back to, the group ("Back to Design") or, while the
  Tasks tab is shown, "Back to Tasks", both sending `ClickedAllThreads`, the thread's messages or the task's
  description and activity, and
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
  invitations' history. A Cancel is the secondary button, bordered as the action beside it is, as `apps/ui`'s is.
- Every dialog is the size `apps/ui` gives the same dialog, which the design's `modal` takes as `size`, and fills the
  window below 48rem. Regular, 40rem by 37.5rem, is the group's settings, in each of its sections, a conversation's
  members, and the view a phone adds members in, creating a group, the invitations' history, and choosing an
  integration to add a connection through. Compact, 35rem wide and as tall as its content, is creating and joining a
  workspace, each in the stage it is in once it is sent too, so that the dialog keeps its size, New message,
  inviting someone, revoking an invitation, handing the workspace over, removing a member, changing one's own name,
  removing an agent, replacing a connection's key, and removing a connection. Form, 40rem wide and as tall as its
  content, is adding an agent and configuring a connection. Wide, 45rem by 54rem, is for a long form with fields side by side, which
  `apps/ui` gives to none of its dialogs, so none of this app's is one. The palette, 40rem by 30rem and set 12vh below the top of the window, is the
  Jump to. The tests say each size by the panel's classes (`test/panelSize.ts`).
- `feature/groups`: the groups the person can see, as the sidebar's sections: the teams they belong
  to, general first and then by name, and their conversations, ordered the same way by the other members' names,
  to pick one from (`byGeneralThenName`: by name as the person reads it, in any case and whatever the accents, as
  `foldAccents` folds them, then by ID; the browse page's two tabs share this order, since they read the same
  groups, and so does the Jump to's Groups section, with `orderTargets`, so that its first five are the ones the person
  most likely wants, but not the channels' choice of group, which lists groups as the replica holds them); the public teams they may join are not in the sidebar, only on the browse page's Discover tab; and
  where they start a team, or a conversation with other members, in a modal
  over the page: a dialog the Block binds from `@foldkit/ui/dialog` and renders with the design's
  `modal`, a team as Create group and a conversation as New message, as `apps/ui` has them. Cancel, Close, Escape, a
  click on the scrim, and a conversation's submit each close the dialog, which drops what was being started; a team's
  submit waits, as the next paragraph says.
  Create group is titled "Create group", with "Set a name, visibility, and members." under the title, and has the
  `Group name` field, with the placeholder "e.g. release-planning" and at most 80 characters, which takes the focus
  as the dialog opens; the visibility, Public or Private, Private to begin with, as the design's `choiceGroup` over a
  radio group from `@foldkit/ui/radioGroup` that the Block binds as a child, with what the one chosen means under it,
  "Anyone in the workspace can find this group and join it." or "Only people added to this group can find it."; and
  the members, the design's `memberPicker` over a multi-select combobox from `@foldkit/ui/combobox`
  (`MembersComboboxBlock` in `src/memberPicker.ts`, which every picker in the app binds). The picker offers the
  workspace's other active members, people and agents, with the person themself locked in it as "You", and a hint under
  it, "You're included automatically. Add others now or later.", which counts them once others are added, "3 members,
  including you.". Picking a member adds them as a chip and keeps the list open for the next; a chip's Remove button, named for the
  member, and Backspace in the empty input take one off, and the input takes the focus again (`FocusStartingMembers`).
  The Create group button is disabled until the name holds more than spaces, and while the group is being created.
  Sending the form writes `TeamCreated` once (`CreateTeam`) with the name trimmed, the visibility, and the person's own
  member ID first among the `memberIds`, since the host admits a team's creator only when listed; a name it would refuse
  is answered with "Use 1 to 80 characters, with no invisible ones." without a write. A write returns no ID, so the
  Block learns the new group's from the store: the store lists the group as soon as the write begins, still on its way,
  and the Block finds it as the one the person made (`createdBy`) under the name sent that it could not see when the form
  was sent, as `feature/agents` finds the agent it added (`creating`: the name, the `knownGroupIds`, and whether the
  store has kept the action). Once the group is both listed and kept, in whichever order the store says so, the dialog
  closes, the group is marked in the sidebar, and the Block reports `CreatedGroup` with its ID. Until then the form
  stays with its button disabled, and a write the store could not keep says why in the dialog (`failure`) and leaves the
  form to send again. New message is titled "New message", with "Everyone you choose sees every thread in your
  conversation together." under the title, and asks only whom the conversation is with: the members picker, labelled
  "To", with the placeholder "Add someone…" and the person themself not among the choices, which takes the focus as the
  dialog opens (the picker's `attributes` carry the dialog's `initialFocus`). It is the team form's picker, one
  combobox (`startingMembersId`) for whichever form is open, so choosing, removing a chip, and the focus after it are
  the same. Under the picker a quiet line, a live region, says "You already have a conversation with them." while the
  people chosen are exactly the others of a conversation the person has (`conversationWith`: the same people in any
  order, no more and no fewer, so the conversation with Bob alone is not the one with Bob and Carol), and the dialog's
  button is Open conversation then, and otherwise Start conversation, disabled until someone is chosen. Open
  conversation closes the dialog and picks that conversation as a click on its row does, which does nothing more when
  it is the one open already. Start conversation closes the dialog and reports the people (`SelectedPeople`), since no
  conversation exists to pick, and Home opens the conversation as it will be (`feature/unsentConversation`); nothing
  is written by the dialog. A group still on its way shows "Sending…" at the end
  of its row. It reports the group picked, and its parent tells it which group is open, so the one
  marked is the one shown. Its view takes the thread open in that group, from its parent, as its title and the
  status of the task it tracks (`OpenThread`), which it shows under the group as a plain row, the drawing of that
  status in place of the icon when the thread tracks a task, with the status's word for a reader who does not see the
  drawing, "Doing, Composer paste crash", and the message icon when it tracks none, as `apps/ui`'s thread under its
  group is drawn. The groups are read by one subscription, `ReadGroups`, which zips the
  groups, the members, the person's admissions, and what they may do into one `ReceivedGroups`, so that `isLoaded` is
  true once all of them have been read: "No groups yet" is under the Groups title only then, and nothing is before,
  as `feature/agents` and `feature/connections` wait for theirs.
  What a group's row says besides its name is read by a second subscription, `ReadSignals`, into one
  `ReceivedSignals`, which no row waits for (`readSignals` over the store's records, and `receivedSignals`, which
  makes the message from them): the groups with activity the person has not read, how many of their notifications
  wait in each group, the turns under way, and the workspace's agents, with whether a change to each is on its way.
  A group has activity the person has not read as core's
  `Group.hasNewActivity` says it for the row of a group (`findNewActivity` in `signals.ts`): the latest activity of
  its threads that counts as new, a published message (`ThreadActivity.newActivity`), came after the person last read
  the group (their `GroupRead`), or, if they never have, after they were admitted to it; each such group is kept with
  that latest activity. Notifications wait in the group their thread is in while they are pending
  (`countWaiting`), the same notifications the inbox lists as waiting. A group's row shows what waits as its count,
  read aloud as "2 for you" by the design's `countName`, and, when nothing does, a dot read aloud as "new activity"
  while it has activity not read, the label in the primary weight either way, as `apps/ui`'s group rows do (the same
  for a conversation's row). The logo moves at the end of the row while an agent is at work in the group, as the
  most pressing of the turns under way there says (`stateInGroup`: working, then stopping, then queued), and the row
  is named by it, "General, Working", as an agent's row is by its state. Nothing in the app wrote that a group was
  read, so the dot would never have gone: the Block asks for the group open to be marked read, once, as of its
  latest activity (`MarkGroupRead` writes `GroupMarkedRead`), as the group is picked, as its parent opens it, and
  each time the store reports new activity in it, and remembers what it asked for (`readRequested`) so that a
  store that lists the group as unread until the server has the write does not make it ask again. A group that is
  not the one open is never marked. The Groups section's header has two buttons: Browse
  groups, shown to everyone, which reports `RequestedBrowse` with the browse page on its Discover tab, and Create
  group, where the person may start a team, in place of the "+" that was called New team. The title, Groups, is a
  button too: it reports `RequestedBrowse` with the page on Your groups, as `apps/ui`'s `#groups` link does, and is
  current while the page it opens shows (the view input `isBrowsing`). The Direct messages section lists
  the conversations and has no line of its own for none, and its New message button is shown always, as `apps/ui`'s
  is, whoever else is in the workspace: with nobody else its dialog, "New message", has no one to choose, "Everyone in
  the workspace is here.", and Start conversation stays disabled.
  A conversation's row is marked by the member it is with, in their tone as `memberMark` gives it, neutral for a
  person and lilac for an agent (`conversationMark` in `conversation.ts`), where it had their first letter alone.
  A conversation with several people, which core allows a direct group to be, has no one's mark to wear and `apps/ui`
  draws none, so its row has one of its own: the first letters of the names of the first two on the neutral tone, and
  all of the names as its label. A conversation with one agent says how the agent stands and what it is doing as the
  Agents section does, by the same functions (`statusOfAgent` and `sidebarActivity` in `agentStanding.ts`): a patch
  on the mark, "Scout, Needs setup", with why in a tooltip on hover, or, while it is at work, the logo moving at the
  end of the row and the patch saying where, "Scout, Working in #General", wherever the agent is at work rather than
  only in the conversation, as `apps/ui`'s direct message rows take the agent's activity from its status; the count
  of what waits and the dot are the group row's own. A conversation with a person, or with several, moves the logo
  while an agent is at work in the conversation itself, as a team does. After the conversations the section lists
  the workspace's other active members the person has no conversation with alone yet (`teammates`), by name as they
  read it, each on their mark in their tone, and an agent among them with its patch and its logo as in a
  conversation; they have no count and no dot, since there is no group yet. A teammate's row sends `ClickedTeammate`,
  which does what `RequestedConversationWith` does for the parent: it selects the conversation of the two when one has
  appeared since the row was drawn, and otherwise reports the member as the people chosen (`SelectedPeople`), as Start
  conversation does, with no dialog between: Home opens the conversation as it will be. The row of the member whose
  conversation is open and not started is marked current (`unsentWith`, which the parent gives the view), and no row
  is added to the list for the conversation. A
  row's count is read aloud as `apps/ui` reads it ("5 unread", "5 to triage", "2 for you", by the design's
  `countName`). `browseView` is the page it asks for, a main pane titled Groups with two tabs, each counted once the groups are
  read: Your groups, the teams the person belongs to, and Discover, the public teams they do not, Your groups at
  first, and Create group, the same as the sidebar's, where they may start a team. A conversation is on neither; the
  sidebar lists it. The toolbar over the rows holds a search field, whose label is hidden and whose placeholder
  follows the tab, "Search your groups…" and "Search public groups…", and which takes no focus as the page opens;
  under it, a line says what the tab lists, "Public and private groups you've joined." and "Public groups you haven't
  joined. Join one to read its threads.", with how many groups the search leaves at its end, "4 groups" and none
  before the groups are read, over the labels of the columns, Group, Visibility, and Members, which show whether the
  list has rows, none, or is not there yet. A row is the channel's drawing, the team's name, a badge of Public or
  Private, how many members it has, "12 members", and "Sending…" under the name while it is on its way. On Your
  groups its end is Open →, and on Discover a Join button named for the team, "Join #launches", disabled while the
  join is being written (`joining`, so a second click sends nothing); on both tabs the row itself opens the group, as
  the sidebar's does. Joining writes `GroupJoined` (`JoinGroup`), and once it is written the Block reports
  `JoinedGroup`, with where the team is as a line says it, for the workspace page to confirm with "Joined #launches"
  and the offer to open it; a join the store could not keep says why in the line over the list (`notice`) and leaves
  Join to press again. Until the groups are read the list is the quiet line "Loading groups…", and a read that failed
  says "Can't load the groups." with Try again (`ClickedTryAgain`, which raises `reads`, the dependency that restarts
  the subscription), as the other destinations do. The search keeps the teams whose name contains what was typed, in
  any case, ignoring spaces at either end; the tabs keep one search between them. A tab with no teams to list says so
  in a quiet line and not an empty state: "No groups match this search." when the search found none, and otherwise
  "You've joined every public group." on Discover and "You haven't joined any groups yet." on Your groups. The dialog for a new group or a conversation
  is `dialogView`, a view of its own that renders only that dialog, with nothing in it while it is
  closed, and neither the sidebar's view nor the browse page holds it: below 64rem the sidebar is on
  the page only while the navigation drawer is open, and a dialog the framework shows has to be in the
  document. The page lends it to the shell's `dialogs`, so the sidebar's "+" and Create group open it
  at every width. Its parent can ask for a conversation with a member (`requestConversationWith`,
  `RequestedConversationWith`): the Block selects the conversation the person already has with just
  that member, and, when there is none, reports the member as the people chosen (`SelectedPeople`), as a teammate's
  row does.
- `feature/unsentConversation`: a conversation the person has not started, as it will be once they send its first
  message, in Home's main pane. It is with the other people it is given, in the order a direct group lists them
  (`Group.directMembers`), and names them as the conversation will be named, by the workspace's members that it reads
  (`ReadPeople`, which follows the store) and by their IDs until they are read. Its view is the design's main `pane`
  titled by the people, with the message icon and the workspace's name under the title on a phone, the welcome a
  conversation with nothing said in it has, "Your conversation with Bob" (the thread view's `welcome`), and the
  composer in the footer named "Message Bob" or "Message Bob, Carol" while it is empty, as `apps/ui`'s is. The
  composer is the composer Block at `Drafts.Place.Conversation`, so the draft is kept for the people and read as the
  conversation opens; its text is the only thing it holds, and nothing is written before the first send. The first
  send is the Block's one command, `StartConversation`, which writes `DirectThreadStarted` with
  `Thread.StartDirectInput` (the people, the text, and the mentions in it), as the store writes a conversation's first
  thread, once for a send; a write the store could not keep says why over the welcome (`notice`). The Block reports
  `FoundConversation` as soon as the store lists a conversation of the person with exactly these people
  (`conversationAmong`, in any order of the people), listed or still on its way: it is the one the person's own message
  starts, and equally one made on another device in the meantime, and the parent opens it in place of this one. It
  keeps no state of having been sent.
- `feature/search`: jumping anywhere in the workspace, as `apps/ui`'s Jump to does, in a palette that the Block binds
  from `@foldkit/ui/dialog` and renders with the design's `palette`: a modal of the palette size, 40rem by 30rem near
  the top of the window, which fills the screen below 48rem. It has no title, and is named Jump to, as is its field,
  whose placeholder says "Jump to a group, person, or page…" and which takes the focus as the dialog opens, with its
  parent asking it to open (`requestOpen`) on an empty field. A Close button closes it. Where the person can jump to
  is read from the store while the dialog is open (the subscription `ReadJumpTargets`, which follows the store's
  `jumpTargets` and reads nothing while the dialog is shut); what is typed ranks it in the page, with no request of
  its own (`sectionsOf`). The sections keep `apps/ui`'s order: Go to, with Inbox, Agents, Connections, and Settings;
  Groups; People, each with "Direct message" beside the name; and Agents. After them comes Threads, which `apps/ui`
  has no section for: it has the same look, a thread's words with the name of its group beside them where a person has
  "Direct message". Before anything is typed each section lists its first five, and while typing its best eight, a
  section with nothing in it left out. A name matches what is typed whatever the case and the accents, a leading `#` or
  `@` ignored: best when it starts with it, then when a word in it does, then when it has it anywhere, and, among those
  as good, in the order the items came in; a thread with a title is also found by the words of its opening. A page and a
  team are marked by a drawing, a thread by the message drawing, and a conversation, a person, and an agent, on the
  lilac tone, by initials. Nothing that matches says `Nothing matches "zzz".`, with what was typed trimmed; a read that
  failed, why; and a read not answered yet lists the pages alone. Under the list is a row of hints, "↑ ↓ to move",
  "↵ to open", and "esc to close", hidden from assistive technology and below 64rem. The first item is active; the arrow
  keys walk the items of every section as one list, around it, and keep the active one in view (`ScrollToItem`), Enter
  opens the active one, and a click opens the one clicked. The active item is marked `aria-selected` and named as the
  field's `aria-activedescendant`. A key with Shift, Control, Alt, or Meta held is left to the browser, as are the keys it
  does not answer. The Block reports what was opened, a page (`OpenedDestination`), a group (`OpenedGroup`), a thread in
  its group (`OpenedThread`), a person (`OpenedPerson`), or an agent (`OpenedAgent`), and closes its dialog, which,
  however it closes, forgets what was typed and which item was active. It acts on none itself: its parent decides what
  opening each is.
- `feature/inbox`: the person's notifications, newest first, on two tabs: Unread, those still waiting,
  counted whether any wait or none, and All, every notification the store gives, waiting or seen, Unread at first.
  Each tab's notifications sit under a divider for each day they came on by the person's own clock, named
  as it is from the time now (`dayLabel`), its label before the rule that runs on (`align: "start"`, as `apps/ui`
  has it), and each is a row of its own: who wrote the message its
  activity is about, by their name and initials, on their tone (`authorMark` in `seen.ts`: an agent's lilac, a
  person's and a contact's neutral), and what they did, which is why the person is told
  (`notificationReason`): the message mentions them ("mentioned you"), it opens the thread ("started
  a thread"), or it replies ("replied"); where it comes from, a team as `#` and its name, a
  conversation as the others in it and "Direct message", and "Unavailable thread" while the store
  lacks the thread, with no place while it lacks the thread's group; what the message says, as the preview of its
  markdown, one run of words with each mention a chip (`notificationText`, by the inbox's members); and how long ago it came (`ageLabel`), with a dot while it waits. While the store lacks the message, the
  first line says "Activity in a thread" beside the design's `message` icon in place of letters, and the text says
  what it can. The time
  now is its view input, as the page gives it, so the days and ages follow the clock. A notification's
  text opens its thread beside the inbox, which marks it seen at once, if it waits, and selects it:
  the row stays selected, in its place, with `aria-current` and the design's current look, while its
  thread is open, even on Unread, where a seen notification would otherwise leave, and selecting
  another row moves the selection. The selection (`selected`) is the notification, its thread and
  group, the message its activity is about, and the thread Block that shows the thread, bound as a
  keyed occurrence as the group binds its own, so opening another makes a fresh one. There is no way
  to mark one notification seen but to open it; Mark all seen, in the header while any wait, marks
  every one up to the newest that waits and keeps the selection, and is dimmed while that write is on its way
  (`isMarkingAllSeen`, until `WroteAllSeen` or `FailedWriteAllSeen`, which says why in the notice). The Unread count and Mark all seen
  follow what waits alone (`waitingCount`), so the count can be none while the selected row is still
  listed (`shownItems`), and the caught-up state shows only once the thread is closed and nothing
  waits. `threadView` is the thread open as a side pane, as the group's is (the thread Block's
  `sidePane`): titled by the thread, or for a thread that tracks a task by its status drawing, with why the
  notification came under it, "Mention · #General", "New thread · Bob", or "Reply · #General"
  (`reasonSubtitle` in `seen.ts`, by `selectedReasonWords`), or, while the store lacks the message
  the notification is about, where the thread is as the group's pane says it, or only the reason while it lacks the group,
  with the thread's bell, Follow thread, and Close thread, or Close task, beside the title and, below 48rem, Back to Inbox
  before it, both sending
  `ClickedClose`, the thread's messages, with the one the notification is about drawn current, and
  the reply composer in the footer, or, while the person follows the log of one of its turns, that log in its place,
  and nothing while none is selected. It reports `OpenedThread`
  when a thread opens and `ClosedThread` when the person closes it, or its turn's log, and `OpenedAgent` when they ask, from a turn that
  failed in the thread, for the settings of its agent, so its parent can hold the side
  pane in step; its parent closes the thread with the operation `requestCloseThread`, which reports
  nothing, since it asked. The Block offers a count of what waits for its parent to show. The workspace's name, which
  Home gives its view as it gives the group's, is the line under the title on phones.
  Until the store has answered (`isLoaded`) the list is a line, "Loading your inbox…", and when the first read failed
  it is "Can't load your inbox" with why, in the place of the list. A tab with nothing says "No activity yet" on
  All, and "You're all caught up" on Unread with a "View all activity" button that chooses All. The store gives every
  notification the person has at once, so the list is paged by the view: the model's `shown` is how
  many of the newest the list shows, `pageSize` (20) at first, and `ClickedShowOlder` adds a page. While
  the tab keeps notifications older than those listed (`hasOlderItems`), Show older, a quiet button,
  centered, follows the list. The tabs keep what is shown, and the notification opened stays listed in
  its place even when newer ones push it past the page.
- `feature/tasks`: the tasks the person can see across their groups, from the store's `tasks`: each
  with its thread, the place its group is as a line says it (`#general`), and when it was last active,
  and the members that name who is assigned to it. It is made
  from the workspace as the member, writes nothing, and has two views, each a main pane that takes
  the time now from its parent. `triageView` is titled Triage, "Tasks waiting for a decision.", and
  lists the tasks in triage (`triageTasks`); `tasksView`, the Block's canonical view, is titled Tasks,
  "Every open task you can see.", and lists every task that is neither done nor dismissed (`openTasks`).
  The pane's toolbar has a search field, whose label is hidden and whose placeholder says "Search
  tasks…", beside, on Tasks alone, a menu of the status (`StatusFilterMenu`), Any status or one of the statuses of an
  open task, named "Status: Any status", and then a menu of whom a task is assigned to (`AssigneeMenu`), Anyone,
  Unassigned, or a member by name and mark, whose button says Assignee while it narrows to none and is named
  "Assignee: Anyone"; Triage, which shows no choice of status, has the assignee alone. Each menu is a Foldkit `Menu` Block the Block binds (`AssigneeBinding`, `StatusBinding`), and
  choosing from it sets the filter, so the Block has no message for the choice. The toolbar goes on with a line that says "Tasks in triage across your groups." or "Open tasks across your groups."
  with how many tasks the filters leave at its end, "12 tasks", over the labels of the columns,
  Task, Status, Assignee, and Activity, and a row for each, latest active first (`matching`): the same
  row as the group's Tasks tab has (`taskList.ts`), with the place of the task's group, "#General", in quiet
  text after its title, since `apps/ui` has no list of several groups' tasks and this keeps its columns as they are,
  and "#General · To do · Alice · 10m ago" as its description. No row is drawn current, since opening a task opens its
  group, where the list is not shown. The
  row reports `OpenedThread` with the thread and its group, which its parent opens in that group,
  where the task's controls are. The search finds the letters in the thread's title or in its
  opening's words as the group's Tasks tab does (`threadContains`), and the assignee is anyone, no one,
  or the member the filter names, whoever the Block is made for. The filters are the Block's, one for both views,
  except that Triage leaves out the status (`withAnyStatus`), since it shows no choice of one. With
  no task the pane says "Nothing to triage" or "No open tasks" and that the tasks the person can see
  will be listed there, and with filters that leave none, "No tasks match these filters." in a quiet line under the
  labels, as the group's Tasks tab says it. `triageCount` is how many tasks wait in triage, for the sidebar to show.
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
  invitation just made for a week says seven: `expiryInDaysLabel`, which tells days alone, as `apps/ui`'s member
  settings do, where the workspace picker's `expiryLabel` tells hours too) with a quiet Revoke named for the address, held while the
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
  lose and that they need a fresh invitation to rejoin; and Your name (`ChangingName`, opened by "Change your name…"),
  a compact dialog (`size: "compact"`) titled "Your name" with the workspace's name beside the title, "What people in
  this workspace call you. Others keep their own." under it, and one field, "Name", that starts from the name the
  person has, takes the focus with its text selected (the `SelectOnFocus` mount, `selectOnFocus.ts`), and a Save name
  that waits for a name that is not blank and not the one they have, as `apps/ui`'s change-name dialog does. Its
  Cancel is disabled while the name is being saved (`isCancelDisabled`). It opens from the person's account at the foot of the rail, which the Block draws (`accountView`, given the
  address the person signed in with and their Appearance) as a Foldkit `Menu` Block it binds (`AccountBinding`, a menu
  of `AccountEntry`, id `account`): choosing "Change your name…" opens the dialog once the replica holds the person, and
  every other entry is reported as `ChoseAccountEntry`.
  Each says "Creating…", "Revoking…", "Transferring…", "Removing…", or "Saving…" while its request is on its way, and
  closing the dialog then is ignored: it opens again to show how the request ends. A request that ends well closes the dialog; one that does not stays open under the failure.
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
  ready and at work has the filled square on its mark, with what it is doing in the tooltip and after its name,
  "Atlas, Working in #design", and the logo at the row's end, moving as its turn does (`motionOfState`); one that is
  ready and idle shows nothing, and so does one still on its way, which says "Sending…" at its end. The
  Block's list page, `view`, is a pane titled Agents with All and Needs setup tabs, each with how
  many agents it holds, an "Add agent" button that opens the dialog, a toolbar with a search that narrows the tab by name, in any case
  and whatever the accents, and a row for each agent in the design's columns Agent, Harness,
  Model, and Activity: the lilac 32px mark and name, the harness (a connection's name, or "Auto")
  over its sandbox (a connection's name, or "No sandbox"), the model's id over its connection's
  name ("Removed connection" once it is gone), and the activity, which is blank while the agent is idle
  and otherwise the logo moving as its most pressing turn does, the state ("Working", "Queued", or
  "Stopping") over the places it is at work ("#general", or "#general + 1 more"), which below 48rem
  follow the state on the line under the name; the row's description repeats it in words. An agent that
  needs setup shows what keeps it from running, the first reason, in a sentence on its mark, and its
  activity too while it has one. With no agents the list offers adding the first
  ("An administrator can add agents to your workspace." for a person who may not), the Needs setup
  tab says every agent can run, and a search with no match says so and clears from "Clear search".
  The Block reports `RequestedBrowse` when the person browses from the sidebar, and `OpenedAgent`
  with the agent picked, from the sidebar or the list, asking once for the models of the agent's
  connection to show its model and its efforts; the page opens the agent's page for it. It reports
  `OpenedThread` with the thread and the group of a turn the person picks on an agent's page, which the page opens in
  Home. That page, `agentView`, with the view inputs `agentId` and
  `workspaceName`, is a pane titled by the agent's name on a 24px lilac mark with the patch of how it
  stands, and, on a phone, the workspace's name under the title. One `paneColumn` holds, in order: where the
  agent can't run, a boxed note, "This agent can't run as it is set up", with a line for each reason; a Name
  form, the field "Agent name" with a secondary "Save name", disabled until the name is changed to one that
  is not blank; a Setup form, under a dashed stitch, of the setup fields with a primary "Save setup", disabled
  until the setup changes, and "Discard changes" beside it while it has; and Details: the role, which is
  changed in Settings › Members, as any member's is, the current activity, "Idle" or a line for each turn
  under way, the most pressing first, the logo moving as it does, the state, and the place, such as
  "Working #general", and who created the agent, with the day. As in `apps/ui`, each line is one button named as
  `apps/ui` names its link, "Working in #general: open its log" (or "Working: open its log" while the group is not
  read), the design's `activityList` with an `action`; it reports `OpenedThread` with the group and the thread the turn
  works in (`ClickedTurn`, from `TurnUnderWay`), which the page opens in Home, where the thread's timeline has the
  turn's row, with its View log. `apps/ui` opens the turn's own log beside its thread; the button opens the thread, and
  the person opens the log from the turn's row. A person who may not configure the agent reads the
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
  refused, until they dismiss it, shown as the design's `toast`s in its `toastStack` over the shell's bottom end
  corner, with Dismiss; and what the page confirms to the person that they did, which a Block reports and the page
  hands it with `confirm`, such as "Name saved" or, for a group joined from the browse page, "Joined #launches", or for one created, "Group created", or, for the open group followed or stopped by a slash command, "Following #general" and "Unfollowed #general", shown as the design's `confirmation`s in its `confirmationStack`,
  centered at the bottom of the window, 24px above its edge and any home indicator, each with a check before its
  words, no Dismiss, and at most one thing it offers to do next. A confirmation goes by itself after five seconds
  (`ExpireConfirmation`, which waits with `Effect.sleep`, so a test moves the clock), each under an ID of its own
  (`nextConfirmationId`) so that the time of one that has gone cannot take another's. What it offers is an `Offer`,
  a value of the Block's own type and not a message of its parent's, which a Block cannot hold: `confirm({ text,
offer })` takes `Offer.OpenGroup({ groupId })`, which shows as an Open button, and the person taking it removes the
  confirmation and reports `TookOffer({ offer })`, which the workspace page carries out, as it carries out the
  search's `OpenedGroup`, by opening the group in Home (`HomeBinding.requestOpenGroup`) and showing Home. The two
  stacks are separate and fixed, so a refusal keeps its corner and its Dismiss beside the confirmations; on a window
  so narrow that they meet, the confirmation lies over the refusal until it goes. The view is the two stacks in one
  element, which the shell places in the open dialog or last in its frame.
- `page/signIn`, `page/workspaces`, `page/workspace`'s listing of the integrations, and `feature/agents`' listing of a
  connection's models are commands that call the host and end in a message whatever happens to the call: the client
  reports a status its contract does not list as a defect, which a failure handler misses, so each handles the whole
  cause and words it as it words a host that cannot be reached, and a form never stays waiting for an answer.
- `page/signIn`: signing in, a step at a time: an email to send a code to, then the code, from
  which the person can change the email or ask for a new code to the same address; it keeps the
  session a right code gives, and reports it. It starts with an address, which the root gives when it
  has one, and a notice, such as that the session ended, which shows over the email field in the caution tone,
  stays as the address is typed, and goes when the address is sent. While a code is asked for or checked the form
  stays on the screen, as `apps/ui`'s does, and only the button that sent it is disabled: Continue while the code is
  asked for (`SendingCode`), Verify code while it is checked (`CheckingCode`) and until all six digits are in
  (`codeLength`), and Send again and Change email while either a new code is asked for (`ResendingCode`) or the code
  is checked. Typing the address changes nothing while its code is asked for, nor does typing the code while it is
  checked; a code typed while a new code is asked for is kept until the new one empties the field, and is not checked.
  The code is the design's `codeInput`, six cells
  over one native input with the hint "Use your most recent code.", which keeps digits only and checks the code
  as soon as the sixth is in (`CompletedCode`), as "Verify code" does (`SubmittedCode`), both through the one check.
  A request that does not end in a session or a sent code ends in an error the page words (`wording.ts`), in
  `apps/ui`'s words, at the field it outlines when the entry itself is wrong, and as an alert over the button when
  the request is: for the address, `InvalidEmail` at the field ("Enter a valid email address."), and `RateLimited`
  ("Too many codes were requested lately. Try again later.") and `RequestFailed` ("We couldn't request a code. Try
  again.") over the button; for the code, `InvalidCode` ("Enter all six digits."), `Mismatch` ("That code doesn't
  match. Check it and try again."), `Expired` ("This code has expired. Request a new one."), and `Unknown` ("This code
  is no longer available. Request a new one.") at the field, and `VerifyFailed` ("We couldn't verify your code. Try
  again.") and, for a new code that was not sent, `ResendLimited` ("Too many codes were requested lately. Use the last
  one, or try later.") and `ResendFailed` ("We couldn't request a new code. Try again.") over the button. The host's
  `SignIn.Rejected` carries why it rejected a code (`mismatch`, `expired`, `unknown`) in the error the HTTP contract
  lists for it, so the client the app uses gives it to `CheckCode`, which tells the three apart; `SignIn.Limited` is
  `RateLimited`, and `SignIn.Unavailable`, a host that cannot be reached, and any other cause are `RequestFailed`, or
  `VerifyFailed` when a code was being checked. Once a new code is sent (`isResent`) the design's `announcement`, a
  live region that is on the page before it says anything, says "We sent a new code. Use the latest one." until the
  person checks a code, the field is empty, and focus moves back to it (`FocusCode`).
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
  invitation · Expires in 7 days" (`expiryLabel` in `seen.ts`, from the time now, which the root gives the view, as
  `apps/ui` words it: "Expires in 5 hours" while less than a day is left, "Expires tomorrow" once the days left
  rounded up are one, "Expires in N days" up to thirty days, the date, "Expires Oct 6, 2026", beyond, and "Expired"
  once it has; what is left is counted from a minute after the time now, which the app's time may be behind by, so
  that an invitation made for a week says seven days until a day of it has passed), and an "Accept invite" button named for the workspace; with invitations and no workspace, the design's
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
  - Creating asks for the workspace's name and what people there will call the person ("What people there will call
    you. You can change it later."), and creates it over HTTP, `client.workspaces.create`, as its owner and first
    member. Create workspace waits for a workspace name, spaces being none (`hasWorkspaceName`), as well as while the
    request is on its way, and `SubmittedCreate` sends nothing without one, since a disabled button does not stop
    the Enter key from submitting the form. Each attempt sends a request key as the
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
    once it is the dialog closes, a confirmation says "Joined {workspace}" (the name the listing has), and focus moves to
    that workspace's row in Your workspaces, since the invitation's button has gone; the workspace is not opened.
    If the listing cannot be read, the dialog stays and says "Joined, but we couldn't load your workspaces. Try
    again." with Close and a primary Try again, which reads the listing again and sends nothing.
  - The confirmation is the design's `confirmation` in its `confirmationStack`, as the workspace page's are,
    which the page renders at the end, since the centered screen has no shell: a check before its words, centered at
    the bottom, and no Dismiss, so only its time takes it away. The model keeps `confirmations`, each with an ID
    taken from `nextConfirmationId`, so that the time of one that has gone cannot take another's. Showing one
    starts `ExpireConfirmation`, a command that waits five seconds (`Effect.sleep`, so a test moves the clock) and
    reports `ExpiredConfirmation`, which takes the confirmation away; `FocusWorkspaceRow` moves focus
    to the row with `Dom.focus`, completing when the row is not there.
  - A request the host answers with `Authentication.Unauthorized` (told with `Schema.is`), because it does not
    know the session, ends in `RejectedSession`, whichever request it was, and the page reports `EndedSession`;
    the root signs the person out. Any other failure is worded for the person, as each request does.
  - Closing the dialog ends what was being done, except while a request is on its way: it opens again, so that a
    workspace is not created, nor an invitation accepted, unseen. Closing it while the listing is read again
    leaves the listing to show the result alone, without a confirmation.
- `page/workspace`: a workspace the person opened, as their member of it, on the design's shell. The
  rail has the logo, a button named "Amends home" that goes Home, over "Home", "Agents", and "Connections" buttons, then "Search", and, below, "Settings" and the person's account. Each
  destination is marked while it is open; Home is open while the page shows it (`Open.Home`), whatever Home shows, and
  Connections while the connections, one connection, or the channels are. Search is no destination: it is never
  marked, and it sends `ClickedSearch`, as the sidebar's Find anything… does. The rail picks a destination and the
  sidebar lists its items, so the sidebar changes with the rail. The
  sidebar, named by the workspace, has the workspace as one button, a 28px mark of its first letter, its name, and a
  chevron, which goes to all workspaces (`ClickedWorkspaceSwitcher`, which the page reports as `ClosedWorkspace`), and,
  under it, the destination's sections; it has no footer, since who is signed in and the way out are in the account menu on the rail.
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
  sends, ask the search to open. The search reports what was opened and the page opens it: a page as the rail goes to it (`goToDestination`: Inbox is
  Home, which opens on its inbox, and Settings is the Workspace page, as the account menu goes to it), and, in Home,
  as Home's own lists do, a group (`requestOpenGroup`), a thread in its group (`requestOpenThread`), as a task's is,
  and a person as a conversation with them (`requestConversationWith`), which Home's groups select, or open before it is
  started; an agent
  opens on its page, as a row of the agents' sidebar does. Whatever is opened closes the navigation drawer and the
  side pane's dialog, as any navigation does. So does
  the thread of a turn picked on an agent's page, which the agents Block reports as `OpenedThread` and the page asks
  Home to open the same way. The
  workspace's name in the sidebar and
  in the panes that name it is the settings' once they hold the workspace, so it follows a rename, and the one
  the workspace was opened with until then. The page's view takes the account's email, the Appearance the person chose, the time now, and whether the page runs on an Apple
  platform as view inputs, and gives Home and the settings' Members page the time now. The shell lays itself out by the window's width: below 64rem the sidebar is
  not in the frame but in a navigation drawer, and below 48rem the rail with it, which the shell's Open
  navigation button opens. The shell begins with a link named Skip to content, the first thing the Tab key reaches, which goes to
  the main pane, so every destination's main pane is the design's `pane` with `variant: "main"`. The drawer is a
  `DialogBlock` the page binds as `menu` (`MenuBinding`, id `workspace-menu`) and lends the shell, so the framework traps
  focus in it, makes the rest of the window inert, closes it on Escape, on a click on its scrim, and by its Close
  navigation button, and returns focus to the button that opened it when it closes. The binding gives the dialog the
  design's `currentSidebarRowSelector`, so opening it focuses the sidebar's current row, and the first focusable element
  in the drawer where no row is current, as on the list of connections. The
  Open navigation button, which says `aria-expanded` as the drawer is open and `aria-controls` its id, asks it to open
  (`ClickedMenu`), and every navigation to an item of a sidebar, the
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
  the toasts and confirmations come inside whichever dialog is open, where they can be read and acted on. The page
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
  inbox, which it opens on, the tasks in triage, every open task, the groups to browse, the open group, or a
  conversation the person has not started (`Open`: `Inbox`, `Triage`, `Tasks`, `Groups`, `Group`, `Unsent`); it has no
  state of showing nothing. The conversation not started is `feature/unsentConversation`'s Block, a keyed occurrence
  (`UnsentBinding`) keyed by its people as a direct group is (`Group.directKey`), so that opening another is a fresh
  one and a late result cannot land in the wrong one. When the groups report `SelectedPeople`, Home opens it
  (`openUnsentConversationAlone`) as picking a group opens one: it closes the side pane's dialog and the thread beside
  the inbox and marks no group in the sidebar, since there is none, and gives it the members the groups have read, so
  that it is named from its first view. It is not in the sidebar's list, which lists conversations: the row of the one
  person it is with is marked (`unsentMemberId`). Leaving it, by any navigation, leaves nothing behind, since it is part
  of `Open` and nothing was written. When it reports `FoundConversation`, Home opens the group and marks it
  (`markAndOpenGroup`, which `requestOpenGroup` does too). Its sidebar (`sidebarView`) is an
  "Inbox" item with how many notifications wait, read aloud as "5 unread", a "Triage" item with how many tasks wait in
  triage (`triageCount`), read aloud as "5 to triage", a "Tasks" item, and the groups' sections, which are given the
  thread open, as its title (`openThreadTitle`) and the status of the task it tracks (`openThreadTaskStatus`), in the
  group open or beside the inbox; picking a group opens it and marks it in the list, and
  resetting Home, as showing any other destination does, leaves no group marked and shows the inbox. The tasks Block is the same child
  under two slots, `triage` and `tasks`, with `triageView` and `tasksView`; a task's thread opened there is opened in
  its group with the thread already open, and the group marked, which a notification's is not: its thread opens
  beside the inbox, which stays. The groups to browse are the groups Block's
  `browseView`, the same child as the sidebar's under a second slot, which the Block asks for with `RequestedBrowse`:
  Home goes there as it goes to any list, closing the side pane's dialog and the thread beside the inbox and marking
  no group open, and picking a group on that page opens it, which leaves the page. Its side pane (`threadView`, given
  the time now) is the thread open in the open group, or the log of one of its turns in its place while the person
  follows it, or beside the open inbox (`inbox-thread`, the inbox's
  `threadView`), only while one is, and `asideDialogView`, given the `toView` the shell passes the page, is the
  dialog around it; `dialogView` is the groups' dialogs, for starting a team or choosing the people of a conversation.
  The page lends the
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
  closes the navigation drawer and the side pane's dialog and shows Home. It reports `JoinedGroup` too, from the groups
  Block's, for the page to confirm to the person with the offer to open the group; joining moves nowhere. The open
  group's `FollowedGroup` and `UnfollowedGroup` it reports as they are, keyed to the group, for the page to confirm;
  following moves nowhere either. A group the
  person created, which the groups Block reports as `CreatedGroup`, Home opens without a thread, as picking it does, and
  reports as it is, for the page to confirm. The settings of an agent that a thread's turn asked for, which the open
  group and the inbox report as `OpenedAgent`, Home reports as they are, for the page to open the agent's page. The page
  asks it for the rest: to reset
  (`requestReset`), which closes the thread, leaves no group marked, shows the inbox, and closes the dialog, as leaving
  Home does; to open a group without a thread (`requestOpenGroup`) or a thread in its group (`requestOpenThread`);
  and to open the conversation with a member (`requestConversationWith`), the one the person has or, when there is
  none, the one they would start, which reports `Navigated` either way.

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
  subscription `WatchViewport`, in `subscription.ts`, keeps it current: it follows the three queries
  (`viewportChanges`, in `viewport.ts`, which each composer follows as well), drops a width that did not change, and
  sends `ChangedViewport`, whose update sets the width and
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
  session, and the browser's services beneath them, and keeps the keys of an input method from the page's handlers (`inputMethod.ts`), and gives it `crash.ts`'s view for when it stops on an unexpected
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

`conversationScroll.ts`, where a conversation sits in the pane that scrolls it, as `apps/ui`'s `useStickToBottom` keeps
it, is the threads Block's and the thread Block's. A conversation is a message list with an `id` in a pane body that
says it is anchored to the bottom (`data-anchor="bottom"`, from the design's `pane`); a list in any other body, such as a
task's activity, is left where it is. `scrollToEnd` scrolls it to its end once the render in progress has committed, as
a conversation opens, and with `unlessCurrent` keeps the view while a message is the current one. `followEnd` measures the
pane body at once, before the render commits, since a Command runs before it does, and scrolls to the end after it only
if the person was near the end, less than 80px of it (`nearEnd`, `isNearEnd`) below the view. `revealMessage` scrolls a
message to the middle of the pane. Typing and the agents at work are not followed as the end moves, as in `apps/ui`, which
follows only as its entries are counted; a note of who types may sit just below the view until the person scrolls.
`settingsForm.ts`, an integration's settings form as the person fills it in, is the connections
feature's, and `agentSetup.ts`, an agent's setup as the person fills it in, is the agents feature's, as is
`agentActivity.ts`, what an agent is doing, read from its turns. A turn that is queued, running, or being
stopped is under way, as Queued, Working, or Stopping, and a turn that finished is not (`activityStateOf`);
`turnsUnderWay` lists an agent's, the most pressing first (working, then stopping, then queued) and the oldest
first within a state, each with its group and thread, which open it, and the place its group is named by, as the
person reads it (`placeName`), or none while the store lacks the group; `activityOf` takes the most pressing state and each place once, and none for an agent
with no turn, which is idle. `placesLine`, `activityLabel`, and `turnLabel` say them in words, "#general + 1 more" and
"Working in #general", and `motionOfState` says how the logo moves for each: threaded, lit, or tugged. The Block
reads the turns under way and the groups through its `ReadActivity` subscription, apart from the agents.
`agentsAtWork` lists, from one thread's turns, the agents with a turn under way there, each by its membership and the
state of its turn, the oldest turn first, which the store gives a group's thread list as `working`, and `workingLabel`
says one in a line with its agent's name, "Yumi working". `stateInGroup` takes the most pressing state among the turns under way in one group,
whichever agents they are of, which the sidebar's group rows move the logo as.
`agentStanding.ts`, how an agent stands and what it is doing as a row of the sidebar says it, is shared by the agents
feature's section and the groups feature's direct messages: `statusOfAgent` makes the patch on its mark (Needs setup,
with `issueSentence` of the first thing in the way, or where it is at work, and nothing for an idle agent or one still
on its way), and `sidebarActivity` the words and motion of its logo.
`taskList.ts`, tasks as the design's `taskList`, with the status of each drawn and the assignee named, is the threads
feature's Tasks tab's and the tasks feature's, which adds the place of the group after each title, and holds the words
the two say where the filters leave none (`noTasksMatch`).
`taskFilter.ts`, what a list of tasks is narrowed to besides the letters typed, the status and the assignee, each
chosen from a menu, is theirs too. The assignee is an `AssigneeFilter`: `Anyone`, `Unassigned`, or `Member` with the
member's ID. The menu reports a choice as a string, `Anyone`, `Unassigned`, or `Member:` and the ID
(`assigneeChoiceOf`, `assigneeFilterOf`), and `assigneeChoices` lists the members still in the workspace, by name, with
the mark `seen.ts` gives them (`memberMark`: their initials, lilac for an agent).
`memberPicker.ts`, the choice of several workspace members over the design's `memberPicker`, is the Create group form's
and the group settings' Add members: it holds the combobox Block every picker binds (`MembersComboboxBlock`), the members as the picker offers them, with
their name, mark, and whether they are a person or an agent (`pickerPeople`), the person themself locked as "You"
(`youInPicker`), the line under the field that counts who is in (`includedHint`), and the focus a picker takes back
after a chip is removed (`focusMembersInput`).

## The store

`store/Store.ts` opens one person's store of one workspace on one host, for as long as a scope lasts:

- Its event log, Effect eventlog's, journals into an IndexedDB database of its own and applies each
  `ReplicaChanged` the server writes to the replica. `write` writes an action, which eventlog sends
  when it can; its local handler holds the action in the replica until the server completes it,
  with the records `store/Pending.ts` says it creates: a thread started in a group, with its opening
  message and the task it starts as, a conversation's direct group, a reply, a team and its
  admissions, an admission, a role assignment, a thread's task, a turn retried, and an agent with
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
  shows each by the message its activity is about, `thread` what a thread holds, with its task,
  its turns, and the changes to who takes part in it (`deriveParticipationChanges`: the follows and the endings
  among its activities, each with the member whose part it was), `group` a group with its admissions and the person's follow of it, `groups` every group
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
- `jumpTargets` is a stream of where the person can jump to, which `listJumpTargets` decides from the groups, the
  members, the threads, and their messages, as the person's unfinished actions leave them, so it follows what the
  person writes and what the server sends. It reads every message, since the replica keeps no index of a thread's
  opening. It gives `JumpTargets`: the groups, each with the name the person reads it by (a conversation by the other
  members), other than a conversation of two whose other member is an active person, who is among the people; the
  threads that have a title or an opening with words, without its markdown's syntax and a mention as the member's
  current name, each with the name of its group, the words the person reads it by, its title or its opening's, and
  the opening's words; the active members other than the person; and the active members that are agents, each with
  its agent ID. A thread whose group the replica lacks is left out, since it could not be opened, and so is one whose
  only words are a deleted message's. The store lists them in the order of the records and applies no limit, and does
  not match: the search ranks them (`foldAccents` in `seen.ts`, which the composer's list of members compares names
  with too, folds what is typed and the names to compare).
- The host's sync server is the event log's remote, through `SyncClient`. The store registers the
  browser's sync key over HTTP, then connects, in the background and again until both succeed, so
  a store opens, reads, and takes actions offline. Each time its connection drops, the store builds
  the remote anew: eventlog's remote asks for changes from the position it first asked from for as
  long as it lives, which after a drop the server answers with a reset, and a reset leaves out how
  the actions committed before it ended.
- `store/Drafts.ts` is the person's drafts in the store, a reply in a thread, a new thread in a
  group, or the first message of a conversation not yet started, by its people, in an IndexedDB database of their
  own beside the replica, which no server or other device sees; saves keep the order they were asked in.
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

- `conversationScroll.test.ts` gives a pane body the extent a browser would measure, with happy-dom's `scrollHeight`
  and `clientHeight` stubbed, and reads back the `scrollTop` the effects set: near the end is less than 80px, a list
  scrolls to the end when the render has committed unless a message is current and it is told to keep the view, a list
  in a body neither anchored to the bottom nor following its end, as a turn's log does, is left alone, the person is measured before the render grows the pane and
  scrolled to the end it made only if they were near, which it says, and a message is revealed in the middle. They run live, since the
  effects wait for an animation frame. happy-dom lays nothing out, so a real scroll, the browser clamping `scrollTop`
  to the end, a short list resting against the composer, and `scrollIntoView` moving a real pane are not observed here.
- Story tests drive a Block's update: the thread read through its latest activity, once, its title
  and messages changed from what was seen, following and unfollowing, typing said once while a reply
  is written and stopped once it is sent, and why a write could not be kept; a task made and changed
  from what was seen, unless nothing changes; a thread's turns stopped while they are active and retried
  only when nothing else keeps them from it, a stop or retry the browser could not keep said until the person tries
  again, and what the server refused read from the store's actions, and a turn's log followed from viewing it until
  the turn ends or the person goes back to the thread, opened at its end and kept there as it grows, passing over
  another turn's, with what it did not follow said as new, going back and closing reported, and followed again after
  it could not be or was not available; a thread's messages scrolled to their end as the thread opens and again when it comes back, and
  followed as a message or a note is added, and left alone when a read adds none or typing changes; a thread started from
  the composer, a task started on the Tasks tab, the tab chosen, and the status, the
  assignee, and the order chosen from their menus, which change only the Block's own model, a group's threads scrolled to
  their end as they are first read, as the Threads tab is chosen, and, while the person is near it, as one is added, and
  left alone on the Tasks tab, the thread picked, and the
  tasks of a group's threads kept to a status, an assignee, and a search and ordered latest active, newest, or
  oldest first, and counted while open; a composer filling in its
  draft only while nothing was written, keeping what is written, and sending it once, listing members for
  a mention typed up to the caret, at the end of the text or in the middle of it, and for no mention elsewhere, keeping
  the list closed for the letters it was dismissed for, opening none for a draft read or for the name of a mention
  already picked, showing the member picked as their name and keeping and sending the link, showing the mentions of
  a draft read as names, moving the mentions with the text before them and dropping one that is edited or that letters
  are written against, removing one whole as Backspace just after it does and putting the caret where it was, and
  starting a mention at the caret with its button, reading the selection and writing the "@", in place of what is
  selected, after a space or not, and formatting: each format's markdown, taken off again, for a caret and for
  a selection, for several lines and for a mention among them, a link with its address selected, the keys that ask
  for each and the ones left to the browser, the toolbar shown at first, hidden by its button and on a phone until the
  person chooses, and slash commands: listed for a draft that is only a slash and letters up to the caret, and not for
  a space, other words, a mention, or a draft read, narrowed by the letters, run by Enter, Tab, or a click, which empty
  the draft and report the command, closed on Escape for the letters, and offered to a composer only when it is given
  some; a thread's message loaded for editing with its mentions as names, saved as the
  links, and as plain text once the name is edited, and `mentions.ts`: a markdown text read as text and spans and
  written back, whatever is escaped in a name, a range replaced, and an edit found by comparing the text before and
  after it, and a mention picked; a group
  opening its settings on General, with the draft of the team's name started only for someone who
  may rename it, renamed from the name seen, writing nothing when the name is unchanged, and closing
  its settings, which drop their drafts, whichever way they close, and close of themselves when the group is no
  longer there; running the slash commands its composer offers, following and stopping as the bell does and reporting
  it with where the group is, and renaming by opening the settings on General, offered to a member of a team who does
  not follow it, who does, and who may rename it, and not in a conversation, to a member the team does not hold, while
  the group is unread, nor on the Tasks tab; followed, left from its settings, which stay open, or joined, the members chosen to admit one at a
  time, once each and only from those who can be admitted, taken off again, and admitted in one command with a write
  for each, the phone's own view for it opened and left, and an admission removed,
  and the thread picked opened and closed, each reported, open already as the group opens without a
  report, or closed as its parent asks, without one; the groups starting a
  team in a dialog it opens on a blank form, private and with no one added, a team written once with the name
  trimmed, the visibility, and the person first among its members, held in its dialog until it is listed and kept,
  whichever comes first, then reported once with its ID and marked in the sidebar, not sent with no name or only
  spaces or while it is being created, not mistaken for one of the same name that was listed before or that someone
  else made, a failed write kept with its reason and sent again, a member's chip taken off with the input asked to
  take the focus, the command writing `TeamCreated` with its members and visibility and refusing a name the host would
  refuse, and a conversation in a dialog it opens on a blank form and closes when the form is submitted
  or the dialog closes, dropping what was being started, the people chosen for it taken off and added as for a team,
  its submit doing nothing while no one is chosen, reporting the people when there is no conversation with exactly them
  and picking the one there is, in any order of the people and not one that holds them and others, and reporting the
  group picked once, asking
  to browse each time, Browse groups on Discover and the title on Your groups, keeping the browse page's search,
  the groups read once they are received, and their order, general first and then by name in any case and
  whatever the accents, a conversation among the teams by the others' names, the teams the person belongs to and the public teams they may
  join told from the conversations, a public team joined once and reported as it is named when the join is written,
  why a join could not be kept and joining again, the groups read again each time the person asks after they could
  not be, and selecting the conversation with a member asked for, or reporting the member as the people chosen when there is none, a team
  with that member in it not being that conversation; the search opening on an empty field and
  reading where the person can jump to only while it is open, listing the pages and then the groups, people, agents, and
  threads, at most five of each before anything is typed and eight while typing, ranking a name by its start, then
  the start of a word, then anywhere, whatever the case and accents and with a leading `#` or `@` ignored, finding
  a thread by the words of its opening too, moving the active item and scrolling it into view, around the list, and
  opening the active item or one clicked, reporting a page, a group, a thread, a person, or an agent, closing the dialog
  and forgetting the query, saying why a read failed, and opening none while there is nothing
  found; the inbox
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
  its own time is up, which `ExpireConfirmation` waits five seconds for over `TestClock`, or when the person takes the
  one thing it offers, which is reported once and only while the confirmation is there, apart from what the server
  refused; Home opening the group picked and reporting that the person moved, as it does for an item of its sidebar, the groups to browse,
  and a task's thread, showing the inbox, the tasks in triage, every open task, or the groups to browse in place of the open group with no group
  marked, showing nothing when its parent resets it, which reports nothing, keeping what the tasks were narrowed to between Triage
  and Tasks, opening a task's thread in its group, and a notification's beside the inbox, which stays, naming the thread open in the group open
  or beside the inbox, opening the group, the thread in its group, or the conversation its parent asks for, or, when there is none, the
  conversation as it will be, in the main pane with the members read, its thread and side pane closed and no group marked, a teammate's row current
  and no row added, replaced by the group once the store lists the conversation and by any other destination with nothing left behind, and taking the window's width; the thread opening the side pane's dialog where the pane is one, from a notification, from a
  task, from a thread picked in the group, and as the window narrows, and not beside the main pane; its dialog closing with the thread, when Home
  is reset or the groups are browsed, and as the window widens to `Split`, which leaves the thread open; the thread closing as its dialog
  closes by itself, below `Split`; the thread beside the inbox closing with every navigation that leaves the inbox, so that coming back shows
  none; a workspace listing the integrations once as it opens, informing its connections, agents, and channels of them or of why they could not be
  listed, and listing them again when one asks, going home from a group or a destination, to the inbox in Home, showing the connections, the agents,
  the settings, or the channels in place of Home with its group unmarked and its thread closed, and an agent's page from a row of its sidebar or the
  list, showing Home with the group a person's conversation or a search result opens, or with the conversation not started when the search result is a person the member has none with, handing the settings and the channels what the person does in
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
  with the members their text mentions, and with none when it mentions no one, and a public team joined by the
  action `GroupJoined`, and members admitted by `AdmitMembers`, a `GroupMemberAdded` for each in the order given, which
  stops at the first the store refuses (`recordingStores` takes the number it keeps before it does). The workspaces page's
  stories start the listing for the person's address with the name it suggests, open an empty form, send
  its names with no key and read the list again once the workspace exists to report it opened, keep the key
  of a failed request for the request sent again and start a new one once a name changes, clear the refusal at
  the field typed in and the one about the form, ignore a close while the request is on its way, which opens
  the dialog again, end on a close at any other point, and show the list alone when the workspace is not in
  it or the dialog was closed; for joining they open the form over the invitation clicked, with the name
  suggested, and none for one the listing does not hold, send the name with the invitation's IDs and read the
  list again once the person is in, then close the dialog, show a confirmation naming the workspace the listing has,
  and focus its row, without opening it, start the confirmation's time and take it away when the time is up,
  with an ID of its own that a later confirmation does not take, return to the form with
  why a request failed and send it again as it was, clear the refusal as the name is typed, ignore a close
  while the request is on its way, close without a confirmation when the dialog was closed or the list does not have
  the workspace, keep the dialog on the join when the list could not be read and read it again, sending
  nothing, on request, and end as creating does; for the listing they keep the list when reading it again
  fails and say the host was not reached when the first read does, and report the session ended when any
  request is rejected as unauthorized; the `LoadWorkspaces`, `CreateWorkspace`, and `AcceptInvitation`
  handlers run over `test/host.ts`, a stub `HttpClient` that gives a canned status and body, to show the path, key, and names
  they send and each refusal as the person reads it, and that a session the host does not know (status 401,
  `Authentication.Unauthorized`) ends each of them in `RejectedSession`; `FocusWorkspaceRow` runs over a button
  in the document, which it focuses, and `ExpireConfirmation`, in the workspaces' commands and the actions', over `TestClock`, which it waits five seconds on. The connections'
  `CheckConnection`, `AddConnection`, and `ReplaceConnectionKey` run over the same stub host, to show the path they call,
  the request key `AddConnection` sends, new or the earlier attempt's, and the reason each of the host's refusals, and
  a host that answers what the contract does not say or cannot be reached, is read as; `RenameConnection`,
  `ConfigureConnection`, and `RemoveConnection` run over `test/recordingStores.ts`, and `FocusField` over a field in the
  document.
  The sign-in Block's stories and scenes show the notice it starts with, kept as the address is typed and
  gone once it is sent; the form staying where it is, with Continue, Verify code, Send again, and Change email
  disabled while a code is asked for or checked, and Verify code until all six digits are in; each way an address
  or a code is refused, said at the field or over the button as `apps/ui` says it; a new code sent again, its
  announcement, the field emptied, and focus moved to it; and a new code that could not be sent, with the code kept.
  Its commands tell a host that rejected a code by why it did, over the stub host, and `FocusCode` runs over a field
  in the document.
- Scene tests drive a Block's view as a person does: a thread's messages by their authors' initials
  and names and their times, the opening first, how many replies follow it, a reply on its way, an
  edited one, a message's markdown as blocks, a task's description as markdown, a mention as a chip with its member's current name, a deleted one, the message highlighted drawn current and none otherwise, who types, as one person, two, or several, a reply written and sent, the title renamed from its form, and a message
  edited from its form and deleted by the person who wrote it; a group's threads as messages by the
  author of their opening, their time, a mention in the opening as a chip, its markdown as the words that open the thread and a title as written, who replied and how many
  times, how much is new and where their task stands, the one open marked as current, the thread picked reported, why they could not be read, and a thread started
  from the composer, whose box is named for the group; a group's tabs, Tasks counted while any task is
  open and chosen to show the tasks as rows by their assignee, title, who started them, replies, status,
  and age, latest active first, narrowed by search and by the status and assignee menus, ordered by the sort menu,
  with the menus in the toolbar's order and New task at its end, saying there are none yet or that none
  match, opening a thread by its row, and a task started from the composer, named for the task, given the slash commands on the
  Threads tab only, and reporting the one run, starting no thread; a composer, named and worded for the place it writes to, sending on Enter and not on Shift+Enter, nor while
  suggestions are open, which Enter picks from, and with a Send that waits for words, listing, up to eight, the members
  with a word of their names starting with the letters after the "@" that ends the text, accents and case aside, and not
  the person, each with its mark in its tone, saying which is active and
  what the textarea completes from, picking by a click, by Enter, and by Tab, moving around the list
  with the arrows, and closing on Escape until other letters are typed; a task changed by someone who may, read as
  rows by someone who may not, and made by someone who may create tasks; a thread's turns as rows by their
  agents' names and initials and the words and marks of how they stand, each line under a finished row, stopped and
  retried by someone who may use the agent and not otherwise, Stop named for the agent and, while the turn stops,
  disabled and named Stopping, Agent settings after why a turn failed and on the card of its log, every problem of a stop
  or retry in its words under the row, a turn's log as the side pane, followed as it
  is written, with its header, Back, Stop, and Close, what the turn ran on, each entry of its activity in its words
  and at its time, each card, each footer, and the three states of the pane, a turn that replied as its reply with View
  turn log, the log opened in the side pane in place of the thread and going back to the thread's end, and the
  thread placing its agents' turns among its messages at the moment they took on the
  work, under the day, and the notes of who followed it or stopped taking part in it, for the person as "You" and
  for someone else, in each way, among them by their time, and its three states: loading until the store answers,
  not available once it answers without the thread, and not readable with a Try again that reads it again, in the
  pane of a group with the bell left out while it is not shown and the composer when it is not available;
  a group's main pane, titled by its name or by
  a conversation's other member, with the drawing of a channel or of a message before it, the workspace's name
  under it on a phone, its tabs named for it, its members as a stack of three marks named for how many there are, which
  opens them in the settings, the person's part in it as a bell named Following and pressed while they follow, and
  disabled while a change is on its way, and the gear to its settings, a team's welcome naming its members as a list in
  three forms, a group it is not available to and one that could not be read, saying so, the second with a Try again that
  reads it again, and
  joining in place of the threads and the tabs of a team they do not belong to,
  with the composer to start a thread in its footer; its settings in a dialog named for them, in a
  team's name beside the title, with General and Members as tabs, and Close settings, the name a field that is dimmed,
  with why, for someone who may not rename the team, saved only once it differs, the visibility as a line and the
  membership in words, with Leave group and Join group, each dimmed while the change to the person's own admission is
  on its way, and leaving and joining keeping the dialog open, and a conversation's, titled Members, with neither tabs nor
  visibility; its members counted over their list, You and Agent beside the names, those present marked
  Online and one on its way marked sending, with Remove named for the person for the others, and the picker named Add
  members with its Add button, "Add 1" and "Add 2", offering the workspace's members who are not in the team, taking
  them as chips, writing one admission for each in order and leaving none chosen, and dropping the choice when the
  dialog closes, all offered only to someone who manages the members; on a phone, the wide Add members button in
  its place that moves the dialog to a view of its own with Back to members, the people to add as a list that is
  always shown and narrows as the search is typed, chips, and the wide button counting them; and its side pane for the thread open in it, titled by the thread
  under the group it is in, with the composer to reply in its footer, closed by its Close button or its Back, which send the
  same message; the groups listed in the
  sidebar's sections, the teams to join not among them, in order, "No groups yet" only once the groups are read,
  no line for conversations, New message always and its dialog with no one to choose when nobody else is in the
  workspace, a conversation by its other member in their tone, neutral for a person and lilac for an agent, and one
  with several people by the first letters of two names and all of them as its label, an agent's with its patch and
  why in a tooltip, "Scout, Needs setup", and with the logo moving and where it is at work, "Scout, Working in
  #General", wherever it is, its count and its dot, the members with no conversation yet after the conversations, by
  name and each in their tone, with an agent among them carrying the same, a click on one reporting them as the people chosen, with no dialog,
  or selecting the conversation if it has appeared, a conversation still on
  its way marked "Sending…" at the end of its row, with the thread open under the group picked, drawn by the status of
  the task it tracks in each of the six, with the word for it, in ink once the task is done, and by the message icon
  when it tracks none, under a conversation as under a team, what waits for the
  person in a group as its count read aloud as "2 for you", a dot read aloud as "new activity" for a group with activity
  not read, with its name in the primary weight, and none beside a count, for a conversation as for a team, the dot
  shown as the store reports activity and taken away once the group is read, the logo at the end of a group's row
  moving as the most pressing state of the turns there says, working, queued, or stopping, and the row named by it,
  kept with the count and the dot, the group open asked to be marked read once for the activity it has, again only for
  later activity, as it is picked, and as its parent opens it, and never a group that is not open, the write of
  `GroupMarkedRead`, `findNewActivity` and `countWaiting` over the records they read, `receivedSignals` over what the
  store holds, and a new group taken in a dialog named for it, titled Create group with what to set under the title,
  the name field with its placeholder and limit holding the focus, the visibility chosen between Public and Private,
  Private first, with what each means under it and no switch, the members picker with the person locked as You, who
  need not be added, the others offered by name, added as chips that are counted in the hint and taken off by their
  Remove buttons, the button disabled until the name holds more than spaces and while the group is being created,
  the group written once with the person and who they added as its members and the visibility, the dialog kept
  until the group is both kept and listed, in either order, and then closed with the group reported and marked in the
  sidebar, a write that failed saying why and sent again, and the dialog closed by Cancel or by its Close button, only
  from someone who may create one, and Home opening the group created with the page confirming "Group created" with
  nothing left to offer, from the sidebar's heading and from the browse page, at a width that has the sidebar and at
  one that does not, a conversation started with the people chosen in
  a dialog of its own, both in a view apart from the sidebar's, with the sidebar's buttons that open
  them and the same team taken from the workspace's sidebar, the dialog for a conversation titled New message with
  its description, taking the focus on its To field with the placeholder Add someone…, several people chosen as chips
  and one taken off, Start conversation disabled until someone is chosen and Open conversation with the line that
  says the person has one when the people chosen are exactly a conversation's others, Start conversation reporting the
  people chosen and writing nothing, a teammate's row drawn current while its
  conversation is the one open and not started, and the groups to browse: Browse groups in the sidebar's header asking for them on Discover and the title on Your groups, the tabs counted
  once the groups are read and chosen, each team's channel drawing, visibility, and members, no conversation among them,
  the teams in the sidebar's order, the search narrowing either tab in any case and with spaces ignored, its
  placeholder and the line over the list following the tab, nothing matching, every public team joined, no groups
  joined, each as a quiet line, the columns' labels over every state, the groups being read and not read, with
  Try again reading them again, a team on its way, a group opened from its row on either tab, a team joined from
  its Join button, which is disabled while the join is written, reports it, and then leaves Discover for Your groups,
  a join that could not be kept saying why over the list and offered again, and Create group only for someone who
  may create one, opening the dialog with no sidebar on the page; the conversation not started, titled by every person it
  is with, named by their IDs until the members are read and by their names after, with the welcome of a conversation
  with nothing said in it and a composer named Message and their names, writing nothing until the first send, then
  `StartDirectInput` with the people, the text, and its mentions, once, and nothing for a message of spaces, saying why
  a write was not kept, and reporting the conversation only once the store lists one with exactly these people, in any
  order, listed or on its way, and not a team, another's, or one with more people; the inbox's notifications under the day they came, by their
  author and what they did, the place they come from, how long ago, and what they say, as the preview of its markdown
  with a mention in it as a chip and a deleted message said so, a mention, the opening of a thread, and a reply told
  apart, with no place while the group is unknown and the
  activity alone while the thread is, the unread ones with a dot and no button to mark one seen, the
  seen ones on All without the dot and not on Unread, the tabs, Unread first and the inbox opening on it, counted
  even at none, and chosen, each day's divider before one rule, the marks on the author's tone and the message
  icon of an activity whose message the store lacks, the workspace's name under the title for phones, all marked
  seen, dimmed while that write is on its way and offered again if it fails,
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
  they are with nothing yet to save, its details, a button for each turn under way, named as `apps/ui` names its link, that reports the thread of the turn with its group, and that the workspace page opens in Home, beside the group's threads, the note of why it can't run, a line for each reason,
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
  workspace and who owns it, the person's own name changed in a compact dialog titled "Your name" with the workspace's name beside it,
  which the page asks for and which starts from the name they have with it selected, saves only a name that is new,
  cannot be cancelled while it saves, says why it could not, and closes once it is kept, with no form for it on the page, what
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
  a group opened from its row, a group joined from its Join button confirmed with the offer to open it and the
  confirmation gone with the time, and a team started from Create group, also at `Phone` where the
  sidebar is in the shut drawer, the sidebar naming the workspace with
  who is signed in and the way out in its footer, the sidebar's header with the workspace as one button of a 28px mark, its
  name, and a chevron, the Skip to content link first at every width, going to the main pane of every destination, the
  sidebar in place with no Open navigation button from `Desktop`, the
  Open navigation button at `Phone`, saying it controls the drawer and whether it is open, opening the drawer as a dialog
  named Navigation, on the sidebar's current row, that holds the rail and the
  sidebar, its scrim or its Close navigation button closing it, or an item of the sidebar, a group picked among them, closing it, and
  a destination picked on the rail leaving it open with that destination's sidebar in it, the thread picked opened below `Split` in
  a dialog named Thread that holds the pane, closed by the pane's Close, by its Back on a phone, or by
  the scrim, which also closes the thread, a notification's thread opened the same way beside the inbox,
  and what the server refused as toasts, over the shell and
  inside the side pane's dialog while it is open, and what the person did to an agent confirmed in a
  confirmation that goes by itself, and Open on one taking the person to the group in Home from any destination, the dialog of the agents opened from the sidebar over the destination that shows,
  an agent added, shown by its page with its row current, and one removed, shown by the list, a connection's
  name and settings, key, adding, and removal confirmed the same way, the dialog of the connections opened from
  the sidebar and from the list, a connection added, shown by its page after it is checked, and the
  connections listing the integrations
  again after the host could not be reached. Home's scenes show the sidebar counting what waits beside "Inbox" and "Triage", each count read aloud with what it counts, its groups in their sections, Browse groups opening
  the groups to browse on Discover and the Groups title on Your groups, marked while they show, then the inbox, the tasks in triage, and every open task in a main pane named for it,
  the inbox saying nothing waits or that it is being read, the group's threads as messages in the main pane with the composer to start
  one, the thread picked opened in the side pane beside the main pane with no dialog, with its messages and the composer to reply, marked in
  the list and under the group in the sidebar, drawn there by its task's status or the message icon, and closed by its button, a notification's thread opened the same way beside the inbox, which stays with
  its row current and loses both as the thread closes or the person leaves the inbox, the group's settings opened in a dialog from its
  main pane, a team started from the sidebar's heading and from Create group in the dialog the page keeps, and the groups to browse left to
  by an open group, whose thread's side pane goes with it. The root's own scenes show
  the open workspace with no header of its own, and no footer in its sidebar, signing out from the account menu on its rail,
  an Appearance chosen there shown and kept and the one in use checked, switching workspace and opening the workspace's settings, its Open navigation button
  appearing and the sidebar leaving as the subscription reports a narrower window, and the reverse,
  and the thread open moving from its place beside the main pane into its dialog as the window narrows
  to `Desktop`, staying there at `Phone`, and back as it widens to `Split`, and the open inbox's
  notifications growing older as the subscription reports each minute.
  The search's scenes show it
  open as a palette, a dialog named Jump to with no title and a Close button, over a field of that name that takes
  the focus, in the palette size, listing the pages, the groups, the people, the agents, and the threads each under its
  title, with the note beside a person and a thread and the mark before each, at most five of each before anything is
  typed and eight while typing, ranking a name by its start, a word's start, and anywhere, ignoring case, accents, and a
  leading `#` or `@`, finding a thread by its opening's words, saying what nothing matches, the row of hints hidden
  from assistive technology, why a read failed, the first item active and the field's active descendant following the
  arrow keys round the list, Enter and a click opening an item of each kind and closing the dialog, and the keys with a
  modifier and those it does not answer left to the browser. The workspace's scenes show the search in the sidebar's
  header with its shortcut hidden from
  assistive technology and written ⌘K on an Apple platform and Ctrl K on another, opening in a dialog from
  it and, at `Phone`, from the drawer over the drawer, a group found opening and closing the search, and a page
  chosen with Enter opening as the rail does.
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
  form, in place of the heading's button; each invitation's end told in hours, as tomorrow, in days, or by its date;
  and the dialog taking a workspace's names, its Create waiting for a workspace name and for the request, sending
  them, saying at each field and for the form why they were refused, and opening the workspace created, or saying the list could not
  be refreshed, with Close and a way to try again; the dialog from an invitation's button, "Join {workspace}" or
  "Join this workspace", described by its line, with its field filled in with the name suggested, taking the
  focus and watching it to select the text, the sending state, each refusal at the field and under it, and
  joining closing the dialog and showing the confirmation, a status with a check and no Dismiss, the workspace's row
  focused and the confirmation gone when its time is up, or the dialog saying the person joined and the list could not be loaded,
  with Close and a primary Try again that reads it again. A scene opens and closes
  a dialog by resolving its commands and mount, `Dialog.test.ShowDialog`, `Dialog.test.AcquireResources`,
  and `Dialog.test.CloseDialog` from `@foldkit/ui`, resolves the field's `SelectOnFocus` mount and expects it
  ended, and a story sends the dialog's own message through its Binding's `embedView`.
- Every state that says it has nothing, is being read, or could not be read has a scene that finds its words and its
  drawing, which `test/fixtures.ts`'s `art(kind)` finds by the part of it that moves, and a scene of the root view
  holds the logo in the brand, the session being checked under the account's header, and the host that could not be
  reached. A list that is being read is found by its `status` line and its rows hidden from assistive technology, and
  a turn's state by the motion class of the logo in it.
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
  stopped and retried, and refused actions applying nothing; `find`'s cover a record as the
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
  thread has, and a thread the person stops following and follows again notes both in the thread, none for starting it, and a
  thread the replica lacks reads as absent once it answers and as present once it holds it, as it is written and once the server has it; and a connection added over HTTP, to an integration the test host installs, reaches the
  store, and its rename and removal show at once, then as the server made them (the stub host the page's and the connections' command tests send their requests through is `test/host.ts`); and an agent added
  in the browser, with its membership, role, and admission, comes back as the server's under the
  IDs the browser gave them; and a channel added in the browser is the server's under the same ID,
  and its move shows at once; and the settings' reads, as the settings Block reads them together,
  give the owner the workspace with its members, roles, assignments, and invitations, and the grant to rename it; and the members, the contacts, and the people together: a contact a channel heard
  from reaches them, and a member renamed here shows at once, then as the host has it; and the places to jump to
  are a team, a thread, and the member a conversation the person started is with, and not the conversation
  itself or the person themselves, before the server has them and after. `Store.deriveParticipationChanges` is tested apart: a follow and each way a
  participation ended in the order of the thread, when each was made, and nothing for other activity, details that do
  not read, or a participation that is not a member's, and so is `Store.viewTurns`: which turns may run again, and so is `Store.summarizeReplies`: no replies, and each
  replier once in the order of their first reply, and so is `Store.deriveLastActiveAt`: the creation of a thread
  with no messages, and the later of two messages, and so is `Store.viewTasks`: each task with its
  thread, the place of its group, and the summary of its messages, a conversation's group placed by the other
  member, a thread still being started, and no task whose thread or group the replica lacks, and so
  is `Store.listJumpTargets`: the groups by
  the name the person reads, a conversation of two with an active person left to the people and one with several, or
  with someone who is gone, kept, a thread by its title or its opening's words and shown by its title, a mention in an
  opening as the member's current name and the syntax of its markdown not read, no thread without words or without its
  group, the active members but the person, the active agents, and every one in the order of the records,
  and `seen.ts`: the text folded to lower case without accents, the initials of a name, the time of day, the
  full date and time of a moment, the start of a day in the person's own time zone, and the labels of a day, of when a message was, and of how long ago it was, from
  times fixed on the clock of the machine the tests run on, and of when an invitation expires, in days rounded up
  and once it has, and of how many replies a thread has, and of who types in a thread, by name and not the person, and of which messages stack under the one before, within five minutes by the same author and not beside a thread with replies, and of whether an author is an agent, and the short time of day, and a count with the word for one or many, whether a thread's title or opening has the letters searched for, and which statuses leave a task open, and the text of a message and of a thread's row as markdown with the members its mentions may name, and the words of a message and of a thread's row without that markdown's syntax,
  a mention as "@" and the member's current name or the name it recorded, a title as written, and `settingsForm.ts`: the fields an
  integration's form gives, a draft from its defaults or a connection's settings, and the settings a
  draft makes, and `agentSetup.ts`: an agent's draft, and the configuration a draft makes, and `agentActivity.ts`:
  the state of a turn in each status, the turns under way of an agent, ordered, named by place, and carrying the group and the thread each works in, its activity
  from them, idle or by the most pressing state and each place once, and the words for them, and the agents at work
  in one thread from its turns, by state and oldest first, and their line, and the most pressing state of a group's
  turns, whichever agents they are of, and `agentStanding.ts`: the patch of an agent that needs setup, with why, or is
  at work, with where, and none while it is idle or its change is on its way, and the words and motion of its logo,
  and `feature/groups/conversation.ts`: whom a conversation is with, which conversation is with exactly some members,
  and its mark, one member's in their tone, or the first letters of two names, or the letters of an ID before the
  members are read. `Drafts`'
  tests keep a draft for each place, including a conversation's by its people, the last one written, through being closed and opened again.

`bun run --filter @amends-dev/app-v2 build` bundles the app, which CI builds too.
