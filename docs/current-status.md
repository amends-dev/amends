# Current implementation and known limitations

This page records implementation gaps, not completed fixes. Keep each item aligned
with its owning code and guide when changing the behavior.

The backend implements [workspace](workspace-workflows.md), [group](group-workflows.md), and
[thread](thread-workflows.md) workflows through core and the gateway, over PostgreSQL and the
in-memory reference storage. The guides describe what exists; this page lists what does not.

## Domain gaps

- Public groups, and joining or discovering them, are not implemented. Direct groups exist, with
  fixed membership.
- Only member workflows exist. Task and channel workflows, which will start threads with contacts
  and triage and admit human followers, are not implemented, and neither are managing other
  participants or muting.
- Notifications that ask agents for work stay pending: no turns, execution, silent completion,
  or channel delivery run, and contacts and triage have no inbox outside the store. Turn and task
  activity kinds remain design intent. Only people author messages through the application, so
  the agent-authored messages that notify agents as informational come from no workflow yet.
- Core can define [background processes](../packages/core/README.md#background-work), and the
  local host runs them on an Effect Cluster runner, but no process is registered yet. Several host
  processes over one database share the work; one that stops answering keeps its workspaces for
  the takeover time, 35 seconds by default. Cluster's socket transport, which delivers wakes
  between processes at once, is not authenticated and belongs on a private network.
- A removed member cannot be reactivated. Rejoining takes a fresh invitation and a new member ID,
  which starts with no group memberships, direct groups, thread participation, read positions, or
  notifications; the earlier membership keeps its own. Reactivating a removed membership, keeping
  its ID and all of these, is not designed.

## HTTP coverage

HTTP exposes sign-in, workspace creation and the directory, members, invitations, assignments, ownership,
the notification inbox, its sources and acknowledgment, groups, threads, replies, following, read
state, the change feed, and typing. The management reads of groups the caller does not belong to,
`GroupApplication.getForManagement` and `GroupMembershipApplication.listCurrentForManagement`, are
available through core and the gateway only.

## Conversations in the apps

Web and desktop list the reader's groups in the sidebar, show a group's stream of threads by
their opening messages, and open a thread's messages in the inspector, all live over the change
feed. The page composer starts a thread and the thread composer replies, keeping drafts per group
and thread within the session, and both mention group members picked after `@`. A name typed
without picking it addresses no one. An open thread is read through the newest activity it
shows, and a visible group's stream catches the reader up with the group, clearing the stream's
unread dots, the sidebar's new-activity dot, and the pending counts of what was read, but only
while the page is visible. A thread counts as read when it opens, however far back the reader has
scrolled. Someone writing a reply shows as typing in the thread panel and on the thread's row in
the stream until their signal runs out or their message arrives; starting a thread sends no
typing, since there is no thread yet. The thread panel follows and unfollows its thread, and a
team group's page header follows the group so that threads started there afterwards include the
reader; following agents on someone's behalf has no control. Timelines show messages but not
people joining or leaving, and authors are named by their identity, with no profile name or photo.

A reader who may create groups (owners and administrators, by `group.create`) gets a "New group"
action on the sidebar's Groups heading: a dialog names a private team group and picks its people
and agents as chips, with the reader always included, then opens the new group. Viewers are not
offered it; the apps read what the reader may do from `GET /workspaces/:id/permissions`, which
lists workspace-wide permissions only. There is no page for managing a group's members, renaming
it, leaving it, or starting a direct message.

The Inbox destination lists the reader's notifications newest first, live, with the sidebar
counting what is pending: why each came (a mention, a reply in a followed thread, or a new thread
in a followed group), what was said, and a link that opens the thread beside the inbox, where
reading it settles its notifications. A notification can be marked seen without opening it, and
the list narrows to what is unread. Only one notification is marked at a time; there is no "mark
all seen", and opening a thread from the inbox shows it from its newest messages rather than at the
message that notified the reader. The inbox reads each listed notification's source as resolving
one does, so a page of 25 makes up to 25 source reads. Triage, which routes tasks, stays a
placeholder until tasks exist.

## Storage cost

Group creation, starts, replies, and timeline pages read members, admissions, participations, and
messages in batches, so their store reads do not grow with group size or page length, and a reply
reads only those it addresses. A start still publishes one participation fact per starting
participant, so its storage work grows with its participants, by a few statements each.

Member lists and the member-management listing resolve the reader's grants once for every
member, and the listing loads role choices once. The listing still reads each listed member's
assignments, one read per member; a batched assignment read across members would remove that.

## Design-system coverage

The new [UI workshop](../apps/ui/README.md) contains four surface/text color
roles for Cotton and Soot, scoped theme styles, and specimens for their supported pairings
and nested scopes. Six neutral filled-action color roles add default, hover, pressed,
and disabled specimens on both surfaces; enabled label contrast has automated checks.
Control-border colors and translucent hover/pressed backgrounds have scoped specimens and
contrast checks after compositing. The tinted specimens pair primary text with the strong border.
Semantic status roles now include success, warning, pending, danger, idle, and running, with
separate text and indicator colors; the colored roles also have soft tints. Warning and
pending share amber but remain distinct meanings. Validation colors alias danger values.
All tokens are tested for sRGB gamut, with WCAG 2.2 AA contrast targets for supported text
and indicator pairings, including composited backgrounds. Status specimens include visible
labels and shapes. Decorative `line.seam` dividers are separated from control borders in
Shell, Navigation, and Drawer. These checks do not establish whole-app WCAG conformance.
The focus foundation adds a themed 2px outline with 2px offset, applied through a reusable
`:focus-visible` class. Storybook provides native controls for real keyboard review and
browser checks of ring colors and clearance. The Button primitive provides primary filled,
secondary outlined, and ghost actions in one regular size, native disabled/form behavior, and portable
interaction stories. Controlled pending blocks repeated activation while preserving focus and layout,
with a running stitch and reduced-motion treatment. Danger tone supports all three variants
through a tested `action.danger` palette, with dedicated hover/pressed fills and tinted states.
Disabled appearance and focus remain shared across tones. Additional sizes remain
unimplemented in UI. IconButton provides named square actions using Button's variants and tones;
Tooltip supplies supplemental hover/focus text as a compact dark monospace label matching
the Primitives v2 reference. Its dedicated surface/foreground pair stays dark/light in both
themes, with top-start placement, viewport wrapping, and forced-colors treatment.
The shared [icons package](../apps/icons/README.md) supplies 23 generated outline icons
from canonical drawings, with Solid components, raw SVGs, and a separate metadata catalog.
Select, Drawer, Shell, and workshop glyphs consume it. Compiler, reactivity, naming,
generated-file, and consumer-bundle checks cover this slice. Tonal variants, sprites,
automatic optical-balance reports, and the rest of Regen's drawing language are not implemented.
Body, heading, and mono typography styles include their normal-weight
Latin fonts and browser checks for font loading, sizing, and wrapping. The first Text
primitive composes those foundations with semantic element selection and native attributes.
It also supports success, warning, danger, and pending text tones; announcements and visible
status wording remain caller-owned.
Spacing steps 0–6 are available as quarter-rem values, with browser-measured scale, padding,
and gap specimens at normal and enlarged root text sizes.
Square, medium (10px), and pill radius values have browser-verified corner specimens across sizes and themes.
The Input primitive supports native text/email/password/search/tel/URL entry with read-only,
disabled, and caller-controlled invalid states. `line.invalid` supplies the reviewed invalid
border. The Field composition provides a label, required marker, help, and error text with explicit
reactive association props; form state and validation timing stay with the consuming feature.
`text.invalid` adds a verified error-text role. CodeInput adds six-digit native text entry
with decorative cells and a compact presentation for narrow containers. SignInEmailForm
adds controlled email entry, validation feedback, pending guards, and request errors in
the UI workshop. SignInCodeForm adds code verification/resend presentation, independent
pending states, recovery feedback, and change-email callbacks. The
[connected SignIn feature](../apps/features/README.md) runs against real HTTP and
temporary PostgreSQL data in its own workshop. Web and desktop own the sign-in
pages, composing shared feature parts and UI primitives. Textarea and other specialized input types remain future
pieces. The visible Radio primitive supports native selection and
form semantics; RadioGroup composes it into controlled plain/card choices with native grouping, required/disabled
behavior, and associated help/errors. Extra layouts, previews, and option metadata remain deferred. Checkbox (including mixed),
binary Switch, and styled single-choice Select primitives are available. Select uses Kobalte
for its listbox behavior with a themed popup and native form-value bridge. Searchable
comboboxes, grouped options, multi-select, and higher-level settings compositions remain future work.
Container, Row, Column, Grid, and GridItem provide token-based spacing, centered width limits,
wrapping groups, and equal-width grids that respond to their own container. Full-row items,
nested layouts, RTL, and enlarged-text specimens are available. Numeric column spans,
asymmetric grids, and responsive prop objects remain outside this initial layout slice.
Avatar provides four neutral identity treatments with text fallbacks and explicit accessible
naming or decorative usage. Filled avatar text pairs have separate contrast verification.
Status provides semantic dots, hollow rings, and visible labels; domain mappings and live
announcements belong to callers. Both have theme, narrow/enlarged, RTL, and reactive stories.
Image avatars and identity/data integration remain future work.
Divider provides shared horizontal dashed lines and composable labels/actions, using the
existing seam and typography foundations. Navigation section headers reuse it; collapsed
headers retain accessible names, hide action controls, and recover focus to a link when needed.
Declarative Navigation, Drawer, and Shell compositions add native destination links, a
desktop expanded sidebar, tablet icon rail, phone header toggle, and modal navigation sheets. The sidebar remains mounted
through viewport changes, preserving drafts and selection. Desktop collapse preference is
independent of mobile open state. Native dialog behavior, modal-aware Select/Tooltip portals,
focus return, reduced motion, and independent sidebar/main scroll regions are available.
An optional 400px Shell inspector moves from an inline desktop column to a
right-side laptop/tablet sheet and full-width phone sheet; no product page feeds it yet.
Centered Dialog shares the native modal implementation with Drawer and composes titles,
descriptions, scrolling bodies, and actions. Controlled form recovery is demonstrated.
Toast provides provider-scoped queues, polite feedback, persistent actions, paused timers,
and keyboard access, with dedicated dark-surface color pairings. Modal feedback uses a
viewport inside that modal. Neither component is integrated into product flows or backend
notifications. Workspace-shell integration and theme persistence are implemented. Collapse preference
persistence and component-level Tauri validation remain pending.
Other foundations, additional font weights/subsets, and other production components remain
unimplemented in UI.
Each needed piece is introduced and verified separately, with Storybook coverage at every
layer. Both apps compose headless client state and UI presentation independently.

## Shared client foundation

`ThemeProvider` supplies the shared color and body typography scope. Shell inherits
it and provides page/region scrolling plus named content widths and centering.
Web and desktop compose those parts without local styles. Appearance preferences
are persisted per app origin; System follows operating-system appearance.

[Web](../apps/web/README.md) and [desktop](../apps/desktop/README.md) independently
compose headless session/API state from [client](../apps/client/README.md) and
presentation from [UI](../apps/ui/README.md). Each app owns its route tree and
maps query state to pages, errors, and navigation. Web uses browser routing and
an API proxy; Tauri uses hash routing and connects to the existing local host.
Client and UI have no dependency on each other in source, tests, or manifests.
Stored credentials are scoped by API URL and validated before protected content mounts.
Changing credentials disposes the previous registry and requests. Session rejection,
host failures, missing workspace access, and unknown routes have separate states.

The headless [sign-in controller](../apps/client/src/sign-in/README.md) owns email/code
drafts, shared-schema validation, typed HTTP requests, explicit retry/resend, and
session installation. Each mounted controller owns its requests; changing email,
unmounting, and credential replacement cancel old work and ignore late responses.
The declarative `SignIn.Root`, `EmailForm`, and `CodeForm` parts connect it to UI,
with live HTTP scenarios and app-owned pages in web and desktop.

Workspace picker and creation are implemented in both apps over shared connected
features. [Workspace entry](workspace-entry.md) records composition and recovery.
The picker lists active memberships and total members; creation refreshes the directory
before navigation and retries uncertain submissions with the same key while mounted.
[Workspace settings](workspace-settings.md) now supports rename, role editing, removal,
ownership transfer, invitation creation/revocation, and recipient acceptance from the picker.
Recipient decline, direct/scoped grant editing, richer directory metadata, remembered-workspace
navigation, and work/activity pages remain unimplemented. The app-owned
[workspace shell](workspace-shell.md) now provides persistent navigation, nested
page boundaries, and an account popup with appearance and sign-out controls.
[Live updates](live-updates.md) keep workspace views current over the change feed. Invitations
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
Built-in roles are managed by the product: a later bundle revision replaces their names and
permissions, and custom roles, which a workspace would edit itself, are not implemented.

## Live delivery and authorization

The [change feed](../packages/core/README.md#change-feed) reads the journal, so it carries
commits from every host over the same storage and resumes from a cursor. Its remaining gaps:

- PostgreSQL wakes followers with `LISTEN`/`NOTIFY`. A commit that notifies takes a lock on the
  notification queue that serializes such commits across the whole database, which matters only
  at thousands of commits a second; a batched poll per process is the alternative then. Behind a
  transaction-pooling proxy, `LISTEN` is unavailable and followers re-check every five seconds.
- New notifications reach their recipients over the feed, and a human's `Seen` and read positions
  reach their other sessions as signals. An agent's pending notifications discarded when its
  participation ends show only through the participation-ended activity and the inbox.
- While a newer host records a fact version an older host does not know, as during a deployment
  that changes a fact, each such commit ends every subscription on the older host, which
  reconnects with a reset and refreshes its view.
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
  signal with an expiry, like typing. Typing over HTTP is the only signal clients send.

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
run one at a time, at roughly the rate one commit's statements allow. Execution output appended
outside a commit does not count against that; turn execution itself is not implemented yet. The adapter's tests do not
establish correctness for arbitrary session/database isolation settings.
An explicit isolation choice and coverage for changed defaults remain outstanding.

## Edge resource controls

There is no active browser change consumer after the web reset. When restoring live
updates, provide a stable-connection threshold and retry budget: the former consumer
reset its backoff after every Ready message, allowing repeated Ready/disconnect cycles
to continually refresh queries near the initial delay.

The [local server](../hosts/local/src/server.ts) refuses request bodies over one mebibyte with
413, through Bun's own limit. Each process serves at most a thousand live-update streams per
workspace and twenty per member of it, refusing more with 429 (`Api.TooManyStreams`). Message
text has no length limit of its own beyond the body limit, and no server-side control paces
clients that reconnect repeatedly.

## Payload-format compatibility

[Codec.makeForSchema](../packages/core/src/journal/codec.ts) persists payloads through
`SchemaBinary.toCodec` and copies output buffers. Existing tests cover round trips,
structured headers, and idempotency. They do not freeze representative payloads as
literal expected bytes and decode those fixtures independently of the current encoder.
There is no golden-bytes test for the persisted SchemaBinary format.

Add fixed fixtures before claiming byte compatibility across Effect or schema
changes. Keep dependency and vendored-source versions aligned, and follow the
[journal compatibility guidance](journal.md#reading-and-replay).
