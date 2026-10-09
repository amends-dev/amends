# Current implementation and known limitations

This page records implementation gaps, not completed fixes. Keep each item aligned
with its owning code and guide when changing the behavior.

The backend implements [workspace](workspace-workflows.md), [group](group-workflows.md), and
[thread](thread-workflows.md) workflows through core and the gateway, over PostgreSQL and the
in-memory reference storage. The guides describe what exists; this page lists what does not.

## Domain gaps

- A group's visibility is chosen at creation and cannot change afterwards. Public groups show
  their threads only to members, with no read-only preview before joining. Direct groups exist,
  with fixed membership.
- Only member workflows exist. Task and channel workflows, which will start threads with contacts
  and triage and admit human followers, are not implemented, and neither are managing other
  participants or muting.
- Agents accept the work asked of them into [turns](../packages/core/README.md#turns), which the
  local host runs as [cluster](../packages/cluster/README.md)'s turn jobs on
  [harness](../packages/harness/README.md). Core starts each turn as one
  harness turn on what [agents](../packages/core/README.md#agents) select, prompted with the
  thread's messages since the agent's last turn there, and posts the reply its job gives, the text
  of the turn's last step; a turn that fails or is stopped posts nothing. The job records the
  conversation in each participation's session log, from which the agent's next turn there
  resumes; resuming reads the whole log each turn and goes on from its latest compaction. A turn
  whose run stopped short continues where its agent kept it, as opencode does behind its bridge,
  and runs again from its prompt otherwise, and a session's sandbox is left
  running between turns, never stopped or destroyed. A reader with a turn's log open follows it as
  a stream of its items and the step being written; the text being written is best effort, and a
  reader who starts following midway, or misses a draft while reconnecting, sees a step's text
  from its next text part, or once the step finishes. The [turn screens](turns.md) follow, stop,
  and retry turns in threads and show each turn's log; threads have no titles, so the log names a
  thread by its group.
  A turn's changes show in its thread's timeline, but inform no one: the design's informational turn
  activity for participants is not built. The active turns read covers at most a hundred active
  turns in the workspace. Channel delivery does not run, and contacts and triage have no inbox
  outside the store. Task activity kinds remain design intent.
- The [harness](../packages/harness/README.md) runs amends's own agent
  ([harness-amends](../adapters/harness-amends)) and
  [opencode](../adapters/harness-opencode/README.md), which works in a sandbox behind its bridge;
  the local host runs turns on both. Amends's agent compacts by itself only for a model whose
  context window the catalog knows, not one of an OpenAI-compatible connection. opencode's session
  API takes no instructions for a turn, so opencode refuses a turn that gives some: only an agent
  without instructions runs on it, and it compacts only by itself. An agent's own tools run without
  asking: the [agent contract](../packages/harness/src/Agent.ts) has no permission mode saying
  which of them an agent may use and which it asks about, amends's agent runs its `read`, `write`,
  `edit`, and `bash` tools in the sandbox unasked, and opencode runs with its default permissions,
  its permission requests neither streamed nor answered. A session's `approve` answers only the
  requests for the host's tools. A running turn takes no further input: a message sent during a
  turn starts the next, where Claude Code, Codex, and opencode take input while they work, and
  AI SDK's harness passes it on to them.
- The [sandbox contract](../packages/sandbox) has two providers: directories on this machine
  ([sandbox-local](../adapters/sandbox-local)), for development, and
  [Daytona](../adapters/sandbox-daytona/README.md). No provider for E2B, Vercel, or Cloudflare
  exists; Cloudflare's SDK runs only inside a Worker, so
  reaching it from a host needs its Bridge Worker.
- [Connections](../packages/core/README.md#connections) are set up over HTTP and on the
  [Connections page](connections.md), from the integrations the
  [local host](../hosts/local/README.md) installs of every kind. They authenticate with an API key
  or nothing, and there is no OAuth. Agents name them, and turns run on them. A check's result
  is not stored. Keys are sealed with one host key, which nothing
  rotates: a changed `AMENDS_CREDENTIAL_KEY` cannot open earlier keys.
- [Agents](../packages/core/README.md#agents) are created, configured, renamed, and removed
  over connections, in core, [over HTTP](../packages/api-http/README.md#agents), and on the
  [Agents page](agents.md); roles are changed in workspace Members. A turn starts on what the
  agent's setup selects, kept for the agent's later turns in the thread: on `Auto`, the harness its
  previous turn there ran on while a connection still gives it, and otherwise the oldest connection
  that gives one it can run on. Agents have no toolkits, skills, memory, or schedules, and no
  profile photos. A removed agent's membership cannot be reactivated, as a person's cannot.
- Core requests [jobs](../packages/core/README.md#jobs) from the facts its commits publish: a turn
  job for each agent in each thread. The local host runs them, and prunes handled job requests on an Effect Cluster runner. Several host processes over one
  database share that work; one that stops answering keeps its workspaces for the takeover time,
  35 seconds by default. Cluster's socket transport, which delivers job requests between processes
  at once, is not authenticated and belongs on a private network.
- A removed member cannot be reactivated. Rejoining takes a fresh invitation and a new member ID,
  which starts with no group memberships, direct groups, thread participation, read positions, or
  notifications; the earlier membership keeps its own. Reactivating a removed membership, keeping
  its ID and all of these, is not designed.
- Members cannot leave a workspace: only someone who may remove members can remove them.
- An invitation whose inviter has since been removed stays pending but cannot be accepted, since
  acceptance checks the inviter's authority, which a removed member no longer has.
- The directory keeps listing a removed membership, so the apps can explain it, with the
  workspace's current name, owner, and member count: someone removed still sees later renames and
  the headcount.
- Names need not be unique: two members, groups, or workspaces can share a name. Hidden
  characters that make one name read as another are refused.
- Catching up with a group records the host's time when the mark arrives, not the newest activity
  the reader saw, so activity that lands in between counts as read.

## HTTP coverage

HTTP exposes sign-in, workspace creation and the directory, members, invitations, assignments, ownership,
the notification inbox, its sources and marking them seen, groups, threads, replies, following, read
state, the change feed, and typing. No operation reaches a group from outside it, so there is no
workspace-wide oversight of private groups or direct groups by design.

## Conversations in the apps

Web and desktop run the workspace on the UI Shell: they list the reader's groups in the
sidebar, show a group's stream of threads by their opening messages, and open a thread's messages
in the side panel, all live over the change feed. A message under the pointer, or holding focus, is
lit and floats its actions at its top right: Reply in thread on a thread's opening message, and
View turn log on an agent's reply, with reactions and more to follow. Nothing is noted under a
message for these. On touch screens a tap on the message shows its actions, and a message with no
replies also offers "Reply in thread" under it. Elsewhere, a thread with no replies notes under its message only who is typing or which
agent is at work, such as "Yumi working", which opens the thread. The page composer starts a thread and the thread composer replies, keeping drafts per group
and thread within the session, and both mention group members picked after `@`. A name typed
without picking it addresses no one. A member's name, avatar, or mention opens their profile card
on hover, focus, or a tap, offering Message, Open agent for an agent, or Change name on the
reader's own; cards show no photo, status, role, or local time, which the workspace does not hold. A member's messages within five minutes of each other stack
under one avatar and name, as in Slack, unless a thread's replies summary comes between. Messages render as markdown, with mentions naming members
as they are called now, in the timeline, the inbox's one-line previews, and a turn log's reply and
streaming draft. The composer formats the draft as it is written, from its toolbar, Slack's
shortcuts, or markdown typed or pasted as text (` ``` ` then Shift+Enter opens a code block),
and sends it as markdown; a mention is chosen after
`@` and deletes whole. It edits paragraphs, emphasis, strikethrough, code and code blocks, lists,
quotes, headings, rules, and links: tables and task lists render in messages but pasted markdown
loses them. Typing "/" as the whole draft lists commands that act rather than post: a group's page
offers `/follow` or `/unfollow` and, to those who may rename it, `/rename`, which opens its
settings with the name selected; a thread's composer offers `/follow` or `/unfollow` for the thread,
confirmed by a toast as the bell's changes are. There are no other commands yet. Its formatting toolbar starts hidden on phones.
Links open in a new browser tab on the web; the desktop shell has no handler that opens them in
the system browser. Code blocks have no syntax highlighting. Messages written before mention
links, which held a plain `@name`, no longer highlight their mentions. An open thread is read through the newest activity it
shows, and a visible group's stream catches the reader up with the group, clearing the stream's
unread dots, the sidebar's new-activity dot, and the pending counts of what was read, but only
while the page is visible. A thread counts as read when it opens, however far back the reader has
scrolled. Someone writing a reply shows as typing in the thread panel and on the thread's row in
the stream until their signal runs out or their message arrives; starting a thread sends no
typing, since there is no thread yet. In a team group, the thread panel's bell follows and
unfollows its thread, and the header bell follows the group so that threads started there
afterwards include the reader, filled while following and confirmed by a toast; direct
conversations have neither, since everyone takes part in all of them. Following agents on someone's
behalf has no control. The thread panel notes someone following the thread or stopping, between its
messages; joining by writing or being mentioned shows only in the message. Leaving or being removed
from a group shows in its members, not in its threads or stream, though threads keep the notes
recorded before departures stopped writing to them.

Every workspace starts with a general group that every member joins with the workspace and leaves
only by leaving the workspace; workspaces created before it existed have none. Agents created on the
Agents page join it as every member does. The sidebar lists teammates the reader has
not messaged under Direct messages, capped at six, and opens a first message to them. There is no
conversation with oneself, since a direct group needs another member.

People are shown by the name they chose in the workspace, or by the identity they sign in as
until they choose one. The apps ask for a name when creating a workspace or accepting an
invitation, suggesting one from an email address, and the account menu changes it later. Each
member names only themselves: nobody renames another member, and agents are named by whoever adds
or configures them on the Agents page. There are no profile photos.

Everyone gets "Create group" on the sidebar's Groups heading and the Groups page (every role holds
`group.create`): a modal names a team group, picks its people and agents
as chips, with the reader always included, and makes it private or public, then opens the new
group with a "Group created" note. The Groups heading links to the Groups page: Your groups, and
Discover, the public groups the reader may join, with their member counts; joining one opens it.
Private groups show no member count there, since the groups list does not carry one.
New public groups appear on it live, while renames and member counts of groups the reader is not
in update when it next loads. The apps read what the reader may do from
`GET /workspaces/:id/permissions`, which lists workspace-wide permissions only.

A group's header shows its member stack, which opens Group settings on Members: the reader first as
"You", then everyone by name. Any member of a team group adds people and agents with the member
picker (`manageable` on each item of their groups list); in a private group any member also
removes others, while in a public one only administrators and the owner do
(`membersRemovable`). Anyone may leave a team group from its General tab, which returns them to
the workspace's Inbox. Removing and leaving act on the first click, as the mocks show, where the
previous UI asked for a second confirming click. Direct groups list their members without changes. Nobody manages a group they are
not in: administrators moderate a public group by joining it. Leaving settles the reader's pending
notifications from the group: they leave the Inbox count and its Unread filter at once and stay in
All as history, noting the thread is no longer visible. A stream or thread open when the reader loses
access, from any session, turns into an unavailable state rather than showing what it last read,
and comes back if access returns.

A team group's settings rename it for its members (every role holds `group.rename`), starting from
the current name. The new name shows in the header, sidebar, and composer, and reaches other
members over the change feed. A rename made elsewhere while settings are open refuses the save
and says so; saving again replaces it knowingly. Visibility shows there but cannot change.

Direct groups have their own Direct messages section in the sidebar, whose "+" offers everyone a
New message modal. Choosing people opens the conversation the reader already has with exactly them, or a
draft page at `/direct?to=…` whose first message starts it, creating their direct group; the group
then replaces the draft in history. A draft keeps its text per set of people within the session.
A direct group's member stack lists its members without changes, since its membership is fixed;
including someone else means a new conversation.

The Inbox destination lists the reader's notifications newest first under day seams, live, with
the sidebar counting everything still pending for them: why each came (a mention, a reply in a
followed thread, or a new thread in a followed group), from where, what was said, and how long
ago. Opening one marks it seen at once and opens its thread beside the inbox at the message that
notified the reader, reading back as far as it takes and setting that message apart; the panel
says why it came, such as "Mention · #general". Reading the thread settles its notifications too.
Unread keeps the open notification in place after it is seen, until another opens or its thread
closes, and shows "You're all caught up" only once nothing unread and nothing open remains.
"Mark all seen" marks everything through the newest one listed so that later arrivals stay
unread. There is no way to mark one seen without opening it. The inbox reads each listed
notification's source under current access, so a page of 25 makes up to 25 source reads. Triage, which routes tasks, stays a
placeholder until tasks exist.

Settings follows the Lunacy mocks, with Workspace and Members as sections in its sidebar, each
its own page, and invitations as modals from Members. A member's access lists each assignment by its role or permission and whether it covers
the workspace or one item; which item is not shown. Search is Jump to, over what the app already
reads: pages, groups, conversations, people, agents, and connections, by name.
Searching messages has no backend. A group shows its Threads tab alone; the mocks' Tasks and Files
tabs, reactions, and task references have no backend and are not shown.

## Storage cost

Group creation, starts, replies, and timeline pages read members, admissions, participations, and
messages in batches, so their store reads do not grow with group size or page length, and a reply
reads only those it addresses. A start still publishes one participation fact per starting
participant, so its storage work grows with its participants, by a few statements each.

A direct group is keyed by its member IDs. On PostgreSQL, one of more than about 70 members
exceeds the index's 2,704-byte entry limit, and starting it fails.

Member lists and the member-management listing resolve the reader's grants once for every
member, and the listing loads role choices once. The listing still reads each listed member's
assignments, one read per member; a batched assignment read across members would remove that.

## Design-system coverage

The [UI package](../apps/ui/README.md) is built from the Lunacy mocks in
`design-system/Amends Group Exploration.free`: light and dark color roles taken from the mocks,
Figtree in eight type roles with Geist Mono for code and exact values (the mocks draw Inter), a 4px spacing grid, shadows for modals, popovers, and toasts, and the
[icons package](../apps/icons/README.md)'s 61 generated drawings, including the mocks' marks.
Its components, the six layout patterns, and the screens cover every page the apps show; each has
Storybook stories in both modes, run as portable tests in Happy DOM. The dark error colors are
proposals, since the mocks have no dark error state. Contrast, gamut, font loading, and layout
have no automated checks: stories are compared with their Lunacy frames in a browser at phone,
touch, and desktop widths. Right-to-left layouts and forced colors are not reviewed. The
navigation pattern (a sidebar per rail destination, items as pages in the main content) has Lunacy
frames only for Agents ("Agents / Light mode / v02 · Navigation"), which the Agents page
follows; Connections and Settings follow it without frames of their own, as the Settings frames still
draw Workspace in two columns. Status marks and the status color tones follow "Status / Light
mode / v01", which draws the Agents screens only; the connection tiles, the Direct messages rows,
the tooltip, and the dark status values follow its rules without frames of their own, and the
older frames still draw "Ready" and "Configured" labels.

## Shared client foundation

UI's `Theme` supplies the chosen mode and palette's variables and body typography, and its Shell and
Centered patterns lay out pages inside and outside a workspace. Web and desktop compose those
parts without local styles. Appearance preferences
are persisted per app origin; System follows operating-system appearance. The account menu offers
the original Neutral palette and experimental Linen, Sage, and Slate palettes, each in both modes.

[Web](../apps/web/README.md) and [desktop](../apps/desktop/README.md) independently
compose headless session/API state from [client](../apps/client/README.md) and
presentation from [UI](../apps/ui/README.md). Each app owns its route tree and
maps query state to pages, errors, and navigation. Web uses browser routing and
an API proxy; Tauri uses hash routing and connects to the existing local host. Its content
security policy allows connections only to `http://127.0.0.1:8787`, so the desktop app cannot
reach a host at any other address until that is configurable.
UI has no dependency on client. Client depends on UI only for the screens' types, as a
development dependency with type-only imports.
Stored credentials are scoped by API URL and validated before protected content mounts.
Changing credentials disposes the previous registry and requests. Session rejection,
host failures, missing workspace access, and unknown routes have separate states.

The headless [sign-in hook](../apps/client/src/sign-in.ts) owns email/code
drafts, shared-schema validation, typed HTTP requests, explicit retry/resend, and
signing in. Each mounted hook owns its requests; changing email,
unmounting, and credential replacement cancel old work and ignore late responses.
Web and desktop wire it to the UI sign-in screens, which map its codes to wording.

Workspace picker and creation are implemented in both apps over client hooks and UI
screens. [Workspace entry](workspace-entry.md) records composition and recovery.
The picker lists active memberships and total members; creation refreshes the directory
before navigation and retries uncertain submissions with the same key while mounted.
[Workspace settings](workspace-settings.md) now supports rename, role editing, removal,
ownership transfer, invitation creation/revocation, and recipient acceptance from the picker.
Recipient decline, direct/scoped grant editing, richer directory metadata, remembered-workspace
navigation, and work/activity pages remain unimplemented. The app-owned
[workspace shell](workspace-shell.md) now provides persistent navigation, nested
page boundaries, and an account popup with appearance and sign-out controls.
The [change feed](change-feed.md) keeps workspace views current. Invitations
from other workspaces appear only when the page wakes or reloads, since no identity-level feed
exists.
Only local sign-out exists; server revocation,
token refresh, native credential storage, and web/desktop login synchronization are
future work. The removed legacy web screens remain available in Git history.
Route focus management, Tauri signing/updates, production artwork,
and cross-platform installer verification are pending.

## Development data

Fact and projection versions remain at 1, and each storage adapter has one development baseline
with no upgrade migrations: recreate development databases after a schema or fact change.
The PostgreSQL adapter applies its migrations itself when a host starts, as Effect Cluster does
with its own tables, so upgrading the adapter is what upgrades a database. Before a public
release, freeze the last baseline as the first released migration and add each later schema
change as a new migration instead of replacing it; check in CI that released migrations are
never edited, test the upgrade from the previous migrations, and remove or rename in two
releases: first add the new shape and stop using the old one, then drop it.
Built-in roles are managed by the product: a later bundle revision replaces their names and
permissions, and custom roles, which a workspace would edit itself, are not implemented.

## Live delivery and authorization

The [change feed](../packages/core/README.md#change-feed) reads the journal, so it carries
commits from every host over the same storage and resumes from a cursor. Its remaining gaps:

- PostgreSQL wakes followers with `LISTEN`/`NOTIFY`, sent just after each commit rather than
  inside it, where the notification queue's lock would serialize every notifying commit on the
  server through its WAL flush. A process that stops between its commit and the notice leaves
  followers to find the commit at their next poll, within five seconds. Behind a
  transaction-pooling proxy, `LISTEN` is unavailable and followers re-check every five seconds.
- One host process is limited by its own CPU before PostgreSQL: on a laptop with durable writes,
  a thread start takes about 18 ms (40 ms at the 99th percentile) and a member list about 1 ms,
  and thread starts across 16 workspaces reach about 110 a second, about 9 ms of host CPU each,
  spent in the Effect runtime, Drizzle's query building, schema decoding, and the driver. Commit
  notices sent after the commit matter once several processes write to one database; one process
  saturates first. PostgreSQL alone, with 32 clients of tiny commits, reached about 36,600 a
  second with the notice after the commit against 22,100 with it inside.
- New notifications reach their recipients over the feed, and a human's `Seen` and read positions
  reach their other sessions as signals. An agent's pending notifications discarded when its
  participation ends show only through the inbox, beside an unfollow's participation-ended
  activity or the group departure.
- While a newer host records a fact version an older host does not know, as during a deployment
  that changes a fact, each such commit ends every subscription on the older host, which
  reconnects with a reset and refreshes its view. A commit whose payload a known version cannot
  decode does the same, and the feed goes on past it.
- An older host that reads a timeline holding an activity kind it has no resolver for, recorded by
  a newer host during a deployment that adds the kind, fails the read with an invalid response
  rather than skipping the item.
- A reader's cursor advances only with commits that carry something they may see. A reader
  who sees little of a busy workspace can fall more than 500 commits behind while
  disconnected and then reset instead of resuming.
- Scopes and grants reload from current state when a commit changes them, and that state
  may already include later changes. Access to a group or thread extends to its history, so
  this can deliver events from just before a grant, or withhold events from just before a
  revocation, but never delivers after the revocation reaches the reader.
- Access is rechecked only when the feed itself carries a change to it. The reader's
  removal from the workspace ends their stream.

[Signals](../packages/core/README.md#signals) carry typing and read-state changes between
commits on the same stream. They are best effort by design, with these consequences:

- A signal published while a PostgreSQL listener reconnects, or to a subscriber more than 256
  signals behind, is lost; a client that reconnects refreshes read state rather than replaying.
  A typing indicator simply expires.
- The two-second typing throttle is per process, so a member's typing through several hosts can
  send one signal per host in that window.
- PostgreSQL relays each signal as one `NOTIFY`, sharing the notification queue lock with
  commits and limited to 8000 bytes per payload. Behind a transaction-pooling proxy, signals are
  unavailable.
- Presence, such as who is online or viewing a thread, is not implemented; it would be another
  signal with an expiry, like typing, and a stream's start would need who is online, since signals
  are not replayed. Typing over HTTP is the only signal clients send. The UI's status marks
  already have online and offline shapes, but only agents carry a status today: people's avatars,
  rows under Direct messages, and profile cards show none until presence exists.

## Projection sets across hosts

Live projections record no progress: a commit applies every live projection and fails unless
those are exactly the projections its host registers ([live
projections](journal.md#live-projections)). Hosts that write one workspace must therefore run
the same projections. During a deployment that adds or replaces one, hosts with the older set
fail their writes until they are replaced, and a host that boots with the older set retires the
newer projections, which newer hosts must rebuild from the last commit each one applied. A host
whose commit fails because another host changed the live set prepares the workspace again for
its next request, replaying it; the request that failed returns a conflict to retry. While hosts
with different sets keep writing one workspace, each such write retires the other set's
projections again, which then rebuild the commits they missed.

## Commit outcomes and PostgreSQL contention

The [PostgreSQL transaction binding](../adapters/storage-postgresql/src/binding.ts) returns
`Store.CommitUncertain` for every failed COMMIT effect, even when a particular
database error could establish that nothing committed. This over-reports uncertainty.
The gateway exposes `Gateway.Uncertain` with the commit ID; there is no public
HTTP commit-reconciliation endpoint. Core and adapters do not retry transaction programs.
Creating operations accept a request key, so their retries return the first result; other
operations settle a repeat by their own rules, such as `AlreadyRemoved`, rather than repeating it.

PostgreSQL's [error mapping](../adapters/storage-postgresql/src/errors.ts) treats lock
timeouts, serialization failures, and deadlocks as contention, a retryable conflict; during
COMMIT they fall under the broad uncertain-outcome mapping above.

A process's writers to one workspace wait for each other in memory, so they hold at most one
pooled connection while PostgreSQL makes them wait, and every wait is bounded. Its reads for one
workspace outside a transaction use at most three connections at once, so one busy workspace
cannot occupy all of a process's connections; those waits are not bounded in time, and reads
outside a transaction have no statement timeout.

## PostgreSQL isolation

The [binding](../adapters/storage-postgresql/src/binding.ts) uses plain `BEGIN`,
then takes a transaction-scoped advisory lock for the workspace, and one for each log a
commit touches; a standalone append takes only its log's. It does not pin the isolation
level. The locks serialize cooperating writers, but the connection's isolation default still
determines snapshot behavior.

Every journal commit still takes the workspace's lock, so one workspace's conversation writes
run one at a time, at roughly the rate one commit's statements allow. A turn's steps go to its
session log, which takes no lock and no part in commits, so they never wait for those writes. The adapter's tests do not
establish correctness for arbitrary session/database isolation settings.
An explicit isolation choice and coverage for changed defaults remain outstanding.

## Edge resource controls

The [local server](../hosts/local/src/server.ts) refuses request bodies over one mebibyte with
413, through Bun's own limit. Each process serves at most a thousand live-update streams per
workspace and twenty per member of it, refusing more with 429 (`Api.TooManyStreams`). Message
text has no length limit of its own beyond the body limit, and no server-side control paces
clients that reconnect repeatedly.

## Payload-format compatibility

[Codec.makeForSchema](../packages/core/src/journal/codec.ts) persists payloads through
`SchemaBinary.toCodec` and copies output buffers. The [codec tests](../packages/core/test/journal/codec.test.ts)
freeze representative workspace and message bytes captured with Effect 4.0.0-rc.115, and a turn
step's bytes captured with 4.0.0, checking both decoding and identical encoding on 4.0.0. They cover dates,
Unicode, tagged unions, nullable fields, arrays, and optional provider metadata, but not
every fact or log variant. Existing storage tests also cover round trips, structured
headers, and idempotency.

Extend the fixed fixtures before claiming byte compatibility for other payloads across
Effect or schema changes. Keep dependency and vendored-source versions aligned, and follow the
[journal compatibility guidance](journal.md#reading-and-replay).
