# Workspace shell

Opening `/workspaces/:workspaceId` shows Home inside the app-owned workspace layout, built on the
[UI](../apps/ui/README.md) Shell pattern from the Lunacy mocks in
`design-system/Amends Group Exploration.free`: a rail, a sidebar, the main content, and a side
panel.

- **Rail**: the brand, the Home, Environments, and Connections destinations, then Settings and
  the reader's avatar, which opens the account menu. A destination is a section, marked
  `aria-current="true"`; Home covers Inbox, Triage, Tasks, groups, and direct messages.
- **Sidebar**: the workspace (which switches workspace), Inbox with the count of what is pending
  for the reader, Triage, Tasks, then Groups and Direct messages. Groups' title links to the
  directory at `/groups`, with Browse groups (the Discover tab) and, for readers who may create
  groups, Create group. Each group shows the reader's pending count, or a dot for activity they
  have not seen. Direct messages lists direct groups by their other people, with New message.
- **Main**: one pane per page. `/groups/:groupId` shows the group's pane: its name, member stack,
  follow bell, settings, and its threads with the composer. `/groups` is the directory: Your
  groups and Discover, with Join.
- **Side panel**: `…/groups/:groupId/threads/:threadId` opens a thread beside its group, and
  `/inbox/groups/:groupId/threads/:threadId` beside the inbox, at the message that notified the
  reader. Closing returns to the group or the inbox. The panel sits beside the content from 80rem,
  floats over it below that, and fills the screen on phones.

Below 64rem the sidebar moves into a drawer beside the rail, opened from each pane's menu button;
below 48rem rail and sidebar open together. Following a link, Escape, or the scrim closes it. The
shell is keyed by workspace: switching workspaces builds a new one for its groups and names.
A missing or removed membership shows the [unavailable page](workspace-entry.md) outside the
workspace layout. Sign-in preserves supported nested destinations.

## Groups and threads

Client view hooks shape the conversation reads for the screens: `useWorkspaceGroups`,
`useGroupConversation`, `useThreadConversation`, `useMentionCandidates`, and `useGroupPeople`
name people and groups, resolve mentions, and report loading, unavailable, and failed states;
the screens word them. A group's stream shows each thread's opening message, oldest first under
day seams, with its reply count, an unread dot, and who is typing. A message with no replies
offers "Reply in thread" while hovered or focused, and always on touch screens. Seeing a group
catches the reader up with it, and an open thread is read through its newest message. The
composer starts a thread; in the side panel it replies. Typing `@` suggests the group's other
members.

A team group's bell follows it, so new threads there include the reader, or stops: it is filled
while the reader follows, and a toast confirms each change once it lands ("Following #design",
"Unfollowed #design"). In the side panel the bell follows the thread, filled the same way. Direct
conversations have no bell, since everyone takes part in every thread. The member stack and
the settings button open Group settings: General renames the group and leaves it, and Members
adds and removes people as the reader may. Visibility is shown but cannot change, since the host
offers no such operation. A direct conversation's settings show only its fixed members.

Create group and New message are compact modals. New message opens an existing conversation with
exactly the people chosen, or `/direct?to=…`, which drafts the first message; sending it creates
the direct group and replaces the draft with it. The directory's Discover tab lists public groups
the reader has not joined; the host lets only members read a group's threads, so there is no
preview before joining, and Join opens the group.

## Inbox

The Inbox lists what came to the reader, All or Unread, newest first under day seams: who
mentioned them, replied, or started a thread, where, what was said, and how long ago, with a dot
while unread. Opening one marks it seen at once and opens its thread in the side panel at the
message that notified the reader, set apart, under "Mention · #general" or the like; on phones
Back returns to the Inbox. Unread keeps that notification in place after it is seen, until another
opens or the panel closes, and shows "You're all caught up" with "View all activity" only once
nothing unread and nothing open remains. Mark all seen stays in the header while anything is
unread. A notification whose thread the reader can no longer read shows as unavailable. Client's
`useInboxView` holds these rules; UI's `InboxPane` draws them from the Lunacy Inbox frames.

## Settings and placeholder pages

Settings follows its Lunacy mocks; see [workspace settings](workspace-settings.md). A page's own
side panel, such as Settings' member details, attaches beside the main content like the thread
panel. Home, Triage, Tasks, Environments, and Connections are placeholders drawn with UI's
EmptyState.
The mocks' Agents destination, search, the Tasks and Files tabs, reactions, and task references
have no backend and are not shown.

## Account and appearance

The rail's avatar opens the account menu: the reader's name in this workspace and the address they
sign in with, Appearance (System, Light, or Dark), Switch workspace, Workspace settings,
Change your name (a compact modal), and Sign out. There is no profile photo or Google-account
integration.

The application owns an appearance source for storage and system appearance. Client stores
light/dark/system state without UI dependencies, and the app applies the resolved mode through
the UI `Theme`. System is
the default. Preference persists under `amends.appearance` in local storage, survives sign-out,
and synchronizes same-origin windows. Web and desktop origins remain independent. Blocked storage
retains the choice in memory.

When workspace changes stop arriving for two seconds, a note at the bottom of the screen says
"Connecting…" or "Reconnecting…" until they resume; see [live updates](live-updates.md).

## Verification

UI stories cover the shell, the group screens with the Lunacy sample data, and the Live
conversation stories over dated data: day seams, reply summaries, notes, typing, mentions,
following, the account menu, and loading and failure states. Client tests cover the view hooks'
naming, mentions, notes, and states. App tests cover nested browser and hash routes, current
destinations, shell lifetime across pages and workspaces, directory refresh recovery, the group
stream and thread panel, the inbox's thread, creating, browsing, and joining groups, members,
renaming, a first direct message, live status, and appearance after sign-out. Browser review
covered both modes at desktop, tablet, and phone widths against a local host. Native desktop and
other platform validation remain separate checks.
