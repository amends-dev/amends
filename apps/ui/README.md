# Amends UI

The pattern-based design system for web and desktop, built from the Lunacy mocks in
[`design-system/Amends Group Exploration.free`](../../design-system/). The mocks are the
reference: open the file in Lunacy and compare a screen with its story.

This package was built as `@amends/ui-v2` and took the `@amends/ui` name once it had replaced
the earlier UI and the retired `@amends/features` in web and desktop. Screens here are
presentation only: data arrives as props and actions leave as callbacks. Connected logic lives
in [client](../client/README.md) as hooks, and web and desktop join the two. `@amends/ui/styles`
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
  borders, actions, the modal scrim, and eight avatar tones. Every value is the exact light or
  dark color the mocks use. The dark error colors are proposals; the mocks have no dark error
  state yet. Caution (text, a notice surface, and its outline) comes from the Connections frames,
  in light mode only; its dark values follow the sand avatar tone.
- **Typography** ([tokens](src/foundations/typography/tokens.ts)): Inter at 400, 500, and 600,
  in eight roles from `meta` (11/16) to `display` (28/36). The mocks' half-pixel sizes round to
  the nearest role. Import `@amends/ui/foundations/typography/fonts` once at an app entry point.
- **Space** ([tokens](src/foundations/space/tokens.ts)): a 4px grid with 2, 6, and 10px half
  steps. Corners are square throughout; there is no radius scale.
- **Elevation** ([tokens](src/foundations/elevation/tokens.ts)): shadows for modals, popovers,
  and toasts only. Panels are flat and separated by dividers.
- **Theme** ([Theme](src/foundations/theme/theme.tsx)): `<Theme mode="light">` applies a mode's
  variables, Inter, and body text. A nested Theme starts its own scope. Styles read values from
  `vars` in `@amends/ui/foundations/theme`. CSS variable names start with `amends-`.
- **Icons** (**Foundations / Icons**): every drawing from [`@amends/icons`](../icons/README.md),
  searchable, with sizes, weights, and accessible names. Review new drawings here.

## Components

Small pieces the patterns share: `Logo` (the finalized mark; its patch lifts when the link or
button holding it is hovered), `IconButton` (32px or 24px compact), `Avatar` and `AvatarStack`
(square initials in eight tones), `Count` (badge or plain), and `Tabs` (links or buttons, one
scrolling row, underlined current tab). Below 64rem icon buttons, tabs, and navigation rows grow
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
the shell inert, and close on Escape or a click on the scrim, returning focus. Following a link
in the drawer closes it. On phones the pane runs edge to edge and respects safe-area insets. The
desktop app's title bar is not modelled yet. A rail destination is a section, so the current one
is marked `aria-current="true"`; the sidebar marks the page within it. Sidebar items take a count
or, for unseen activity, a dot, and `Sidebar.Empty` is a quiet line in a section with no items. `LiveStatus` is a live region at the bottom of the screen that
says "Connecting…" or "Reconnecting…" while workspace changes have stopped arriving, and stays
empty otherwise.

## Conversation components

`Message` shows an author's avatar beside the byline and text, with optional `Mention`,
`Reactions`, an agent's `Activity`, a `TaskReference`, and a `Replies` summary joined to the
avatar by a stitched elbow; `active` highlights the message whose thread is open. `Divider` is
the running stitch, optionally labelled ("Today", or "4 replies" leading). `TaskStatus` draws
triage, open, in-progress, and done. `Composer` is a form around an auto-growing field: Enter
sends, Shift+Enter starts a new line, and Send waits for non-blank text. The caller owns the
draft so it survives navigation. Given `mentionCandidates`, typing `@` opens suggestions above the
field: arrows move, Enter or Tab choose (inserting `@name` and calling `onMention`), and Escape
closes; `Composer.Mention` starts a mention at the caret and `Composer.Alert` says why a send
failed. Phones use 16px message and field text so the page does not zoom, and give reactions and
the reply summary 44px targets.

A message takes its time as text or as `at`, a `Date` it words as the time of day with the full
date as its title. The reply summary adds an unread dot and a note such as who is typing; a
message with no replies offers `Message.Reply` ("Reply in thread"), shown while the message is
hovered or focused where there is a pointer, and always on touch screens. `focused` sets a
message apart and scrolls to it. Screens word times, days, and typing through `internal/when.ts`,
and key rows by id through `internal/keyed.tsx`, so callers may pass freshly built arrays.

## Form components and the modal

`Button` is primary, secondary, or quiet, with an optional icon or menu chevron. `Field` gives
one control a label, help, and error text, and `Input` and the member picker pick those
associations up. `SearchField` is the quiet filled search. `Choice` is one choice among boxed
options, such as Public and Private, over native radio inputs; its `card` variant stacks
full-width options with a radio and a description, such as where something runs. `Select` is one choice from a
short list shaped like an Input, such as a role: Kobalte's listbox opens as wide as the field
with a check by the current option, and inside a Field it takes the label and help. Options can
carry a second line, and the list can end with an action, such as creating a missing account. `Menu` wraps
Kobalte's dropdown menu for filters, sorting, and pickers; it attaches inside the nearest dialog
or Theme so it keeps the mode. The mocks show menus closed only, so their surface follows the member dropdown.
`MemberPicker` chooses several people by name: chosen people become removable chips and leave
the list, arrows and Enter pick, and Backspace removes the last chip. It is a dropdown on wider
layouts and an always-shown list on phones.

`Badge` labels a property such as visibility, `EmptyState` centers a note where content will
appear, `Notice` boxes a caution for a whole form, such as a key that was not saved, and `Toast` shows a short confirmation with an optional action at the bottom of the
viewport, dismissing itself after five seconds.

`CodeInput` takes a six-digit code in one native field drawn as six cells, so typing, pasting,
and one-time-code autofill work as usual; it can verify as soon as six digits are in. Buttons
have a large size for centered screens, and field errors carry a warning icon.

`Modal` is the fifth pattern: a Pane with `variant="modal"` in a native dialog, so the page
behind is inert, Escape and a click outside close it, and focus returns. It is 640 × 600 capped
to the viewport, 560px wide and as tall as its content with `size="compact"`, 640px wide and as
tall as its content with `size="form"`, or 720 × 864 with `size="wide"`, and fills the screen on
phones. `Modal.Actions` holds its buttons at the end
of a 64px band, sharing the width on phones.

`Centered` is the sixth pattern, for screens outside a workspace: the canvas frames one white
card with the brand at the top left and optional actions at the right, over a 420px form in the
middle or an 800px directory from near the top.

## Screens

Screens take plain data and callbacks; web and desktop fill them from client hooks and own
routing. `WorkspaceNavigation` is the rail and the Home sidebar. `GroupPane` is a group's header
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
stays in the cells for editing. They take client's error codes (`SignInEmailError`,
`SignInCodeError`) and pending actions and own the wording: a problem with the code marks the
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
it words notes such as "Sara followed this thread" or "You were removed from the group".
`GroupThreads` and `ThreadPane` take a `status` (loading, unavailable, failed with Try again),
`earlier` to load older entries, a `sendError` code, and a `follow` bell, filled
(`IconBellFilled`) while following; `GroupPane` takes the tabs to show (with one, the tab row is
left out) and optional settings, search, and member actions. `ThreadPane` can add a "N replies" divider after the first
message. `GroupSettings` can lock visibility, disable renaming, hide adding and leaving, and
report change errors; for a direct conversation it shows only members, and for the workspace's
`general` group it says everyone belongs and offers no Leave; the apps hide adding there too. `GroupDirectory` takes
optional member counts and links, `previews={false}` when unjoined groups cannot be read, a join
error, and loading states. `InboxPane` is the Inbox from the Lunacy Inbox frames: All and
Unread tabs with the unread count, Mark all seen while anything is unread, and notifications
under day seams with who mentioned the reader, replied, or started a thread, where, what was
said, how long ago, and an unread dot; the open one is set apart. Opening one calls `onOpen`.
Unread's empty state is "You're all caught up" with View all activity; All's is "No activity yet".
`ThreadPane` takes a notification `reason` for its subtitle ("Mention · #general") and a
`backLabel` for phones. **Screens / Inbox** walks the mocks' selection flow.
`SettingsPane` is Settings from the Lunacy "Workspace settings" frames, with Workspace and
Members tabs, the member count, Invite people on Members, and loading and failed states.
`WorkspaceSettings` is the Workspace tab: the name with Save changes, the owner with Transfer
ownership, and details (the workspace ID with Copy ID, and its creator); touch layouts stack
the details under the rest. `MemberSettings` is the Members tab: search and an Active/Removed
filter above the roster's member, role, and status columns, then pending invitations with
Revoke and View history; on phones the roster lists each role under the name, and the
invitations become one card that opens the history. `MemberDetails` opens a member in the side
panel with their role (`Select`, and Save role), access, and Remove member. `InviteMember`,
`InvitationHistory`, `TransferOwnership`, `ConfirmRemoveMember`, and `ConfirmRevokeInvitation`
are its modals. They take client's settings codes (`SettingsError`, by `SettingsAction`) and own
the wording, with Refresh when the values are out of date; `settingsToast` words the toast for a
completed change. `ConnectionsPane` is Connections from the Lunacy "Connections" frames, with All
and Needs setup tabs, Add connection, quiet placeholder rows while loading, and a failed state
with Retry. `ConnectionList` searches the connections and lists each with its provider, endpoint,
setup (Configured, or Needs setup and Unavailable in the caution color), and how it
authenticates, with an empty state that offers adding one. `ConnectionDetails` opens one in the
side panel: its setup, the name and the provider's settings as separate saves, and its key, which
is only ever replaced or removed. `ChooseProvider`, `ConfigureConnection`, `ConnectionKey` (for
setup, adding, and replacing), `ConfirmRemoveConnection`, and `ConfirmRemoveKey` are its modals;
they take client's codes (`ConnectionsError`) and own the wording, and `connectionsToast` words the
toasts. `ConfigureConnection` and `ConnectionKey` take `returnTo` for creating a connection on
the way to another form, such as a sandbox account while adding an environment. **Screens / Connections** walks adding a connection and its key, a host without key
storage, an unavailable provider, a read-only member, search, and a stale rename.
`EnvironmentsPane` and `EnvironmentList` are Environments from the Lunacy "Environments" frames:
All and Needs setup, and each environment's harness, sandbox, and readiness, as columns when the
pane has room and under the name beside the details or on phones. `EnvironmentDetails` has an
Overview, with readiness and its recovery, the name, the fixed runtime, and who created it, and a
Sandbox tab, whose `SandboxFields` edit the account, template, variables, commands, and retention,
or whose `SandboxSummary` shows them to members. `AddEnvironment` takes the basics, then the
sandbox settings, and `ConfirmRemoveEnvironment` confirms removal; the wording, including the
mocks' exact error and readiness copy, lives beside them. **Screens / Environments** walks adding
with the account detour, editing variables and commands, a refused account, readiness, and
members' view. Side panes on phones place their tabs under the title. A `Shell.Aside`
rendered inside `Shell.Main`, as a page renders member details,
attaches beside Main, so Main can turn inert while the panel floats. **Screens / Settings** walks
inviting, changing a role, removing, revoking, transferring, and a stale rename. `ChangeName` and
`NewMessage` are compact modals for the account
menu's Change your name and the sidebar's New message, and `WorkspaceNavigation` takes the rail
destinations to show, an optional search, and an account menu (identity, appearance, switch
workspace, settings, change name, sign out); once groups load (`groupsLoading`), an empty Groups
section says "No groups yet". **Screens / Workspace navigation** shows it with and without groups. **Screens / Live conversation** and **Screens /
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
smaller text. Connections' field errors keep the design system's error color and icon where the
mocks draw them in caution, and an unavailable provider's saved settings are labeled by what the
connection stored, since its declaration is gone. Environments' command fields grow to two lines as
drawn; an account's refusal shows under its field rather than in it, and the mocks' Daytona
connection details keep the generic connection layout. The mocks draw different composer toolbars per size; the screens use Attach and Mention, which
the icon set covers, at every size.

## Run and verify

From the repository root:

```sh
bun run --filter @amends/ui dev
bun run test --project @amends/ui
bun run --filter @amends/ui build
bun run check
```

Storybook serves at `http://127.0.0.1:6010` with hot reload on port 6011. The **Mode** toolbar
switches between light, dark, and both side by side.
