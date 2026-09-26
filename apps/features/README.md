# Connected features

`@amends/features` connects the independent client and UI packages. Components
own presentation mappings, while client owns operations/state and UI owns forms.
Routes, page layouts, navigation, API URL, and persistence remain caller-owned.

`@amends/features/sign-in` exports the `SignIn` parts. Mount one `SignIn.Root`
inside `ClientProvider`, with `SignIn.EmailForm` and `SignIn.CodeForm` as children.
Root owns one controller and the parts render their active step. They map errors,
pending actions, and resend feedback. `headingAs` belongs on either form;
`deliveryHint` belongs on CodeForm. Editing
preserves the active input; changing steps focuses the next field. When a credential
exists the parts render no form. The app's directory guard validates that credential and
chooses navigation. No page layout or success route is built into this component.

```tsx
<SignIn.Root>
  <SignIn.EmailForm />
  <SignIn.CodeForm deliveryHint="Find your code in the host's terminal." />
</SignIn.Root>
```

Compose each form once inside the same Root, optionally within ordinary layout
children. Root creates no DOM wrapper. Unmount Root to dispose the flow.

## Workshop

```sh
bun run --filter @amends/features dev
bun run test --project @amends/features
bun run --filter @amends/features build
```

Storybook runs at `http://127.0.0.1:6008` (HMR 6009). The launcher also starts a
loopback-only development host. PostgreSQL must be locally installed, or
`AMENDS_POSTGRES_URL` must name a server allowed to create temporary databases.
It never uses `AMENDS_DATABASE_URL` or loads environment files for the host.

Each story gets a fresh database, development authentication, and memory session.
The production component calls the real HTTP routes and gateway. **Playground**
offers captured delivery, a ten-minute clock advance, failure injection, request
gates, and unmount controls. **Refresh delivery** reveals the latest issued code.
The eight automated stories cover success, rejections, resend, failures, duplicates,
and changing email/unmounting during verification. Success also calls the directory.
Portable tests run those same stories; browser review covers the actual proxy and DOM.

Server fixtures live in `hosts/local/workshop`, browser fixtures in `workshop`,
and neither is exported to consumers. Clock changes affect only sign-in. HTTP
cancellation cannot promise server-side rollback; scenarios also check that released
obsolete work cannot establish a session. Normal unmount deletes the scenario;
stopping the launcher releases remaining databases and its temporary cluster. A
crashed tab may retain a scenario until shutdown; the host limits active scenarios
to twelve. A static Storybook build needs this backend/proxy to run live stories.

Web and desktop compose their own sign-in pages from these parts and UI primitives.
Page layout and navigation remain in those apps.

## Workspace entry

`@amends/features/workspaces` exports `WorkspacePicker` and `CreateWorkspace`.
Mount them inside the existing ClientProvider and DirectoryProvider.

```tsx
<WorkspacePicker.Root>
  <WorkspacePicker.Summary />
  <WorkspacePicker.List workspaceHref={workspaceHref} />
  <WorkspacePicker.Invitations />
  <WorkspacePicker.Empty />
  <WorkspacePicker.Status />
</WorkspacePicker.Root>

<CreateWorkspace.Root onCreated={openWorkspace}>
  <CreateWorkspace.Form />
  <CreateWorkspace.Result />
</CreateWorkspace.Root>
```

The app supplies URLs and navigation callbacks, headings, creation entry, account
actions, and Shell layout. The picker shows active memberships and addressed invitations;
accepting one opens a dialog asking what people there should call the reader, suggested from
their email address. CreateWorkspace's form asks the same of the creator.

`WorkspaceUnavailable` explains why a workspace route cannot open, from the directory. Compose
`Heading`, `Reason`, and `Hint` under `Root workspaceId={id}`; Reason is a Notice for a pending
invitation, an ended membership, or no access. The app supplies the header and navigation. Its
stories set up each case through the real host: Removed, Invited, NoAccess, and Soot.

Workspace stories cover populated/empty directories, creation, lost-response retry,
directory refresh failure, duplicate submissions, and unmounting. Controls also
apply to creation/directory requests; losing a creation response lets the real
commit finish before withholding its response. Fixtures create temporary data through
HTTP and sign in through the normal development flow. See
[workspace entry](../../docs/workspace-entry.md) for the ownership and recovery contract.

## Account

`@amends/features/account` connects the UI AccountMenu parts to session and
appearance state. Compose Account.Root with Trigger and Content; place Identity,
Appearance, Actions, Link, ChangeName, and SignOut inside. Mount under ClientProvider and
AppearanceProvider. The apps supply destination hrefs and Shell placement. Given a
`workspaceId`, Trigger and Identity show the name the reader chose there. ChangeName closes
the menu and calls back, so the app opens `NameDialog`, which it places outside Root, since
the menu's panel closes as the dialog opens. The account workshop signs in through the real
backend and verifies that sign-out retains appearance; **ChangeName** renames the account
holder in a workspace from the menu. See [workspace shell](../../docs/workspace-shell.md).

## Settings

`@amends/features/settings` exports Root and Feedback, WorkspaceName, WorkspaceDetails,
OwnershipTransfer, MemberList, MemberDetail, InviteForm, and InvitationHistory.
Compose the required parts under `Root workspaceId={id} section="workspace"` (or
`members` / `invites`). The app supplies member URLs and selected identity; features
owns no routes or styles. See [workspace settings](../../docs/workspace-settings.md)
for permissions, conflict handling, invitation retry, and workshop coverage.

Mount Root under the app's `WorkspaceFeedProvider` to keep sections current. Lists key their
rows by ID, and name and role editors keep a draft's starting value, so live refreshes keep
focus, dialogs, and drafts, and a stale draft conflicts on save. Live stories rename or invite
through another member's credential and wait for the change without refreshing; `ResumeAfterDrop`
uses the workshop's `drop-changes` control, and `RefreshRecovery` uses `break-directory` and
`restore-directory`, because background refreshes also read the directory.

## Live

`@amends/features/live` exports `Live.Status`, which maps `useWorkspaceFeed()` to a Status in a
persistent live region. It is empty while live and for two seconds after a drop, then shows
"Connecting…" or "Reconnecting…". Mount it inside `WorkspaceFeedProvider`; the apps place it in
the page header's actions. See [live updates](../../docs/live-updates.md).

## Conversations

`@amends/features/conversations` connects the conversation reads to UI:

- `GroupsNavigation` renders the reader's groups as two navigation sections: Groups, teams by name
  with a `#` glyph, and Direct, direct groups by the other people in them with `@`. A group shows a
  count of what is addressed to the reader and a dot when it has new activity. The app supplies
  `href` and the current group. Groups is hidden while the reader has no team groups, unless they
  may create one: readers with `group.create` get a "New group" action in its heading that opens
  `NewGroupDialog`, and the app's `onCreated` decides where the new group leads. Direct always
  shows once the groups load, with a "New message" action that opens `NewMessageDialog`; the app's
  `onMessage` receives the conversation or the people chosen.
- `NewMessageDialog` chooses people and agents to message with the ChipPicker. When the reader
  already has a direct group with exactly them, it says so and offers to open it; otherwise it
  offers to start one, handing the people to the app.
- `DirectDraft` is the page for a conversation that does not exist yet: an empty state and a docked
  composer whose first message creates the direct group, with the chosen people as mention
  suggestions. When the reader has, or gains, a conversation with exactly them, `onGroup` hands it
  over. `DirectDraftName` names the people, as the page title.
- `NewGroupDialog` names a private team group and chooses its active people and agents with the
  UI ChipPicker, the reader fixed as "you". Create stays disabled until the name has text, failures
  explain themselves and keep the input, and closing clears it.
- `GroupRenameAction` is a quiet "Rename" for beside a team group's name, shown to readers who may
  rename it. Its dialog opens on the current name, focused and selected, and saves only a
  different valid name. If someone renamed the group meanwhile, it names their name and keeps the
  draft, and saving again replaces it.
- `GroupMembersAction` is a group header's member count, opening its members: the reader first,
  then everyone by name, keyed by admission so live refreshes keep rows and focus. Managers add
  people with the ChipPicker and remove members; anyone leaves a team group. Removing and leaving
  ask first in the row, moving focus to the answer and back on Cancel. The app's `onLeft` decides
  where leaving leads.
- `GroupStream` renders a group's stream as a Transcript: each thread's opening message with day
  seams, oldest first, opening at the newest. Each links to its thread with its reply count and
  when the last reply came, or "reply in thread"; the open thread's link is marked current, and a
  thread with activity the reader has not seen carries an unread dot. While the stream is visible,
  it catches the reader up with the group whenever the group has something new. A thread's row shows
  who is typing in it in place of when its last reply came.
  "Show earlier threads" reads further back. It has loading, empty, unavailable, and retry
  states.
- `ThreadPanel` is the content of the shell's inspector for one thread: its header with a message
  count and close action, and the thread's messages in compact density, with "Show earlier
  messages". Between them, quiet notes say when someone followed the thread, stopped following,
  left the group, or was removed from the group or workspace, naming the reader "You"; joining by
  writing or being mentioned shows in the message itself. Notes add nothing to the count. Given a `focus` position, such as the message that notified the reader, it reads back
  until that message is loaded, sets it apart, and opens at it. While visible, it reads the thread through the newest activity it shows, and it shows who else
  is typing under the messages. The app places it in `Shell.Inspector` and owns where closing leads.
  Once a refresh says the reader can no longer read the thread, it shows that instead of the
  messages it last read, and the stream does the same for its group, as does the header's member
  count, until access returns.
  **LosingAccess** covers both, leaving and rejoining from another session.
- `GroupName` renders a group's name as text, the same way the navigation names it.
- `Inbox` renders the reader's inbox newest first with the UI Inbox cards: why each notification
  came (who mentioned them, replied in a thread they follow, or started a thread in a group they
  follow, and where), when, what was said, a link that opens its thread, and "Mark seen" while it
  is pending. "All" or "Unread" choose what it lists, "Mark all seen" marks everything through the
  newest one listed while any are pending, and "Show older" reads further back. A notification
  whose thread the reader can no longer see says so, without a link. The app supplies each thread's
  `href`, given the position that notified the reader, and the thread open beside it.
- `GroupFollowAction` follows or stops following a team group, and `GroupFollowNote` says what
  following means for the reader now; direct groups show no action. The thread panel's header
  follows or unfollows its thread, and its meta line says when the reader follows it.
- `NewThreadComposer` and `ReplyComposer` write a new thread in a group and a reply in a thread.
  They show what sending does, or why it failed, and keep the draft for another try. Typing `@`
  suggests the group's other members from its roster, and a chosen member is mentioned while
  their `@name` stays in the text; messages show their mentions set apart. The stream
  docks the first under itself while the group is readable, and the thread panel docks the
  second under the thread.

Authors are named by the name they chose in the workspace, or by their identity until they
choose one. Times use the reader's locale: a
message shows its time of day with the full date as its title, and day seams read Today,
Yesterday, a weekday within the week, or the date. The **Features / Conversations** stories run a
group through the real host: the owner reads a stream a member started, opens a thread, and its
controls post as the member, so replies and new threads arrive over the live feed. **Writing**
starts a thread from the page, mentions the other member, replies in a thread, and returns to
find a draft kept. **Reading** shows the member's threads unread, clears the group's dot by
viewing it, and clears a reply's dot and count by opening its thread. **Typing** shows the member
typing in the open thread and its row until their reply arrives. **Following** follows the group
and sees the member's next thread reach the owner, then follows and unfollows a thread, noted in
its timeline. **Departures** sees the member leave the group from their own session and the open
thread note it live.
**CreateGroup** creates a group with the other member from the sidebar and opens it empty.
**Members** adds a third person to the group, removes the member, and leaves.
**Rename** renames the group and sees the new name wherever it is named. **RenameConflict** has
the owner rename it from another session while the dialog is open, sees the save refused with the
new name, and saves again to replace it.
**DirectMessage** messages the member for the first time from Direct, lands in the new
conversation, and finds it again from New message.
**Inbox** shows the owner's inbox with the member's mention and reply newest first, marks one
seen, opens the other's thread beside the inbox to settle it, takes a new mention over the live
feed, and narrows to what is unread.
