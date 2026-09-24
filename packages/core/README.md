# Core

`@amends/core` implements one workspace's journal, authorization, and application
operations. Hosts supply storage and cryptography; the gateway supplies the actor
for each protected operation. The root `layer`
composes the workspace services.

## Features and ownership

A feature owns a coherent domain concept, its rules, and its lifecycle. Keep the
models, operations, facts, projection, permissions, and storage contract that
evolve together in one feature directory. Add files when those responsibilities
exist; a small feature does not need an empty version of every module.

The current domains contain these features:

| Domain          | Ownership                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `workspace`     | Workspace metadata and initialization, with `member/`, `invitation/`, and `ownership/` features.                 |
| `authorization` | Access evaluation and permission concepts, with `role/` and `assignment/` features.                              |
| `identity`      | Human, agent, and contact references, with human/agent actors and membership.                                    |
| `journal`       | Shared log, transaction, fact, codec, and projection machinery.                                                  |
| `notification`  | Notification records, inbox/source reads, acknowledgment, activity-driven generation, and departure settlement.  |
| `thread`        | Private-group starts, human replies, authorized reads, participation, timeline activity, and projection storage. |
| `agent`         | Permission to direct input to an agent workspace member.                                                         |
| `group`         | Private team creation, authorized reads, audience policy, membership lifecycle, and storage.                     |
| `change-feed`   | Live workspace changes for consumers that refresh their current view.                                            |
| `signal`        | Ephemeral signals, such as typing and read-state changes, for connected readers; never stored.                   |

Permission, grant, requirement, scope, and target remain focused modules within
authorization. Future features such as thread and task belong beside these
domains; workspace scoping alone does not make a feature part of workspace
management.

The notification foundation is exported as `@amends/core/notification`. A record
references a source log entry and a Human, Agent, Contact, or Triage recipient and
supports `Pending`, departure-related `Discarded`, and human `Acknowledged` states. Triage is one recipient per workspace,
represented by `{ _tag: "Triage" }` without a person ID. Both storage adapters implement its bounded recipient reads
and transactional insert. `NotificationApplication.get`, `list`, and `listPending`
require current active membership and derive the recipient from the acting identity.
They expose only that recipient's inbox; missing and other recipients' IDs both
return `NotificationApplication.NotFound`. Authorization and reads query current
state without opening a transaction, honoring an outer commit when present. Reading never acknowledges a
notification or grants access to its source. Core now requires `NotificationStore`.

The HTTP API exposes those inbox reads, and the web client provides session-scoped query
atoms. Contact and Triage recipients are available to internal storage consumers; the
member inbox API remains limited to the acting human or agent. The projection now generates
notifications from the common activity-recorded fact for every activity kind. Quiet participation
activity selects no recipients. The same activity handler settles pending agent input when it
sees `ParticipationEnded`, then generates notifications for the recorded recipients. Group and
workspace departures record that activity through the internal lifecycle service. Participation
domain facts change participation state only; notification generation and departure settlement
subscribe to recorded activity. The projection preserves historical recipient selection and
references the originating participation. A human's `Seen` is private state beside it.
Agent/contact/triage processing and delivery remain deferred.

`NotificationApplication.resolveSource(notificationId)` first establishes notification ownership,
then resolves the referenced recorded activity through the internal `NotificationSource` service.
It validates historical recipient and participation links and returns a `Thread.TimelineItem`
under current group access and `thread.read`. Missing, unsupported, or inaccessible sources return
`SourceUnavailable`; inconsistent references fail internally. Unfollowing and discarded state do
not themselves prevent historical reads. Resolution opens no transaction and does not acknowledge,
join, or revive work. It is available through the gateway, with HTTP/UI integration still pending.
See [source resolution](../../docs/thread-workflows.md#resolving-a-notification-source).

`NotificationApplication.acknowledge(notificationId)` records `Seen` for the acting human's own
notification, under active membership with no action grant or source-access requirement. It returns
the record with `Acknowledged { outcome: { _tag: "Seen" }, acknowledgedAt }`, removes it from pending
results and counts, and preserves history. Repeats, and concurrent calls from other devices, return
the first time stored. Agents receive `HumanRecipientRequired`; discarded notifications return
`AlreadyHandled`.

`Seen` is private state written by `NotificationStore.markSeen` outside the journal, like a read
position: no journal commit, no place in the workspace's write order, and kept when projections are
rebuilt. The journal settles notifications only as `Pending` or `Discarded`. The write joins an
enclosing transaction when there is one. Acknowledgment creates no activity, notifications, or
journal commit; the acting human's connected sessions hear of it as a `NotificationsSeen`
[signal](#signals). Handoffs of work, a turn accepting input or a channel delivery
accepting a reply, will be journal facts their owning workflows record; notifications never create
turns, accept their input, or execute work. HTTP/UI actions remain pending.
See [human acknowledgment](../../docs/thread-workflows.md#acknowledging-a-notification).

Membership demonstrates the feature layout:

```text
src/workspace/member/
  id.ts
  member.ts
  application.ts
  store.ts
  facts.ts
  projection.ts
  permissions.ts
```

| Module           | Responsibility                                                                       |
| ---------------- | ------------------------------------------------------------------------------------ |
| `<feature>.ts`   | Domain schemas, value types, and pure domain functions.                              |
| `id.ts`          | An ID-only dependency when references between models would otherwise create a cycle. |
| `application.ts` | Authorized operations and transactional workflow coordination.                       |
| `store.ts`       | The persistence contract implemented by adapters.                                    |
| `facts.ts`       | Versioned declarations of recorded domain changes.                                   |
| `projection.ts`  | Replay those facts into the store; export the projection as `definition`.            |
| `permissions.ts` | Permissions owned by this feature.                                                   |

Workspace initialization lives in `workspace/initialization.ts`. Its facts and
projection have the same separate modules as other features. Invitation facts
are `InvitationFacts`; their projection is `InvitationProjection.definition`.

Use short filenames within feature directories and descriptive module namespaces:
`member/store.ts` exports `MemberStore`, and `member/application.ts` exports
`MemberApplication`. Keep the named domain model file instead of collecting
unrelated types in a general `schema.ts` or `types.ts` file.

Core tests follow the domain and feature directories under `test/`. Tests that
cover several authorization features live at `test/authorization/`; shared
in-memory storage support remains in `test/memory-store.ts`.

## Read and write boundaries

Read operations check the current actor's membership and permissions, then query
the stores without opening a journal commit or acquiring the workspace writer
lock. This includes membership, invitation, role, assignment, ownership, and
notification reads, and opening the change feed. Authorization, grant resolution,
and delegation helpers can all run without `Store.Transaction`.

Reads intentionally allow concurrent changes between permission checks and data
queries. Multiple queries do not promise one shared snapshot, and a revocation
does not cancel an already-authorized read. A read that needs a consistent snapshot
must request that guarantee explicitly rather than changing the default for all reads.

Write operations run their authorization checks, validation, journal publications,
and projections inside one `journal.commit`. Policy checks performed earlier to
build a read screen do not authorize a later write. Stores still require a valid
workspace transaction for every mutation. A read invoked inside an existing commit
uses that transaction and sees its staged changes without opening another one.

## Private team groups

`@amends/core/group` exposes `GroupApplication.createPrivateTeam({ name, memberIds })`.
It requires `group.create` on the workspace, validates the name and distinct active workspace
membership IDs, and records the group and its initial admissions in one commit. Any role or
direct grant can provide that permission. The default Administrator and Owner bundles include
it; their names play no part in authorization.

Initial members are explicit and may be empty. The creator is admitted only if included.
`GroupStore` and `GroupMembershipStore` are required host bindings; each admission retains its
own ID and workspace-membership reference. `Group.Record` is a team or direct group: a direct
group has a fixed set of two or more members in `Group.directMembers` order, including its
creator, and `Group.directKey` identifies that set. `GroupStore.findDirect` resolves a member set
in any order. `GroupMembershipApplication` adds, removes, and lets members leave team groups
only; a direct group returns `GroupMembershipApplication.FixedMembership`. The internal
`DirectGroups.establish` finds or creates a direct group with one admission per member for
`ThreadApplication.startDirect`. Public groups and HTTP/UI workflows remain separate work. See
[group creation](../../docs/group-workflows.md) for the current contract and verification.

`GroupMembershipApplication.add({ groupId, memberId })` requires
`GroupMembershipPermissions.Manage` (`group.membership.manage`) on that Group target.
It validates the group and the member's current workspace membership, rejects an active
duplicate, and publishes a fresh admission using the existing fact and projection. All
checks and writes share one commit. The caller need not belong to the group when their
grants authorize management. Creation permission and group membership confer no management
authority by themselves. Both operations check current permissions, including staged changes
in a caller's transaction. See [adding a member](../../docs/group-workflows.md#adding-a-member).

`GroupMembershipApplication.remove({ groupId, membershipId })` uses the same management
permission. `leave` takes that same address but requires only active workspace membership
and the caller's own admission. Both record a terminal departure and preserve admission
history; rejoining through `add` creates a new ID, safe from stale departure requests.
`MemberApplication.remove` also records departures for all of the member's active group
admissions in its existing commit, with no extra group-management grant. The departure fact
records its reason and uses journal provenance for actor and time. See
[departures](../../docs/group-workflows.md#removing-a-member-or-leaving).

`GroupApplication.listMine({ limit, after? })` returns a page of `Group.ListItem` values with each
group's latest activity, the caller's caught-up time, `newActivity`, `following`, and `pending`,
the caller's pending notifications from the group's threads, from a fixed number of reads. `ThreadApplication.listInGroup(groupId, { limit, before? })` pages a group's
readable threads by latest activity as `Thread.ListItem` values with the caller's read position and
`unread`. `Authorization.permitted` checks many requirements with one grant resolution and reports
each, so lists skip items instead of failing. Starting and replying read the thread through the
author's message, and a message never notifies its author. Rosters page by admission ID with
`listCurrent(groupId, { limit, after? })`.

`GroupApplication.get` and `listMine`, and `GroupMembershipApplication.listCurrent`, require
current group membership and `group.read`. The permission is included in new Viewer and
higher-tier bundles; existing stored roles are unchanged. `getForManagement` and
`listCurrentForManagement` are explicit metadata/roster reads for a known group under
`group.membership.manage`. They require no membership or read grant, and establish no
conversation access. Current rosters expose admission records, not member profiles or
historical admissions. Reads open no transaction, honor staged changes in a caller's commit,
and do not promise a shared snapshot. See [group reads](../../docs/group-workflows.md#reading-groups-and-their-current-members).

`GroupFollowApplication.follow({ groupId, memberId })` and `unfollow` let a team-group member follow
the group for themselves under `GroupPermissions.Follow` (`group.follow`), or make an agent member
follow under `agent.use` for it. A follow admits the member to threads started in the group
afterwards; it belongs to their admission and ends when the admission does, which the
`GroupFollowProjection` records from the admission's removal. `GroupFollowStore` is a required
host binding. Direct groups return `NotFollowable`. See
[following a group](../../docs/group-workflows.md#following-a-group).

`@amends/core/attention` holds private read state. `ReadStateApplication.markThreadRead` records
how far a person has read a thread and marks their pending notifications from it up to that
position `Seen`; `markGroupRead` records when they caught up with a group. Both only move forward.
`ReadStateStore` is a required host binding, kept outside the journal. The person's connected
sessions hear of each change as a `ThreadRead` or `GroupCaughtUp` [signal](#signals). Thread activity maintains
each thread's and group's latest message through `ThreadStore.recordLatest` and
`GroupStore.recordLatest`, and notifications from thread activity carry their thread and sequence.
See [marking conversations read](../../docs/thread-workflows.md#marking-conversations-read).

`GroupAudience.require` checks active workspace and group membership without checking any
action permission or allowing a management bypass. It returns the current admission and
requires only the actor at operation time. Core provides this policy internally to application
services; it is excluded from `Core.Operations`. Future thread writes must call it inside
their commit and separately require the relevant action grant.

## Identity and target boundaries

`Identity.Reference` identifies a Human, Agent, or Contact. `Identity.MemberReference`
is the Human/Agent subset used by members, actors, credential resolution, and the
gateway. External authors use `Performer.Reference.Identity` with a Contact;
`Performer.Reference.Member` always carries a member identity. Attribution does
not grant authority, and a contact identity does not select an external reply destination.

`Target.Reference` supports Workspace, Member, Group, and Thread. Group targets carry
`workspaceId` and `Group.Id`; thread targets carry
`workspaceId` and `ThreadId.Id`, exported from `@amends/core/thread`. Exact target
scopes compare the workspace, kind, and ID; a workspace scope covers targets in
that workspace. Adding a Thread target supplies scoped grant storage. The
[planned audience policy](../../docs/core-model.md#agreed-thread-access-combines-audience-and-action-permissions)
also requires group access alongside action permissions; every thread belongs to one group.
Group creation, reads, admission/departure, and the shared group-audience policy are implemented.
Group-thread reads enforce audience membership and `thread.read`; subscription enforcement
remains future work.
The thread module supplies opening-message and human-reply workflows described below.

## Starting a thread in a private group

`ThreadApplication.startInGroup({ groupId, text, mentions })` requires a human actor, current group
membership, `thread.start` on the group, and `agent.use` on each mentioned agent member. A
team-group thread starts with its author, mentioned members, and the group's followers; the rest of
the group can read it without participating. A direct-group thread enrolls all its members. The
thread, admissions, verbatim user text, sequence-1 `MessagePublished` activity, and notifications
commit together.

`ThreadStart` is the internal start every workflow uses, excluded from `Core.Operations`: it
creates the thread through `ThreadCreation`, admits the starting participants, and records the
first message activity in the caller's commit, without repeating an action permission check.
`startDirect` starts a direct group's thread, and `startInGroup` enrolls every member of a direct
group. Four store contracts persist threads, participations, messages, and timeline
activity. `ThreadParticipation.Participant` is a member, a contact, or triage: member
participation references the exact group admission, while contacts and triage take part without
group access. `ThreadMessage.Author` is a member or a contact, and activity recipients record a
`Notification.Recipient`. Member workflows admit members; replies without mentions reach every
current participant, and contact and triage participants arrive with the task and channel workflows. Group departure ends member
participation and discards pending agent input. Replay uses recorded recipients and stable
notification IDs.

These operations reuse the existing workspace journal; the timeline is a read model of ordered
activity, not an independent second event stream. Authorized reads now provide discovery,
metadata, timeline pages, and current-participant summaries. HTTP/UI and agent-turn
execution workflows remain separate work. See [thread workflows](../../docs/thread-workflows.md).

Thread reads use `ThreadApplication.get`, `listInGroup`, `readTimeline`, and `listParticipants`.
All require current workspace/group membership and `thread.read` on the Thread target; lists
omit threads outside the caller's grants. Participation is not required or created by reading.
Timeline pages use `ThreadActivityStore.ReadOptions` (positive `limit`, optional nonnegative
`afterSequence`) and return typed timeline items in sequence order: message items contain
`activity` and `message`, while participation items contain `activity` and a public `participant` joining summary. Current participants use
`ThreadParticipation.Summary`, whose `participant` is a public member, contact, or triage reference
without internal identity snapshots or admission links, excluding ended participation.
Reads honor caller transactions but open none, and make no notification or checkpoint changes.
Internal `ThreadActivityReading` shares authorized subject resolution between timeline pages and
notification-source reads. It and `NotificationSource` are excluded from `Core.Operations`.
New Viewer bundles include the permission; stored role records are unchanged. See
[thread reads](../../docs/thread-workflows.md#reading-conversations).

## Publishing a human reply

`ThreadMessageApplication.publish({ threadId, text, mentions })` publishes a human reply under
current group access and `ThreadMessagePermissions.Publish` (`thread.publish`) on the Thread target.
The author and eligible mentions join when necessary; unmentioned replies address current thread
participants plus the author. Each mentioned agent requires `agent.use`; agents already
participating are reached without it. The result contains only
`message` and `activity`. New Viewer and higher-tier bundles include publish permission, while
existing roles keep their stored grants. See [human replies](../../docs/thread-workflows.md#replying-to-a-conversation).

Starts and replies reuse `ThreadParticipationAdmission` and `ThreadMessagePublication` internally.
These services validate references and record domain facts within the caller's transaction and
publication context. They perform no independent action authorization and are excluded from
`Core.Operations`. `ThreadAccess` shares audience validation between reads and replies; each
application checks its own action. Starting includes its initial publication under `thread.start`
without requiring `thread.publish`; replies require neither `thread.read` nor `thread.start`.

## Following and unfollowing

`ThreadParticipationApplication.follow(threadId)` requires current group access and
`ThreadParticipationPermissions.Follow` (`thread.follow`) on the Thread target. It uses the
internal admission service and records a quiet `ParticipationFollowed` activity at the joining
sequence, without messages or notifications. It returns `ThreadParticipation.Summary`; repeated
follow returns the existing participation without changing its boundary. New Viewer bundles
include the permission, while existing stored roles retain their grants.

`unfollow({ threadId, participationId })` requires current group access and the actor’s own
participation, with no action grant. It uses internal `ThreadParticipationDeparture` to record `ThreadParticipationFacts.Ended` and
`ParticipationEnded` activity, ending that record and discarding pending agent input atomically. Human notification history is retained.
It returns no value. A fresh participation after rejoining cannot be ended by an old request.
Both workflows honor caller transactions. See [following and unfollowing](../../docs/thread-workflows.md#following-and-unfollowing).

All activity kinds use `ThreadActivityRecording` and `ThreadActivityFacts.Recorded`, carrying a
typed activity and its selected recipients. The notification generator consumes that common
envelope; it needs no kind-specific registration. Domain facts own state and activity owns timeline
position. Quiet follow and departure activity use empty recipient lists.

`GroupMembershipDeparture` records a group departure and invokes the participation departure
service for each active participation; member removal uses that same group service. These internal
services are excluded from `Core.Operations` and require the caller’s transaction and publication
context. Projections replay explicit facts rather than deriving unrecorded bulk departures.

## Permission declarations and built-in roles

Declare a permission beside its owning feature and register it in `core.ts`.
Every declaration must explicitly choose `builtinTier`: `viewer`, `administrator`,
or `owner`. Permission groups supply a name prefix and default target kind, but
never a default tier:

```ts
import { Permission } from "@amends/core/authorization";

const member = Permission.makeGroup("member", { targetKind: "Member" });
const Read = member.make("read", { builtinTier: "viewer" });
const Remove = member.make("remove", { builtinTier: "administrator" });
```

`PermissionCatalog` validates and freezes the registered definitions. Its
`definitions` array supplies `BuiltinRoles.make`, which constructs cumulative
Viewer, Administrator, and Owner records for one workspace. Workspace initialization
records all three roles and one workspace-scoped Owner assignment for its creator.
The reserved role IDs are stable within each workspace; display names are labels.

Tiers only construct these default bundles. Authorization checks stored permission
names and scopes, and application services enforce ownership and delegation rules.
`Permission.Reference` retains only the name and target kind used by requirements,
preserving the HTTP error contract without exposing bundle-construction metadata.

Changing a declaration changes the desired bundles for new workspaces. Updating
an existing workspace requires an explicit role fact; neither authorization nor
replay regenerates its roles. `AssignmentApplication` provides listing, assignment,
revocation, and atomic workspace-role replacement. `Delegation` supplies the shared
rules used by assignments, invitations, and member removal. Role definition editing
and custom roles remain separate work. See [workspace workflows](../../docs/workspace-workflows.md#initialization)
for the implemented bundles and current invitation restrictions.

`OwnershipApplication` coordinates ownership and assignments in one commit. It
requires the current owner and `OwnershipPermissions.Transfer`, validates another
active human recipient, and uses the current Owner assignment ID as the expected
authority for a transfer. The former owner becomes an Administrator. `WorkspaceStore`
applies the recorded change only if the previous owner matches, preserving all other
metadata. The ownership fact is projected alongside the recorded assignment changes;
replay does not reauthorize the former owner.

## Publication and the storage envelope

Every `Journal.publish(fact, payload)` reads `Publication.Service` at invocation:
workspace, performer, immediate cause, correlation ID, and occurrence time.
`Publication.withActor` establishes root context when absent and reuses it in nested
operations. `Publication.make` supports explicit context for authenticated identities
before membership and system performers. `Publication.withCause` continues an event's
causal chain while retaining the current performer; `withPerformer` and `withOccurredAt`
scope overrides to one effect or block. See the
[publication pattern](../../docs/journal.md#event-provenance) for attribution rules,
validation, and examples. Events use `Event.Type<F>` with required provenance throughout storage, replay,
and delivery. `Event.Record` describes the decoded event shape with an unknown payload;
each fact's schema supplies its specific payload type.

Facts can declare `occurrence: (payload) => [stableId]` to make publication
idempotent automatically. The journal namespaces the tuple by fact name and scopes
it to the workspace/log. A declaration can return `null` for repeatable payloads.
Explicit `idempotencyKey` options remain available for facts without a derived key
and for execution-log appends; they cannot override a declared occurrence.
Matching retries return the original event or append slice without rerunning
projections. Conflicting content fails. `getAppend`
on log readers supports transactional lookup by key, and `Fact.makeOccurrenceKey`
derives the lookup key from a payload. See
[idempotent publication](../../docs/journal.md#idempotent-publication-and-append)
for payload matching, expected-position precedence, and composing larger operations.

The storage envelope separates `Event.Header` (subject, name, version, provenance) from
encoded domain payload bytes. `Store.Content` represents append content and
`Store.Entry` adds the log entry metadata. Journal entries use `Event.storageCodec`;
ordinary execution logs use the default payload codec and have no fact header.
Both adapters persist fact subjects, names, and versions as columns, with separate
name and subject indexes. Read matching history with
`journal.read({ subject?, name?, version?, after?, limit })`: supply a subject, a
name, or both; version requires a name. Reads use a
`{ position, index }` cursor and `Event.decode(fact, entry)` for payload decoding.
The existing journal log reader and projection replay retain complete-batch reads.

## Change feed

`@amends/core/change-feed` exports the `ChangeFeed` schemas and
`ChangeFeedApplication.watch(options?)`. The feed reads the workspace journal, so it
carries every commit to the journal from any host or process over the same storage,
including commits whose acknowledgment was lost. Nothing is published from the
commit path.

`ChangeFeedSource` shares one follower of the journal per workspace runtime. It starts
with the runtime's first subscriber, at the journal's head, and stops when the last
subscriber leaves. It decodes each commit once through the registry in
`src/change-feed/events.ts`, then buffers it for every subscriber; waiting for the next
commit uses `Store.waitForAppend`, whatever the storage. A subscriber registers with
the follower before reading the journal, so no commit falls between the two. A
subscriber that falls behind its buffer (256 commits by default) reads the commits it
lost from the journal instead of failing.

`watch` checks active membership, then emits `Ready { workspaceId, cursor, reset }`
followed by `Committed { workspaceId, cursor, commitId, events }` for each later commit
that carries an event the reader may see. A cursor is opaque and resumes after the
commit that carried it. Given `after`, the feed replays the commits after it, up to 500,
with `reset: false`; without one, with a cursor past the head, or with one further
behind, `Ready` has `reset: true` at the head and the consumer must refresh its view.
`Ready`'s cursor is null only for an empty journal.

A reader sees an event when they hold a scope in its fact's
[audience](../../docs/journal.md#fact-audiences) (the workspace, their membership or
identity, or a group they belong to) and any read permission the registry names for it:
`group.read` for group facts and `thread.read` for thread facts, the permissions the
matching reads require. Their group admissions and grants are loaded when the
subscription opens and reloaded before filtering a commit that changes them, so a
commit that admits the reader delivers what it admits. The commit that removes the
reader from the workspace is delivered, then the stream ends. Registry views give
some facts their public shape: activity omits its notification recipients, and
participation omits routing identities and admissions. Facts outside the registry,
such as test facts, are internal; a registered name with an unknown version stops
the follower, and its subscribers see `ChangeFeed.Unavailable`.

Recorded thread activity also carries the notifications its projection creates. Each
recipient's arrives in the same `Committed` message's `notifications`, derived with
`Notification.generated` exactly as the projection stores it, so it equals what the inbox
lists; human and agent recipients receive their own, whether or not they may read the thread,
and nobody else sees them. A commit with no visible events and no notifications for the reader
sends nothing, so a reader's cursor only advances with commits it sees.

The same stream carries `Signal { workspaceId, signal }` messages between commits, for the
[signals](#signals) the reader may see, filtered by the same scopes and grants as events and
reloaded by the same commits. The subscription registers for signals before `Ready`, so it misses
none published after that. Signals have no cursor and are never replayed; a consumer that
reconnects refreshes read state along with the rest of its view. The HTTP contract reuses these
message schemas. Frontend query dependencies belong in the client.

## Signals

`@amends/core/signal` holds what is happening now and is never stored: `Signal.Value` is `Typing`,
`ThreadRead`, `GroupCaughtUp`, or `NotificationsSeen`. `Signal.reachOf` gives each its audience,
as a fact declares one: typing reaches the thread's group with `thread.read` for the thread, and
the three read-state signals reach only the member whose private state changed, so their other
sessions stay current without the journal.

`Signals.Service` is the workspace's delivery, a required host binding: `publish` offers a signal
to the subscribers present at that moment, in every process over the same storage, and
`subscribe` returns those published from then until its scope closes. Delivery is best effort.
Publishing never fails the operation that publishes, and a subscriber that falls behind, or whose
process loses its connection to the others, misses signals rather than delaying anyone.

`SignalApplication.typing(threadId)` tells the thread's readers that the acting member is
composing there until `until`, six seconds later (`SignalApplication.typingFor`). It requires
current group access and `thread.publish`, as posting does, and returns `ThreadNotFound` for
missing and inaccessible threads alike. Repeats from the same member in the same thread within two
seconds are dropped by the process that receives them, so a client may call it on each keystroke;
clients hide their own member's typing. `ReadStateApplication` and
`NotificationApplication.acknowledge` publish the read-state signals after their writes.

## Module dependencies and exports

Models and ID modules are independent of application services, projections, and
storage implementations. Facts depend on models and the fact declaration API.
Projections depend on facts, store contracts, and projection machinery; they
replay recorded outcomes without re-evaluating current authority or time.
Application modules coordinate authorization, stores, and journal publication.

A workflow may reference another feature's models, facts, or store contracts
when it owns their coordination. For example, removing a member revokes pending
invitations and ends active group admissions in the same commit. Keep that workflow in the responsible application
module and preserve its authorization and transaction boundaries.

Inside core, import the owning leaf module directly. Each leaf establishes its
canonical ES module namespace with a self-export, and public barrels relay those
names. Avoid importing an aggregate barrel from an internal module.

```ts
// Inside the member feature:
import { MemberStore } from "./store.ts";

// From another package:
import { Member, MemberApplication } from "@amends/core/workspace";
```

The domain `index.ts` files define the public package surface. A feature folder
does not automatically need its own barrel or package subpath. File moves retain
the existing `@amends/core/workspace` and `@amends/core/authorization` imports.

Workspace and member IDs live in small leaf modules and remain available as
`Workspace.Id` and `Member.Id`. Use these ID leaves to avoid model dependency
cycles. Reserve `Schema.suspend` for schemas that need deferred construction,
such as genuinely recursive data.

## Schema and type names

Name an exported schema for its domain meaning and role. Read names with their
module qualifier: `Member.Record`, `Identity.Reference`, and
`Permission.Definition`. Ordinary records use `Schema.Struct` and a same-name
interface; unions and scalar schemas use a same-name type. Keep `Id` capitalization
consistent across modules. Typed errors retain tagged error schemas.

| Name                 | Meaning and examples                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Record`             | A complete domain record with its identity and recorded fields: `Member.Record`, `Invitation.Record`, `Event.Record`. Adapter-specific database row shapes stay in adapters.    |
| `Value`              | The primary value object in a focused module: `Actor.Value`, `Grant.Value`, `Requirement.Value`, `Scope.Value`. Prefer a more specific noun when it clarifies the value's role. |
| `Reference`          | Enough information to identify an entity or target: `Identity.Reference`, `Target.Reference`.                                                                                   |
| `Definition`         | A declaration: `Permission.Definition`, `Fact.Definition`, `Projection.Definition`.                                                                                             |
| `<Operation>Input`   | Data supplied to a specific operation: `Invitation.IssueInput`, `Store.AppendInput`.                                                                                            |
| `<Operation>Options` | Parameters controlling an operation: `Store.ReadOptions`, `Store.AppendOptions`.                                                                                                |
| `State`              | A lifecycle variant with associated data: `Invitation.State`.                                                                                                                   |
| `Status`             | A simple lifecycle label: `Member.Status`, `Assignment.Status`.                                                                                                                 |
| `Interface`          | The contract implemented by a context service: `MemberApplication.Interface`, `MemberStore.Interface`.                                                                          |

Supporting types name their actual role. `Invitation.Issuance` is the immutable
issuance record retained through acceptance or revocation. `Event.Envelope`
contains a fact's subject, name, version, encoded payload, and provenance; `Fact.Payload<F>` is the
decoded domain payload. `Log.Entry<A>` carries a decoded payload and entry
metadata. `Codec.PayloadCodec<S>` handles a payload schema, while
`Codec.FactCodec<F>` pairs that codec with its fact definition. `Codec.EntryCodec<S>`
maps a log's values to structured `Store.Content`; the journal uses it to persist
the envelope header separately rather than wrapping everything in binary.

`Log.Handle.getEntry(entryId)` and the journal's read-only `log.getEntry` resolve an optional
decoded entry directly within the bound workspace and log. They validate entry identity and
decode through the log's codec, honor an enclosing transaction, and perform no writes.
Application readers remain responsible for authorization.

Inline payload structs can stay inside their fact declarations. Obtain their
types through `Fact.Payload<typeof MemberFacts.Added>` rather than adding a
second exported schema name without a separate use case.

Every fact declares `subject: (payload) => Subject.make(kind, id)`, a pure function
of its validated decoded payload. Use the affected entity: workspace, member,
invitation, role, or assignment. Subjects use `kind:id` with a lowercase namespace
containing letters, digits, and hyphens and a nonempty ID. They identify an entity,
not a unique occurrence or an authorization target. Publication persists the
subject, retries compare it, and replay decoding verifies it against the payload.

Put natural occurrence identity in that same declaration, using a pure function
of the decoded payload. Use stable record IDs for creation and terminal facts;
repeatable changes need a request or occurrence ID, not just the affected record's
ID. `occurrence` returns a nonempty array of nonblank strings or `null`. The journal
validates these parts and derives an unambiguous key without the schema version.
Keep identity rules stable across retries. During local development, reset data
when changing an identity rule. Facts registered under the
same name/version must share their payload schema, subject function, and occurrence function.

Schemas used as public HTTP models carry stable identifiers for generated API
documentation: `Workspace`, `WorkspaceMember`, `WorkspaceInvitation`,
`WorkspaceInvitationIssueInput`, and `WorkspaceInvitationIssuance`. Add identifiers
when a schema needs a named public representation or other tooling consumes it;
module-local helper schemas do not need identifiers by default.

HTTP status-specific schema variants are named in the HTTP contract:
`CreatedWorkspace` and `IssuedWorkspaceInvitation` describe the 201 responses.
Explicit variant names avoid generated numeric suffixes while keeping HTTP
annotations out of core's models.

Source names and serialized names are separate contracts. Preserve fact names,
versions, brands, error tags, service keys, projection keys, and encoded fields
during organizational changes. In particular, `Invitation.Record.details` still
holds `Invitation.Issuance`; changing its TypeScript name does not rename the
persisted or HTTP field. During local development, update schemas in place at version 1 and reset
development data. Keep one current database baseline; do not add upgrade migrations,
backfills, or legacy decoding paths.

## Constructors and layers

Follow Effect's public library pattern: construction and service provision are
separate APIs that share one implementation. The matching upstream examples are
[`PgClient`](../../repos/effect/packages/sql/pg/src/PgClient.ts),
[`MssqlClient`](../../repos/effect/packages/sql/mssql/src/MssqlClient.ts), and
[`KeyValueStore`](../../repos/effect/packages/effect/src/unstable/persistence/KeyValueStore.ts).

| API                                                    | Meaning                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `make(...)`                                            | Construct the module's primary value or service implementation.                  |
| `makeRunner(...)`, `makeGroup(...)`, `makeSchema(...)` | Construct a named supporting value.                                              |
| `makeForSchema(...)`                                   | Construct a codec from a schema instead of a fact definition.                    |
| `Service`                                              | Identify a service in Effect's context.                                          |
| `Service.of(value)`                                    | Type-check an existing implementation; no initialization or provision.           |
| `layer` / `layer(options)`                             | Provide services by delegating to their constructors and composing dependencies. |

Every service implementation in `src` exports `make` and `layer`. A constructor
remains a supported public API even when the layer is its only current consumer.
Pure constructors return values directly. Effectful constructors return lazy
Effects with their acquisition failures and dependencies represented in the type.

Core's service constructors use `Effect.fn("Module.make")`, including those with
no arguments. Their state and dependency acquisition belong inside the Effect:
evaluating the same construction Effect twice creates two implementations.
Return `Service.of(...)` from service constructors. Use `Effect.fn` for named
operations and `Effect.gen` for inline composition; an Effect that reads, writes,
decodes, or authorizes keeps its operation name.

Construction owns initialization and validation. A layer delegates to that
construction path and may supply implementation dependencies. Use
`Layer.provide` to keep those dependencies internal and `Layer.provideMerge` when
consumers also need them. Reuse a layer value within a composition to share its
acquisition. A constructor does not cache its result by itself.

For example, callers can construct logs with an explicit transaction coordinator:

```ts
import { Log, Transaction } from "@amends/core/journal";
import { Effect } from "effect";

const makeLogs = Effect.gen(function* () {
  const transaction = yield* Transaction.make();
  return yield* Log.make().pipe(Effect.provideService(Transaction.Service, transaction));
});
```

This still requires host storage; the coordinator takes its workspace from `Store.Service`.
`Log.layer` supplies the coordinator and exposes both services so the journal and
log operations share the same commit ownership.
`Layer.build` materializes a layer into a scoped context; reserve `build` for that
meaning rather than using it as a synonym for a constructor.

## Service boundaries

| Implementation            | Constructor                             | Layer provides                           |
| ------------------------- | --------------------------------------- | ---------------------------------------- |
| Transaction               | `Transaction.make()`                    | `Transaction.Service`                    |
| Log                       | `Log.make()`                            | `Log.Service` and `Transaction.Service`  |
| Journal                   | `Journal.make(options)`                 | `Journal.Service`                        |
| Change-feed follower      | `ChangeFeedSource.make(options?)`       | `ChangeFeedSource.Service`               |
| Permission catalog        | `PermissionCatalog.make(definitions)`   | `PermissionCatalog.Service`              |
| Grant resolver            | `GrantResolver.make()`                  | `GrantResolver.Service`                  |
| Authorization             | `Authorization.make()`                  | `Authorization.Service`                  |
| Member operations         | `MemberApplication.make()`              | `MemberApplication.Service`              |
| Thread operations         | `ThreadApplication.make()`              | `ThreadApplication.Service`              |
| Thread participation      | `ThreadParticipationApplication.make()` | `ThreadParticipationApplication.Service` |
| Human message publication | `ThreadMessageApplication.make()`       | `ThreadMessageApplication.Service`       |
| Notification reads        | `NotificationApplication.make()`        | `NotificationApplication.Service`        |
| Private team creation     | `GroupApplication.make()`               | `GroupApplication.Service`               |
| Group membership          | `GroupMembershipApplication.make()`     | `GroupMembershipApplication.Service`     |
| Group following           | `GroupFollowApplication.make()`         | `GroupFollowApplication.Service`         |
| Read state                | `ReadStateApplication.make()`           | `ReadStateApplication.Service`           |
| Group audience policy     | `GroupAudience.make()`                  | `GroupAudience.Service`                  |
| Assignment operations     | `AssignmentApplication.make()`          | `AssignmentApplication.Service`          |
| Delegation policy         | `Delegation.make()`                     | `Delegation.Service`                     |
| Invitation operations     | `InvitationApplication.make()`          | `InvitationApplication.Service`          |
| Ownership operations      | `OwnershipApplication.make()`           | `OwnershipApplication.Service`           |
| Change feed               | `ChangeFeedApplication.make()`          | `ChangeFeedApplication.Service`          |
| Typing signals            | `SignalApplication.make()`              | `SignalApplication.Service`              |

The store modules and `Checkpoint` declare contracts implemented by adapters.
`Signals.Service` is a host contract too, bound to one workspace like the stores.
`Actor.Service`, `Publication.Service`, and `Store.Transaction` identify invocation
context supplied by trusted ingress, application operations, and storage. These contracts have no default implementation or
pass-through `make`/`layer` wrappers in core. Private transaction tags coordinate
operations and are not public construction APIs.

Constructors capture stable workspace dependencies. Actor identity and the active
transaction are resolved during each operation. Projection runners capture their
declared dependencies while preserving invocation-time transaction and scope.
If a constructor acquires resources, retain `Scope` in its Effect requirements
and use those resources within that scope; the corresponding layer owns cleanup.

The root `core.ts` is a composition of these layers, with no separate service
implementation to construct. `HostServices` remains derived from its input
requirements and `Operations` from the application services it exposes.

## Other construction APIs

`Fact.make`, `Permission.make`, `Grant.make`, `Requirement.make`, and
`Projection.make` construct declarations or validated values. A projection
definition gains subscriptions through `.on(...)`; `Projection.makeRunner`
constructs its executable runner. `Codec.make` constructs a fact codec and
`Codec.makeForSchema` constructs a payload codec. `Event.makeSchema` and
`Grant.makeSchema` construct schemas. Schema-owned constructors such as
`Member.Id.make` and `Actor.Value.make` retain Effect's own naming.

Service methods retain their domain verbs: `open`, `publish`, `resolve`, `require`,
`issue`, and `accept`. Workspace initialization is an operation that persists
facts, rather than service construction, so it remains `initialize`.

Document public constructors with `@category constructors` and layer exports
with `@category layers`. Add `layerConfig`, `layerFrom`, or other variants only
when the module has the corresponding configuration or acquisition use case.

Run `bun run check` from the repository root after changes, and `bun run test`
after behavior changes. Construction tests should exercise transaction ownership,
rollback, dependency capture, or lifetime guarantees rather than just object shape.
