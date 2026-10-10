# Amends UI

The pattern-based design system for web and desktop, built from the Lunacy mocks in
[`design-system/Amends Group Exploration.free`](../../design-system/). The mocks are the
reference: open the file in Lunacy and compare a screen with its story.

This package was built as `@amends-dev/ui-v2` and took the `@amends-dev/ui` name once it had replaced
the earlier UI and the retired `@amends-dev/features` in web and desktop. Screens here are
presentation only: data arrives as props and actions leave as callbacks. Connected logic lives
in [client](../client/README.md) as hooks, and web and desktop join the two. `@amends-dev/ui/styles`
holds the global styles app entry points load.

## Structure

The design is six layout patterns built from a small set of components:

1. **Rail**: the leftmost column of global destinations.
2. **Sidebar**: the destination's items, such as Inbox, Triage, Tasks, groups, and direct messages.
3. **Main content**: a header, tabs, a scrolling body, and a bottom bar such as the composer.
   Header, tabs, and bottom bar stay in place while the body scrolls.
4. **Side panel**: further content beside the main content, such as an open thread.
5. **Modal**: the main-content structure in a dialog: header, tabs, body, and actions.
6. **Centered screen**: standalone screens such as sign-in and the workspace picker.

Source follows that order: `foundations` (color, type, space, elevation, theme), then components,
patterns, and screens as they are introduced.

## Foundations

- **Color** ([tokens](src/foundations/color/tokens.ts)): semantic roles for surfaces, text,
  borders, actions, the modal scrim, eight avatar tones, and three status tones. Every value is
  the exact light or dark color the mocks use in the default Neutral palette. Optional
  [palettes](src/foundations/color/palettes.ts) explore Linen (paper and terracotta), Sage (green
  and forest), and Slate (blue and ink), each in both modes. These are intentional color
  experiments beyond the mocks; layout, typography, avatar identity, and status tones stay the same.
  Their primary, secondary, and muted text on all palette surfaces, and text on primary buttons,
  meet a minimum 4.5:1 contrast ratio, checked in foundation tests. The status tones (`status.success`, `caution`, and
  `danger`, each a `mark`, `text`, `surface`, and `border`) come from the Lunacy "Status v01"
  board: a mark is the only saturated color, and text, surface, and border make a notice in the
  tone. Offline has no tone; its mark is a ring in `text.muted`. `border.danger` stays the strong
  outline of invalid input, whose dark value is a proposal.
- **Typography** ([tokens](src/foundations/typography/tokens.ts)): Figtree at 400, 500, and 600
  (the mocks draw Inter; Figtree was chosen for the app),
  in eight roles from `meta` (11/16) to `display` (28/36). The mocks' half-pixel sizes round to
  the nearest role. Geist Mono (`monoFamily`) sets code and values people copy exactly: code in
  messages and the composer, commands, environment variables, and model IDs, where `Combobox`
  takes `monospace`. Import `@amends-dev/ui/foundations/typography/fonts` once at an app entry
  point.
- **Space** ([tokens](src/foundations/space/tokens.ts)): a 4px grid with 2, 6, and 10px half
  steps. Corners are square throughout; there is no radius scale.
- **Elevation** ([tokens](src/foundations/elevation/tokens.ts)): shadows for modals, popovers,
  and toasts only. Panels are flat and separated by dividers.
- **Theme** ([Theme](src/foundations/theme/theme.tsx)): `<Theme mode="light" palette="linen">` applies a mode and palette's
  variables, the typeface, and body text. A nested Theme starts its own scope. Styles read values from
  `vars` in `@amends-dev/ui/foundations/theme`. Omitting `palette` selects Neutral, including in
  nested scopes. CSS variable names start with `amends-`.
- **Icons** (**Foundations / Icons**): every drawing from [`@amends-dev/icons`](../icons/README.md),
  searchable, with sizes, weights, and accessible names. Review new drawings here.

## Components

Small pieces the patterns share: `Logo` (the finalized mark; its patch lifts when the link or
button holding it is hovered, and `motion` loops the Amends Logo board's turn-6 motions: `sew-on`
for a launch, `thread` to idle, `tug` for something done, and `working` as a loader),
`TurnStatus` (an agent's turn as a chip, and `TurnActivity`, the same mark with a quiet phrase:
queued, working, and stopping move as the logo's `thread`, `working`, and `tug` motions, still under
reduced motion; done, failed, and stopped are still, a failure outlined in the caution color),
`StateArt` (the board's turn-7 empty and error states, drawn from the mark's parts: `sew-in`,
`reach`, `fill`, `caret`, `rest`, `came-apart`, `lost-thread`, `nothing-here`, and `held-back`,
each still for readers who prefer reduced motion), `IconButton` (32px or 24px compact), `Avatar` and `AvatarStack`
(square initials in eight tones; `status` adds a patch over the corner and joins its label to the
accessible name), `StatusMark` (a state as a shape, so it reads without color: a filled square for
online or ready, a hollow one for offline, a triangle for needs setup, and a square with a bar for
can't run or unavailable, cut into the surface behind it where `--amends-status-knockout` says;
`Status` carries its words and why), `Tooltip` (a state's words on hovering a mark with no room for
them; a span trigger, so it sits inside links, and never the only way to reach the words),
`Count` (badge or plain), and `Tabs` (links or buttons, one scrolling row, underlined current
tab). Below 64rem icon buttons, tabs, and navigation rows grow
to 44px touch targets.

## The shell

`Shell`, `Rail`, `Sidebar`, and `Pane` implement the first four patterns:

```tsx
<Shell.Root>
  <Shell.Navigation>
    <Rail.Root>…Rail.Brand, Rail.List of Rail.Item, Rail.Footer…</Rail.Root>
    <Sidebar.Root aria-label="Workspace">…Header, Body, Sections…</Sidebar.Root>
  </Shell.Navigation>
  <Shell.Main>
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkChannel} context="Mercier & Co">
          general
        </Pane.Title>
        <Pane.Actions>…</Pane.Actions>
        <Pane.Tabs>
          <Tabs.List aria-label="Group">…</Tabs.List>
        </Pane.Tabs>
      </Pane.Header>
      <Pane.Body>…</Pane.Body>
      <Pane.Footer>…composer…</Pane.Footer>
    </Pane.Root>
  </Shell.Main>
  <Show when={thread()}>
    <Shell.Aside aria-label="Composer paste crash" onClose={closeThread}>
      <Pane.Root variant="side">…Pane.Back, Pane.Title, Pane.Close, Pane.Subtitle…</Pane.Root>
    </Shell.Aside>
  </Show>
</Shell.Root>
```

A Pane's header, tabs, and footer stay in place while its body scrolls. Headers are 96px on
desktop and 104px on touch layouts, so the main and side panes line up. The layout follows the
viewport width ([layout tokens](src/foundations/layout/tokens.ts)):

| Width           | Navigation                                        | Side panel                                  |
| --------------- | ------------------------------------------------- | ------------------------------------------- |
| 80rem (1280px)+ | Rail and 264px sidebar                            | 440px, beside the main content in one card  |
| 64–80rem        | Rail and sidebar                                  | 440px, floating over a scrim                |
| 48–64rem        | Rail; the menu button opens the sidebar beside it | Floating                                    |
| below 48rem     | The menu button opens rail and sidebar together   | Full screen with Back; main keeps its state |

The drawer and a floating side panel behave as modal dialogs: they take focus, make the rest of
the shell inert, and close on Escape or a click on the scrim, returning focus. Following a sidebar
link in the drawer closes it; a rail link switches the sidebar and leaves the drawer open. On phones the pane runs edge to edge and respects safe-area insets. The
desktop app's title bar is not modelled yet. A rail destination is a section, so the current one
is marked `aria-current="true"`; the sidebar marks the page within it. Sidebar items take a count
or, for unseen activity, a dot; `activity` shows the logo moving where agents work, and `status`
puts a status patch on the item's avatar, or at the end of an item without one, with its words on
hover and after the label in the link's accessible name. `Sidebar.Empty` is a quiet line in a
section with no items, and a destination's first section starts where Home's first items do.

Every destination uses the patterns the same way: the rail picks it, its sidebar lists its items
under section headers with Browse and Create, the main content shows the list or one item with
tabs, and the side panel holds only something inside what the main content shows. A page about
one item puts its sections in `Pane.Column`, one column 680px at most; nothing sits beside it.
`Pane.Title` takes a `person` for an avatar in place of the icon, as an agent's page does. `LiveStatus` is a live region at the bottom of the screen that
says "Connecting…" or "Reconnecting…" while workspace changes have stopped arriving, and stays
empty otherwise.

## Conversation components

`Message` shows an author's avatar beside the byline and text, with optional
`Reactions`, an agent's `Activity`, a `TaskReference`, and a `Replies` summary joined to the
avatar by a stitched elbow; `active` highlights the message whose thread is open. `Divider` is
the running stitch, optionally labelled ("Today", or "4 replies" leading). `TaskStatus` draws
triage, open, in-progress, and done. `Composer` is a form around a Tiptap (ProseMirror) editor
that formats the draft as it is written, with RichText's element styles, so the draft reads as the
message will. The caller owns the draft, as markdown, so it survives navigation; the editor reads
it in and writes it back with Tiptap's markdown extension over the same `marked` as RichText.
Enter sends and Shift+Enter starts a new line, list item, or code line, or, ending a line of only
` ``` ` (or ` ```ts `), a code block; Send waits for non-blank
text. `Composer.Formatting` is a toolbar of bold, italic, strikethrough, link, numbered and
bulleted lists, quote, code, and code block, each pressed while it applies and unavailable where it
cannot, with Slack's shortcuts (⌘B, ⌘I, ⌘⇧X, ⌘⇧U, ⌘⇧7, ⌘⇧8, ⌘⇧9, ⌘⇧C, ⌘⌥⇧C) beside Tiptap's own.
`Composer.FormattingToggle` shows or hides it; phones start with it hidden. Markdown typed as it is
written becomes its formatting, at the start of a block or of a line after a line break, and plain
text pasted outside code reads as markdown. Text that only looks like markdown is escaped when the
draft is written out, including a line starting with "#", "-", "+", or "1.", or of only "-" or "=",
so the message shows it as typed. A link's address, from the toolbar or ⌘⇧U, is written in
a form above the composer; web and email addresses link, and a bare domain is a web address. Given
`mentionCandidates`, typing `@` opens suggestions above the composer: arrows move, Enter or Tab
choose, inserting the member as one piece that deletes whole and is written as their mention link,
and Escape closes. Given `commands` (a name and what it does), typing "/" as the whole draft lists
those starting with what follows it the same way; choosing one clears the draft and calls
`onCommand` in place of sending, and "/" anywhere else, or after Escape, is text; `Composer.Mention` starts a mention at the caret and `Composer.Alert` says why a
send failed. Phones use 16px message and field text so the page does not zoom, and give reactions
and the reply summary 44px targets.

`RichText` renders markdown in the surrounding type, as `Message.Text` holds it: paragraphs with
line breaks where the text has them, emphasis, strikethrough, inline code and code blocks, lists
and task lists, quotes, tables that scroll sideways when wide, rules, and links. Mentions are links
to `member:<id>`, named from its `mentions` as members are called now, or by the name the text
recorded for anyone else. It never renders HTML: raw HTML shows as written, images show as links to
them without loading, and only web and email addresses link, opening in a new tab. `inline`
flattens it to one run of words and mentions for previews; `streaming` closes formatting left open
at the end of text still arriving, and `caret` marks where it continues. Blocks that did not change
keep their elements as streamed text grows.

A message takes its time as text or as `at`, a `Date` it words as the time of day with the full
date as its title. The reply summary adds an unread dot and a note such as who is typing; a
message under the pointer, or holding focus, is lit and floats `Message.Actions` at its top right, a
bordered row of `Message.Action` icon buttons that takes no room in the message. The timeline puts
Reply in thread there for every thread's opening message and View turn log for an agent's reply,
noting nothing under the message. On touch screens, with nothing to hover, a tap focuses the
message to show its Actions, and a message with no replies also offers `Message.Reply` ("Reply in
thread") under it. Elsewhere it shows only while someone is typing or an agent is at work in the thread, and says
just that, such as "Yumi working", which also opens the thread. `focused` sets a
message apart and scrolls to it. `continued` stacks a message under its author's one before, 6px
beneath it with no avatar or name, its time in the avatar's place while hovered or focused;
assistive technology still hears the author and time. Screens word times, days, and typing through `internal/when.ts`,
and key rows by id through `internal/keyed.tsx`, so callers may pass freshly built arrays.

`Profiles` draws the Lunacy "Profile cards / Compact" frames: a card naming a member, whether they
are a person or an agent (and the reader, or a former member), and what the reader can do.
`Profiles.Root` takes `profile`, which looks members up by ID, and the `onMessage`, `onOpenAgent`,
and `onChangeName` actions; it shows one card at a time, fixed under its trigger or above it where
there is no room below, and closes it if the trigger leaves the page or scrolls out of view.
`Profiles.Trigger` opens its member's card after 250ms of hover, with 150ms to cross to the card
before it closes, and at once on keyboard focus; a click, tap, Enter, or Space keeps it open until
Escape or a click outside. Tab from the trigger reaches the card's actions, and Escape returns
there. The reader's own card offers Change name, an agent's Message and Open agent, anyone else's
Message, and a former member's nothing; an ID `profile` does not know shows "Profile unavailable".
Inside a Root, a message whose author has an `id` makes the name and avatar triggers (the avatar is
hidden from assistive technology, which meets the name), RichText's mentions are triggers except in
`inline` previews, and a mention in the composer's draft opens its card on hover. Outside one,
triggers are their contents. **Components / Conversation**'s Profile cards story walks them from
the keyboard. A profile's `status` puts its patch on the card's avatar and its words after the
kind, such as "Agent · Working in #design" with the logo moving or "Agent · Needs setup" in the
caution tone, with why under them.

## Form components and the modal

`Button` is primary, secondary, or quiet, with an optional icon or menu chevron. `Field` gives
one control a label, help, and error text, and `Input` and the member picker pick those
associations up. `SearchField` is the quiet filled search. `Choice` is one choice among boxed
options, such as Public and Private, over native radio inputs; its `card` variant stacks
full-width options with a radio and a description, such as where something runs. `Select` is one choice from a
short list shaped like an Input, such as a role: Kobalte's listbox opens as wide as the field
with a check by the current option, and inside a Field it takes the label and help. Options can
carry a second line, a third for a reason, and a status at their end (`ready` with a check, or
`caution`), may be shown but disabled, can sit under a `heading`, and the list can end with an
action, such as creating a missing account. `Combobox` takes free text with suggestions, shaped
like a Select: typing narrows them, choosing one enters its value, and text matching none can be
kept as entered, such as a model ID. `TextArea` is the Input's look for several lines.
`FormFields` draws a form described as data, such as an integration's settings, into the form
around it: text in an Input of its format's type, a number with its bounds, yes or no as two
choices, and options in a Select that offers "Not set" for a field the form does not require. Each
says what it refuses from the `FormIssue` its caller found: its shape, length, or size. `Menu` wraps
Kobalte's dropdown menu for filters, sorting, and pickers; it attaches inside the nearest dialog
or Theme so it keeps the mode. The mocks show menus closed only, so their surface follows the member dropdown.
`MemberPicker` chooses several people by name: chosen people become removable chips and leave
the list, arrows and Enter pick, and Backspace removes the last chip. It is a dropdown on wider
layouts and an always-shown list on phones.

`Badge` labels a property such as visibility, `EmptyState` centers a note where content will
appear, over the `StateArt` its `art` names, or the working mark while something is awaited, `Notice` boxes a caution or danger for a whole form or page, such as a key that was not saved or an agent that cannot run, with its mark and at most one action that fixes it, and `Toast` shows a short confirmation with an optional action at the bottom of the
viewport, dismissing itself after five seconds.

`CodeInput` takes a six-digit code in one native field drawn as six cells, so typing, pasting,
and one-time-code autofill work as usual; it can verify as soon as six digits are in. Buttons
have a large size for centered screens, and field errors carry a warning icon.

`Modal` is the fifth pattern: a Pane with `variant="modal"` in a native dialog, so the page
behind is inert, Escape and a click outside close it, and focus returns. It is 640 × 600 capped
to the viewport, 560px wide and as tall as its content with `size="compact"`, 640px wide and as
tall as its content with `size="form"`, 720 × 864 with `size="wide"`, or 640 × 480 near the top
with `size="palette"`, for a search that keeps its place as results narrow, and fills the screen
on phones. `Modal.Actions` holds its buttons at the end
of a 64px band, sharing the width on phones.

`Centered` is the sixth pattern, for screens outside a workspace: the canvas frames one white
card with the brand at the top left and optional actions at the right, over a 420px form in the
middle or an 800px directory from near the top.

## Screens

Screens take plain data and callbacks; web and desktop fill them from client hooks and own
routing. `WorkspaceNavigation` is the rail and the sidebar's workspace header around the current
destination's sidebar, its children: `HomeSidebar` (Inbox, Triage, Tasks, groups, and direct
messages) or `DestinationSidebar`, which lists a destination's `NavigationSection`s of items, each
with Browse and Create beside its title. `GroupPane` is a group's header
and tabs around the current tab, `GroupThreads` is its Threads tab (timeline and composer), and
`ThreadPane` is an open thread in the side panel. `GroupTasks` is the Tasks tab: search, status
and assignee filters, and sorting that stay above the task list, with the status and key
columns giving way on narrower layouts. `TaskPane` opens a task in the side panel with its
state and assignee pickers, description, a link to where it started, and its activity.
`CreateGroup` creates a group in a modal with its name, visibility, and first members, the
reader locked in as "You"; the member list opens upward when the modal has more room there.
A new group's Threads tab shows a welcome naming its members. `GroupDirectory` is the Groups
page: Your groups and Discover, with search, visibility, member counts, and Join. A public
group the reader has not joined opens as a preview: Back, a Public badge, and a prompt to join
in place of the composer; its threads open without a composer too.
`SignInEmail` and `SignInCode` are sign-in's two steps: an email address, optionally with other
providers under "or", then the six-digit code with Change email and Send again; a wrong code
stays in the cells for editing. They name the error codes client returns (`SignInEmailError`,
`SignInCodeError`), take them with pending actions, and own the wording: a problem with the code marks the
field, while a failed request shows as a `Field.Alert` under it. Each step focuses its field
when it appears, and a new code is announced and refocuses the cleared field. `WorkspacePicker`
lists the reader's workspaces and invitations with Open and Accept invite, falling back to
invitations only or a first-workspace empty state. Accept invite opens "Join {workspace}" to
choose what people there call the reader; joining closes it with a toast and focuses the
workspace, and failures (`AcceptInvitationError`) stay in the dialog. A failed refresh shows
above the lists with Try again. `CreateWorkspace` asks for a workspace name and the reader's
name there in a compact modal, then shows the created workspace while the list reloads, with
Try again if that fails. Rows are keyed by id through `internal/keyed.tsx`, so callers may pass
freshly built arrays without remounting rows. `StandaloneScreen` frames pages outside a
workspace with the brand and, when signed in, the account and Sign out; `CheckingSessionScreen`,
`HostUnavailableScreen`, `NotFoundScreen`, `CrashedScreen`, and `WorkspaceUnavailableScreen`
build the app's other states on it and on EmptyState, which takes a heading `level` and
actions as children.
`GroupSettings` is the settings modal: General (name, visibility, and your membership) and
Members (add and remove people); on phones, adding members opens its own full-screen view. `Timeline` renders messages, dividers, and participation notes from
`TimelineEntry` data, and conversations read from the bottom: they open at the newest message
and follow new ones while the reader is at the end. With `days` it puts a seam (Today,
Yesterday, a weekday within the week, then the date) before each new day of dated entries, and
it words notes such as "Sara followed this thread" or "You were removed from the group". An
author's messages in a row stack, as in Slack: one by the same author `id` within five minutes of
the one before, with nothing between them, continues it. A thread's replies summary ends a stack
and starts its own, since its elbow hangs from the avatar, and messages without an author id or
`at` never stack.
`GroupThreads` and `ThreadPane` take a `status` (loading, unavailable, failed with Try again),
`earlier` to load older entries, a `sendError` code, and a `follow` bell, filled
(`IconBellFilled`) while following; `GroupPane` takes the tabs to show, in a row even when there is
one, and optional settings, search, and member actions. `ThreadPane` can add a "N replies" divider after the first
message. `GroupSettings` can lock visibility, disable renaming, hide adding and leaving, and
report change errors, and `focusName` opens it with the name selected for a rename; for a direct conversation it shows only members, and for the workspace's
`general` group it says everyone belongs and offers no Leave; the apps hide adding there too. `GroupDirectory` takes
optional member counts and links, `previews={false}` when unjoined groups cannot be read, a join
error, and loading states. `InboxPane` is the Inbox from the Lunacy Inbox frames: All and
Unread tabs with the unread count, Mark all seen while anything is unread, and notifications
under day seams with who mentioned the reader, replied, or started a thread, where, what was
said on one line that ends in an ellipsis when there is more, how long ago, and an unread dot; the
open one is set apart. Opening one calls `onOpen`.
Unread's empty state is "You're all caught up" with View all activity; All's is "No activity yet".
`ThreadPane` takes a notification `reason` for its subtitle ("Mention · #general") and a
`backLabel` for phones. **Screens / Inbox** walks the mocks' selection flow.
`SettingsPane` is one section of Settings from the Lunacy "Workspace settings" frames, Workspace
or Members as the Settings sidebar chooses, with Invite people on Members, and loading and failed
states. `WorkspaceSettings` is the Workspace section in one column: the name with Save changes,
details (the workspace ID with Copy ID, and its creator), then the owner with Transfer ownership.
`MemberSettings` is the Members section: search and an Active/Removed
filter above the roster's member, role, and status columns, then pending invitations with
Revoke and View history; on phones the roster lists each role under the name, and the
invitations become one card that opens the history. `MemberDetails` opens a member in the side
panel with their role (`Select`, and Save role), access, and Remove member. `InviteMember`,
`InvitationHistory`, `TransferOwnership`, `ConfirmRemoveMember`, and `ConfirmRevokeInvitation`
are its modals. They name the settings codes client returns (`SettingsError`, by `SettingsAction`) and
own the wording, with Refresh when the values are out of date; `settingsToast` words the toast for a
completed change. `ConnectionsPane`, `ConnectionList`, and `ConnectionPane` are Connections, over the
integrations a host installs, with no mocks yet: the list has All, Models,
Tools, Sandboxes, and Harnesses tabs, and a connection's page checks whether it works (Working, Key
refused, Settings don’t work, or Couldn’t reach it), then holds its name, its integration's
settings through `FormFields`, its key, which is only replaced, its details with the integration's
documentation, and removal. A connection whose integration is gone lists its saved settings and
offers only removal. `ChooseIntegration` searches the integrations by name, `ConfigureConnection`
takes the name, settings, way of authenticating, and key in one step, and `ReplaceKeyV2` and
`ConfirmRemoveConnection` are its other modals. **Screens / Connections** walks adding and checking a connection,
a refused key and a refused setup, a gone integration, a host without key storage, a read-only
member, search, and a stale rename.
`AgentsPane`, `AgentList`, and `AgentPane` are Agents, over connections, with no mocks
of their own: they follow the Agents frames' navigation and the
Connections page. The list has All and Needs setup, and each agent's harness, with its sandbox,
its model, and where it is at work as columns, or under the name on phones, with its state as a
patch on its avatar. The agent's page reads in one column: a notice listing why it can't run, its
name, its setup saved as a whole, its details, with each turn in progress opening its log, and
removal. `SetupFields` is the setup both it and `AddAgent` ask for: the
instructions, the harness or Auto, the model connection, the model, which the connection's list
suggests and which may be any other when it takes models it doesn't list, the effort the chosen
model takes, and the sandbox, warning when the harness works only in one. A connection the agent
names that is removed or not installed stays chosen and shows as Unavailable, and what the host
refuses shows beside the field it concerns. `ConfirmRemoveAgent` confirms removal, which ends
the agent's membership. **Screens / Agents** walks adding an agent, the roles the reader may give, agents at work and
idle, a removed sandbox and a harness that needs one, listed models and efforts, models that load or fail, a refused connection, Auto
with no harness, removal, a read-only member, search, and a stale rename.
`agentStatus` and `connectionStatus` word each one's state as a `Status` for the sidebar,
profile cards, and rows the apps compose: an agent at work says where, and one that is ready and
idle has none. `TurnRow` shows an agent's turn as a compact row,
from the Lunacy "Turn activity" frames: the agent, its state, View log, and Stop or Retry for a
reader who may direct it, with a failure's reason and Agent settings, and a refused command worded
from its `TurnProblem` code; it moves its actions under the name when too narrow. A timeline's
`turn` entries render as these rows where the agent took on the work, keyed by turn so Stop keeps
its focus, when the `Timeline` or `ThreadPane` has `turns` controls; the timeline offers View turn
log in an agent's reply's actions; a thread's replies and a sidebar group mark where agents work.
`TurnLogPane` shows a turn's log in place of its thread: where it runs and its harness, model,
and sandbox, its activity, the reply draft streaming with a caret (paused while reconnecting), next steps for a
failure, and a footer that follows live, offers "New activity · Jump to latest" once the reader
scrolls up, or offers Retry turn or View reply. **Screens / Turns** walks each state, the log's
states, and a stop and retry. `ButtonLink` is a link drawn as a button, for actions such as Agent
settings that lead elsewhere. Side panes on phones place their tabs under the title. A `Shell.Aside`
rendered inside `Shell.Main`, as a page renders member details,
attaches beside Main, so Main can turn inert while the panel floats. **Screens / Settings** walks
inviting, changing a role, removing, revoking, transferring, and a stale rename. `ChangeName` and
`NewMessage` are compact modals for the account
menu's Change your name and the sidebar's New message. `JumpTo` jumps anywhere by name: a palette
of places grouped in sections (a label, an icon or a person's avatar, and a quiet detail), narrowed
as the reader types by a name's start, a word's start, or anywhere in it, five a section before
typing and eight after; arrows move, Enter goes, and Escape closes. The apps open it from ⌘K or
Ctrl+K, the sidebar's "Find anything", and the rail's Search. **Screens / Workspace dialogs** shows
it. `WorkspaceNavigation` takes the rail
destinations to show, an optional search, and an account menu (identity, appearance, switch
workspace, settings, change name, sign out); once groups load (`groupsLoading`), an empty Groups
section in `HomeSidebar` says "No groups yet". **Screens / Workspace navigation** shows Home with
and without groups, and the Agents sidebar with an agent open and with none. **Screens / Live conversation** and **Screens /
Workspace dialogs** exercise these over dated data. **Screens / Group threads** composes them
with the Lunacy sample data, and **Screens / Group tasks**, **Group settings**, **Create group**,
and **Browse groups** add the rest of the group flows to the same working workspace: switching
groups, the directory, previewing and joining, creating a group, and toasts. **Screens / Sign
in** and **Screens / Workspaces** walk from email to code (the workshop accepts 314159) to the
workspace picker, accepting invitations and creating workspaces; **Screens / Standalone** shows
the other states. Their interaction stories run as tests.

Accepting an invitation asks what people there should call the reader before joining, which the
mocks skip, and creating a workspace asks the same; the standalone states have no mocks and
follow the Centered pattern. The
preview's join prompt spans the main content only; the open thread beside it simply has no
composer. Tab counts are plain numbers everywhere, where some mocks draw them as badges.
The settings copy says "group" where the mocks said "channel", and the visibility help follows
the chosen option. Task panel messages use the standard message size rather than the mock's
smaller text. The mocks draw different composer toolbars per size; the screens use Attach and Mention, which
the icon set covers, at every size, and add Formatting and its toggle, which the mocks do not draw;
pressed formats share the selected row's fill.

## Run and verify

From the repository root:

```sh
bun run --filter @amends-dev/ui dev
bun run test --project @amends-dev/ui
bun run --filter @amends-dev/ui build
bun run check
```

Storybook serves at `http://127.0.0.1:6010` with hot reload on port 6011. The **Mode** toolbar
switches between light, dark, and both side by side. **Palette** applies a color family to any
story. **Foundations / Theme / Try palettes** compares them in a populated conversation;
switching colors and mode preserves the draft. The workspace account menu offers palette
selection when its caller supplies `onPaletteChange`.
