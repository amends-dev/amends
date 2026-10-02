# Workspace shell

Opening `/workspaces/:workspaceId` shows Home inside the app-owned workspace layout, built on the
[UI](../apps/ui/README.md) Shell pattern from the Lunacy mocks in
`design-system/Amends Group Exploration.free`: a rail, a sidebar, the main content, and a side
panel. Every destination uses them the same way, as the Lunacy "Agents / Light mode / v02 ·
Navigation" frames lay out:

- **Rail** picks a destination: Home, Agents, Environments, and Connections, then Settings and the
  reader's avatar, which opens the account menu. The current destination is marked
  `aria-current="true"`, whichever of its pages shows.
- **Sidebar** lists the destination's items. Its header, the workspace switcher, stays the same
  everywhere; below it, each section's title and Browse open the full list in the main content, and
  its + opens the create modal over the current page. Items open in the main content.
- **Main** shows one pane: a list, or one item with its tabs, which are links. A list's rows open
  the item in the main content, as the sidebar's items do. Pages about one item read in one column
  (UI's `Pane.Column`, 680px at most); nothing sits beside it.
- **Side panel** holds only something inside what the main content shows: a group's thread, an
  agent's turn log, or a member in Settings. An item of a destination never opens there.
- **Modals** create and confirm.

The destinations' sidebars:

- **Home**: Inbox with the count of what is pending for the reader, Triage, Tasks, then Groups and
  Direct messages. Groups' title links to the directory at `/groups`, with Browse groups (the
  Discover tab) and, for readers who may create groups, Create group. The general group comes
  first, then the rest by name; each shows the reader's pending count, or a dot for activity they
  have not seen. With no groups, once they load, the section says "No groups yet". Direct messages
  lists the reader's direct groups by their other people, the most recently active first, then up
  to six teammates, people and agents, they have no one-to-one conversation with yet, by name,
  with New message. A teammate's row opens a first message to them; the conversation starts when
  it is sent. The reader is not listed: a direct group needs at least one other member. A
  one-to-one row with an agent carries the agent's status patch, and the logo while it works;
  people's rows gain theirs with presence, which is not implemented yet.
- **Agents**: each agent by name with its avatar and status patch, and the logo while one of its
  turns is queued or running; + is Add agent (`?add=agent`). See [agents](agents.md).
- **Environments**: each environment, marked at the row's end when it needs setup or is
  unavailable; + is Add environment
  (`?add=environment`). One section: every environment serves the same use, and the sandbox is a
  field of one creation flow. See [environments](environments.md).
- **Connections**: Model providers, then Sandbox accounts, each with its own Browse (the list of
  that kind, `?kind=`) and + (`?add=model-access` or `?add=sandboxes`), which offers only that
  kind's providers. Connections whose provider this host no longer installs follow under
  Unavailable. See [connections](connections.md).
- **Settings**: Workspace and Members, each its own page. See
  [workspace settings](workspace-settings.md).

Home's main content: `/groups/:groupId` shows the group's pane: its name, member stack, follow
bell, settings, and its threads with the composer. `/groups` is the directory: Your groups and
Discover, with Join. `…/groups/:groupId/threads/:threadId` opens a thread in the side panel beside
its group, and `/inbox/groups/:groupId/threads/:threadId` beside the inbox, at the message that
notified the reader. Closing returns to the group or the inbox. The panel sits beside the content
from 80rem, floats over it below that, and fills the screen on phones.

Below 64rem the sidebar moves into a drawer beside the rail, opened from each pane's menu button;
below 48rem rail and sidebar open together. A rail link switches the sidebar and keeps the drawer
open to choose from; a sidebar link, Escape, or the scrim closes it. The shell is keyed by
workspace: switching workspaces builds a new one for its groups and names.
A missing or removed membership shows the [unavailable page](workspace-entry.md) outside the
workspace layout. Sign-in preserves supported nested destinations, including an item's page.

## Groups and threads

Client view hooks shape the conversation reads for the screens: `useWorkspaceGroups`,
`useGroupConversation`, `useThreadConversation`, `useMentionCandidates`, and `useGroupPeople`
name people and groups, resolve mentions, and report loading, unavailable, and failed states;
the screens word them. A group's stream shows each thread's opening message, oldest first under
day seams, with its reply count, an unread dot, and who is typing. A message under the pointer, or
holding focus, is lit and floats its actions at its top right: Reply in thread, and View turn log on
an agent's reply. On touch screens a tap on the message shows them, and a message with no replies
also offers "Reply in thread" under it. Seeing a group
catches the reader up with it, and an open thread is read through its newest message. The
composer starts a thread; in the side panel it replies. Typing `@` suggests the group's other
members.

A member's name or avatar on a message, a mention in one, or a mention in the draft opens their
profile card after a moment's hover, or at once from the keyboard; a click or tap keeps it open
until Escape or a click outside, and Tab from the name reaches its actions. The card, from the
Lunacy "Profile cards / Compact" frames, names them and says whether they are a person or an agent.
Message opens the reader's direct conversation with them, or drafts a first message; an agent's
card adds Open agent, for its page; the reader's own card offers Change name instead; and a former
member's card keeps their name with "No longer in this workspace." and nothing to do. Mentions in
the inbox's one-line previews open the notification, not a card.

A team group's bell follows it, so new threads there include the reader, or stops: it is filled
while the reader follows, and a toast confirms each change once it lands ("Following #design",
"Unfollowed #design"); a change that fails puts the bell back and says so in a toast. In the side
panel the bell follows the thread, filled the same way. Direct conversations have neither bell, in
the header or the side panel, since everyone takes part in every thread. The member stack and
the settings button open Group settings: General renames the group and leaves it, and Members
adds and removes people as the reader may. Visibility is shown but cannot change, since the host
offers no such operation. A direct conversation's settings show only its fixed members.

Create group and New message are compact modals. New message opens an existing conversation with
exactly the people chosen, or `/direct?to=…`, which drafts the first message; sending it creates
the direct group and replaces the draft with it. The directory's Discover tab lists public groups
the reader has not joined; the host lets only members read a group's threads, so there is no
preview before joining, and Join opens the group.

## Inbox

A workspace's own address lands on its Inbox. The Inbox lists what came to the reader, Unread
first and All beside it, newest first under day seams: who
mentioned them, replied, or started a thread, where, what was said, and how long ago, with a dot
while unread. Opening one marks it seen at once and opens its thread in the side panel at the
message that notified the reader, set apart, under "Mention · #general" or the like; on phones
Back returns to the Inbox. Unread keeps that notification in place after it is seen, until another
opens or the panel closes, and shows "You're all caught up" with "View all activity" only once
nothing unread and nothing open remains. Mark all seen stays in the header while anything is
unread. If marking one seen fails, its dot returns; that failure, and one marking all seen, show a
toast. Older notifications, like older threads and messages, load with Show older, which becomes
Try again under a note when a page fails. A notification whose thread the reader can no longer read shows as unavailable. Client's
`useInboxView` holds these rules; UI's `InboxPane` draws them from the Lunacy Inbox frames.

## Settings and placeholder pages

Settings follows its Lunacy mocks; see [workspace settings](workspace-settings.md). A page's own
side panel, such as Settings' member details, attaches beside the main content like the thread
panel. [Agents](agents.md) follows its v02 navigation frames; [Connections](connections.md) and
[Environments](environments.md) follow the same pattern, with their v01 frames for lists, forms,
and modals. The workspace's own address redirects to the Inbox; Triage and Tasks are placeholders
drawn with UI's EmptyState. Empty and error states across the apps show the Amends Logo board's animated states
above their words, such as a new piece sewn in for no workspaces or agents, a thread reaching an
empty outline for no connections, and a loose patch for a load that failed; the rail's mark lifts
on hover, and checking a restored session shows the mark at work. Search jumps to a page, group,
conversation, person, agent, environment, or connection by name, from ⌘K or Ctrl+K, the
sidebar's "Find anything", or the rail's Search; messages cannot be searched yet. A group shows its
Threads tab alone: the mocks' Tasks and Files tabs, reactions, and task references have no backend
and are not shown.

## Account and appearance

The rail's avatar opens the account menu: the reader's name in this workspace and the address they
sign in with, Appearance (System, Light, or Dark), Color palette (Neutral, Linen, Sage, or Slate), Switch workspace, Workspace settings,
Change your name (a compact modal), and Sign out. There is no profile photo or Google-account
integration.

The application owns an appearance source for storage and system appearance. Client stores
light/dark/system state and the palette choice without UI dependencies, and the app applies both through
the UI `Theme`. System and Neutral are the defaults. Linen explores warm paper and terracotta,
Sage soft green and forest, and Slate cool blue and ink; each has light and dark colors.
Mode persists under `amends.appearance` and palette under `amends.palette` in local storage; both survive sign-out
and synchronize same-origin windows. Web and desktop origins remain independent. Blocked storage
retains the choice in memory.

When workspace changes stop arriving for two seconds, a note at the bottom of the screen says
"Connecting…" or "Reconnecting…" until they resume; see [change feed](change-feed.md).

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
