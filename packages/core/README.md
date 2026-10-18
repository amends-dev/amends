# @amends-dev/core

One workspace's domain: its journal, its authorization, and every operation people and agents
perform in it. Members, roles, and invitations; groups and their threads, with messages, tasks, and
channels that bring external conversations in; connections to the integrations a host installs, and
the agents that work on them, taking turns in threads; notifications, read state, and the live
changes readers follow. Every change is a fact published to the workspace's journal, and read models
are projections of those facts.

Core is portable: it depends on Effect and on the [harness](../harness/README.md),
[connection](../connection/README.md), and [channel](../channel/README.md) contracts, and runs
nothing of its own against the outside world. A host supplies storage, cryptography, the
integrations it installs, and what runs jobs; the [gateway](../gateway/README.md) supplies the actor
for each operation. It is internal to this repository and not published to npm.

## Using core

The package root composes one workspace's core:

- `layer` builds the application operations and the services jobs call, over the journal,
  authorization, and the permission catalog.
- `HostServices` is what a host must provide, derived from `layer`: the workspace's stores, the
  checkpoint store, cryptography, the integrations, and the job services. Adding a
  required store changes it, so an incomplete host fails to type-check.
- `Operations` is the set of services a gateway runs for an actor. Programs may require only these,
  so they cannot bypass the membership and permission checks each operation performs.
- `JobServices` is what a host's jobs call as no actor: `TurnExecution`, `ChannelIntake`,
  `DeliveryExecution`, and the `SessionLog.SessionLogs` a turn's job writes. They act as the agent, the
  contact, or delivery itself and check no actor's permissions, so only jobs a host trusts run them.
- `journalLog` names the workspace journal's log; a workspace that was never created has no batch in
  it, which hosts can check without booting the workspace.

Each domain is a subpath export with the records, facts, stores, projections, and operations it
implements: `@amends-dev/core/workspace`, `/authorization`, `/identity`, `/journal`, `/group`,
`/thread`, `/task`, `/channel`, `/connection`, `/agent`, `/turn`, `/notification`, `/read-state`,
`/request`, `/operation`, and `/error`.

## Domains

| Domain          | Owns                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `workspace`     | Workspace metadata and initialization, with members, invitations, ownership, and settings.                                |
| `authorization` | Access evaluation and permissions, with roles and assignments.                                                            |
| `identity`      | Human, agent, and contact references, actors, and performers.                                                             |
| `journal`       | The facts, projections, checkpoints, and reactions every domain publishes through, over the log package's logs.           |
| `group`         | Team and direct groups, admissions, follows, public discovery and joining, and the audience check. See [groups](#groups). |
| `thread`        | Threads, participation, messages, and timeline activity. See [threads](#threads).                                         |
| `task`          | The work a thread tracks: its status, priority, and assignee. See [tasks](#tasks).                                        |
| `channel`       | A connection's external conversations as threads, their contacts, and deliveries back. See [channels](#channels).         |
| `connection`    | Workspaces' connections to installed integrations, with their settings and keys. See [connections](#connections).         |
| `agent`         | Agents: instructions, harness, model, and sandbox over connections, as workspace members. See [agents](#agents).          |
| `turn`          | Agents' turns in threads, their session logs, and stopping and retrying. See [turns](#turns).                             |
| `notification`  | Notifications, the inbox, and marking them seen. See [notifications](#notifications).                                     |
| `read-state`    | Private read positions in threads and groups. See [read state](#read-state).                                              |
| `request`       | Request keys, the IDs of what a request creates, and running a request once. See [request keys](#request-keys).           |
| `replica`       | What a member's replica holds, and who may see each record. See [replica](#replica).                                      |
| `text`          | Rules for text people enter: what storage keeps as given, and what a name may hold. Internal to core.                     |

## How operations run

### Read and write boundaries

Read operations check the current actor's membership and permissions, then query the stores without
opening a journal commit or taking the workspace's writer lock. Reads allow concurrent changes
between permission checks and queries: several queries do not share one snapshot, and a revocation
does not cancel a read already authorized. A read that needs a consistent snapshot must ask for it
rather than changing the default for every read.

Write operations run their authorization checks, validation, publications, and projections inside
one `journal.commit`. A policy check made earlier, such as to build a screen, does not authorize a
later write. Stores still require a valid workspace transaction for every mutation, and a read
inside an existing commit uses that transaction and sees its staged changes.

Core trusts what storage returns: the adapters decode each record and scope it to its workspace, and
the [storage conformance suites](../gateway/README.md#conformance) check that. Operations use stored
records as they come, and a record core itself wrote that is missing is a defect rather than a typed
error. Core validates what crosses into it instead: callers' input, an actor or target from another
workspace, and what a turn's runner or harness reports.

A host binds the journal store to one workspace, and that binding is the only place a service learns
which workspace it serves: services that need the workspace ID read it from `Store.Store`.
Projection stores are bound the same way. Job requests name their workspace, taken from
the fact that asks for them, since the host runs every workspace's jobs.

### Publication

Every `Journal.publish(fact, payload)` reads `Publication.Publication` when it runs: workspace,
performer, immediate cause, correlation ID, and occurrence time. `Publication.withActor` establishes
that context when it is absent and reuses it in nested operations; `Publication.make` supports
explicit context for authenticated identities before membership and for system performers;
`withCause` continues an event's causal chain, and `withPerformer` and `withOccurredAt` scope
overrides.

Every fact declares `subject: (payload) => Subject.make(kind, id)`, a pure function naming the
entity it changes as `kind:id`. A fact may also declare `occurrence: (payload) => [stableId]` to
make publication idempotent: the journal derives a key from the fact name and those parts, scoped to
the workspace and log, and a matching retry returns the original event without running projections
again, while conflicting content fails. Creation and terminal facts use stable record IDs;
repeatable changes need a request or occurrence ID, or return `null`. Facts registered under one
name and version share their payload schema, subject, and occurrence functions.

A fact's entry carries its subject and name, which storage indexes, and its version and
provenance in its bytes beside the encoded payload. Read matching history with
`journal.log.readEntries({ subject?, name?, after?, limit })`, giving a subject, a name, or both,
with a `{ position, index }` cursor, and decode payloads with `Event.decode(fact, entry)`. An
execution-log append outside a commit goes through `Store.append`, a commit of its own that waits
only for the log's other writers.

### Request keys

`@amends-dev/core/request` holds `Request.Key`, which names one request of one member, and
`Request.Current`, the request being run, which a protocol provides around the operation with
`Request.withKey`. Every record an operation creates takes its ID from its record module's `newId`,
such as `Thread.newId` or `GroupMembership.newId(groupId, memberId)`, through `Request.newId`: within
a request, derived from the request, the record's kind, and what tells it apart there; outside one,
new. A creating operation finds its record by that ID before it creates anything, so a retry runs
the operation's checks and returns what its first attempt created, whatever it asks for, and a
browser that wrote the request computes the same IDs with the same functions. A key names one
request: sent with another, it finds what the first created where their records coincide. A record
with an identity of its own derives its ID from that with `Request.derivedId`: a direct group from
its members (`Group.directId`), and a turn's retry from the turn (`Turn.retryId`).

A protocol that may deliver a request more than once and needs no answer from it, such as a
browser's outbox resending what it wrote until the server takes it, runs it with
`RequestService.runOnce(key, operation)`. Unless the request ran before, the operation runs as the
request in one commit, which also publishes `RequestFacts.Completed`; a `CoreError.Rejection` rolls
that commit back and is published as `RequestFacts.Rejected`, with the error, in a commit of its
own. Either fact's occurrence is the member and the key, so asked again, a request that ran does
nothing, whatever has changed since: a rename another member followed with their own is not
rejected as changed. It fails only with `Unavailable` or `Uncertain`, which leave the request to be
asked again. Since it returns nothing, it runs no checks on a retry, unlike a creating operation,
which returns what it finds.

### Errors by kind

`@amends-dev/core/error` holds `CoreError`, the outcomes every feature reports, each one class
whichever operation raises it, carrying in its fields what it is about and in its `message` what
happened. `CoreError.NotFound` names the `resource` and the `id` the caller asked for; a missing
resource and one out of the caller's reach answer alike. `CoreError.Changed` names one that changed
since the caller read it: a name, title, revision, or set of roles they expected is no longer so,
and nothing was recorded. `CoreError.Denied` refuses the actor, and its `reason` says why: a grant
they lack (`NotGranted`), a membership they do not hold (`NotMember`, `InvalidActor`), or an action
only the owner (`OwnerRequired`), the author (`NotAuthor`), the invitation's recipient
(`NotRecipient`), a person (`HumanRequired`), or an agent (`AgentRequired`) takes. A caller recovers
from one reason with `Effect.catchReason("CoreError.Denied", "NotGranted", ...)`, as lists do to
leave out what the actor may not read. `CoreError.Conflict` says the state of what the caller acts
on refuses the request, and its `reason` says how: a member no longer active (`InactiveMember`) or
unable to take part (`ParticipantUnavailable`), an owner the change would reach (`OwnerProtected`),
something done already (`AlreadyMember`, `AlreadyJoined`, `AlreadyEnded`, `AlreadyHandled`,
`AlreadyTask`), a message deleted (`Deleted`), a turn finished or not retryable (`TurnNotActive`,
`NotRetryable`), a read position past the timeline (`BeyondTimeline`), a recipient who cannot own
the workspace (`InvalidRecipient`), or an invitation no longer open (`InvitationClosed`).
`CoreError.Invalid` says the request cannot be done as asked, whatever the state, and its `reason`
says why: values that do not hold (`Malformed`, `PastExpiry`, `DirectMembersRequired`), a role or
integration this workspace does not have (`UnsupportedRole`, `UnknownIntegration`), a roster fixed
by the kind of group (`NotRenamable`, `FixedMembership`, `GeneralMembership`, `NotFollowable`,
`FixedParticipation`), a connection that refuses or cannot be used (`IntegrationRefused`, `Keyless`,
`ConnectionUnusable`), an agent setup that cannot run (`Incomplete`), or a channel request its
transport rejects (`Unverified`). `CoreError.Unavailable` says what an operation needs cannot be
reached or used now: storage another writer held (`Contention`) or read models another host is
rebuilding (`Reloading`), a turn's log or a replica that stopped being followed (`LogInterrupted`),
a channel's system out of reach (`ChannelUnreachable`), or a host that keeps no keys
(`CredentialsUnavailable`). `CoreError.Uncertain` says storage could not confirm whether a
commit took effect, and names it by `commitId`. Operations pass each kind through unchanged, so a
protocol answers it with one status and a client handles it once, and an operation that reaches a
resource through another reports the one the caller named: a message whose thread they cannot read
is the message not found, not the thread. `CoreError.CoreError` is all seven, and
`CoreError.Rejection` the five that reject a request, all but `Unavailable` and `Uncertain`.

An operation's signature lists only these kinds. Each operation passes `Operation.report`, from
`@amends-dev/core/operation`, to the `Effect.fn` that defines it, which reports what core's internals
fail with by kind: storage another writer held, and read models another host is rebuilding, as
`CoreError.Unavailable` (`Contention`, `Reloading`); a commit storage could not confirm as
`CoreError.Uncertain`; and a value that does not decode, which during an operation is one a caller
supplied, as `CoreError.Invalid` (`Malformed`). The rest of `Operation.Internal`, such as storage
that failed otherwise, is a defect that keeps the failure for the host's logs. A failure that is
neither a kind nor internal stays in the operation's type, which its signature then refuses, so a
new outcome fails the build until it is a kind or internal.

## Workspace and access

`@amends-dev/core/workspace` holds the workspace, its members, invitations, ownership, and settings:
`MemberService` (`get`, `list`, `rename`, `remove`), `InvitationService` (`issue`, `accept`,
`revoke`, `list`), `OwnershipService` (`get`, `transfer`), and `WorkspaceSettingsService` (`get`,
`members`, `rename`). `MemberCommand.add` adds a member as accepting an invitation does: the
membership, its role across the workspace, and its admission to the general group, which every
member joins.

`Identity.Reference` identifies a human, agent, or contact, and `Identity.MemberReference` the human
or agent subset that members, actors, and sessions use. External authors use
`Performer.Reference.Identity` with a contact; attribution grants no authority, and a contact
identity does not choose where a reply goes. `Target.Reference` names a workspace, member, group,
thread, or connection. Exact target scopes compare the workspace, kind, and ID, and a workspace
scope covers its targets. Group and thread actions also require current group membership, following
the
[thread access rule](../../docs/core-model.md#agreed-thread-access-combines-audience-and-action-permissions).

### Permissions and built-in roles

Declare a permission beside its owning feature and register it in `index.ts`. Every declaration
chooses its `builtinTier`, `member`, `administrator`, or `owner`; groups supply a name prefix and a
default target kind, but never a tier:

```ts
import { Permission } from "@amends-dev/core/authorization"

const member = Permission.makeGroup("member", { targetKind: "Member" })
const Read = member.make("read", { builtinTier: "member" })
const Remove = member.make("remove", { builtinTier: "administrator" })
```

`PermissionCatalog` validates and freezes the registered definitions, and `BuiltinRoles.make` builds
from them the cumulative Member, Administrator, and Owner roles for one workspace. Initialization
records all three and makes its creator the owner. Tiers only build these bundles: authorization
checks stored permission names and scopes, and services enforce ownership and delegation.

In the current bundles, revision 1, Member takes part in conversations and tasks, creates, joins,
renames, and manages the groups it belongs to, reads members, access, agents, connections, and
channels, directs agents, and uses connections. Administrator adds removing members, invitations,
assigning roles, moderating groups and threads, and creating and configuring agents, connections,
and channels. Owner adds renaming the workspace and transferring ownership. No role reaches a group
from outside it: group operations require membership as well as the grant. Custom roles are not
implemented.

Each workspace records the bundle revision its roles hold, and neither authorization nor replay
rebuilds them. To change the declarations, raise `BuiltinRoles.revision` and add the new bundles to
the test that pins them. `BuiltinRoleUpgrade.upgrade`, which the gateway runs when it boots a
workspace, brings one at an earlier revision to the host's in one commit, attributed to the
`builtin-roles` system, and leaves one at the same or a later revision alone, so an older host never
reverts it. A recorded permission the catalog does not declare grants nothing, and its holder's
other grants stand.

`AssignmentService` lists, assigns, changes, and revokes roles, lists the built-in `roles`, and
gives `permissions`: the workspace-wide permissions the acting member's grants cover, so clients
offer only the actions a member may take. `Delegation` holds the rules assignments, invitations, and
removal share. `OwnershipService` transfers ownership in one commit: it requires the current owner
and `OwnershipPermissions.Transfer`, takes another active human, uses the current Owner assignment
as the expected authority, and makes the former owner an Administrator.

## Groups

`@amends-dev/core/group` holds team and direct groups, their admissions, and follows. `GroupService`
creates teams, private or public, renames them, and reads groups (`get`, `listMine`, `listPublic`);
`GroupMembershipService` adds and removes members, lets members join public groups and leave team
groups, and lists rosters; `GroupFollowService` follows and unfollows. A direct group has a fixed
set of two or more members, identified by `Group.directKey` and found in any order through
`GroupStore.findDirect`; `GroupCommand.establishDirect` finds or creates one for
`ThreadService.startDirect`.

Groups share their internal reads and writes as `GroupQuery` and `GroupCommand`, which are not in
`Operations`. `GroupQuery.requireAudience` checks current workspace and group membership, with no
action permission and no management bypass; each service checks its own grant beside it, inside its
commit for writes. `GroupCommand.admitMember` publishes an admission for team creation, direct
groups, adding, and joining alike, and for the general group a new workspace starts with and every
new member joins. `GroupCommand.removeMembership` records a departure as one fact,
and projections end the member's follow and every thread participation held through the admission
together. Removing a workspace member uses it for every admission.

## Threads

`@amends-dev/core/thread` holds threads, participations, messages, and their timeline activity. Its
operations are `ThreadService` (`startInGroup`, which also starts a thread as a task, `startDirect`,
`rename`, `get`, `listInGroup`, `listOpenings`, `readTimeline`, `listParticipants`),
`ThreadMessageService` (`publish`, `edit`, `delete`), and `ThreadParticipationService`
(`follow`, `unfollow`). A participant is a member, a contact, or triage: a member's participation
references the exact group admission, while contacts and triage take part without group access. A
message author is a member or a contact.

`ThreadQuery` holds the reads operations share and `ThreadCommand` the writes, which run inside the
caller's commit; neither checks actions of its own, and neither is in `Operations`. A command may
read through `ThreadQuery`; a query never writes.

| Method                                                                    | Role                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ThreadQuery.requireAccess`                                               | Checks current group access to a thread, for reads and writes.                                         |
| `ThreadQuery.requireReadable`                                             | The thread under that access and `thread.read`, as every read of its conversation needs.               |
| `ThreadQuery.eligibleMembers`                                             | Of the members asked about, those with a current group admission and an active membership.             |
| `ThreadQuery.currentParticipants`, `pageParticipants`, `findParticipants` | Current participants: all of them, a page, or the given ones.                                          |
| `ThreadQuery.listReadable`                                                | A page of a group's readable threads, from any listing, with tasks, latest activity, and positions.    |
| `ThreadQuery.readTimeline`, `readTimelineItem`                            | Timeline subjects resolved under access, for timeline pages and notification sources.                  |
| `ThreadQuery.previewsOf`                                                  | Stream previews of listed threads, for streams and openings.                                           |
| `ThreadCommand.create`                                                    | The one start every workflow uses: creates the thread, admits its starters, records the first message. |
| `ThreadCommand.publishMessage`                                            | Publishes a message with its admissions, activity, and recipients.                                     |
| `ThreadCommand.publishActivity`                                           | Publishes one activity of any kind: position, admissions, the domain's step, and recording.            |

Starts and replies read only the admissions and participations of those they name, through
`GroupMembershipStore.findActiveMany` and `ThreadParticipationStore.findActive`; a reply without
mentions pages the thread's active participants, the people it notifies.

### Activity kinds

An activity has one shape for every kind, `ThreadActivity.ThreadActivity`: its position, a dotted `kind`
such as `message.published` and the `version` of its details, its `subject`, an `occurrence` key,
`newActivity`, and the kind's `details` as encoded JSON. Storage and facts carry that shape, so a new kind or version changes none of them and needs no migration. Every kind is
recorded with `ThreadActivityFacts.Recorded`, carrying the activity and its selected recipients,
which the activity, thread, group, and notification projections each consume. Domain facts own
state; activity owns timeline position.

The domain that owns a kind defines it next to its facts with
`ThreadActivityKind.make(name, { version, details, subject?, occurrence?, newActivity })`, as
`ThreadMessageActivity`, `ThreadParticipationActivity`, `ThreadTitleActivity`, `TaskActivity`, and
`TurnActivity` do:

- `details` is the kind's schema, encoded to JSON when recorded and decoded when read.
- `version` is the details schema's version. A kind whose details change takes the next, and reading
  an activity at another version is a `Mismatch`, as decoding a fact of another version is.
- `subject` names what the activity is about, derived from its details; without one, its thread.
- `occurrence` gives the parts that make it unique, by default its subject, so each subject has at
  most one activity of the kind; returning `null` makes the kind repeatable.
- `newActivity` says whether it becomes its thread's and group's latest activity for readers:
  messages do, and participation changes are quiet.

`ThreadActivityKind.prepare` derives those fields from the details, and `ThreadActivityKind.decode`
reads an activity back as its kind, rejecting one whose derived fields disagree.

A domain publishes activity through `ThreadCommand.publishActivity`, in its operation's commit. It
takes the thread's next position, failing with `PositionChanged` when an `expectedSequence` is given
and activity took that position first, admits the participants the operation asks for, then runs the
domain's step, which publishes the domain fact and returns the kind, details, and recipients.

A kind appears in timelines through a resolver its domain registers, such as
`ThreadMessageTimeline.resolver` or `TurnTimeline.resolver`. Each loads what its kinds reference in
one batch per page and returns typed items, and adds its item type to `ThreadActivityKind.Item` by
module augmentation. `src/index.ts` registers the resolvers, and `ThreadTimeline.Item` is the closed
schema of every item, for protocols that encode timelines: a new kind adds its resolver to the first
and its item schema to the second. Reading a kind without a resolver is a defect,
`ThreadActivityResolvers.Unknown`.

## Tasks

`@amends-dev/core/task` builds on threads. `Task.Task` is a row keyed by its thread, with a
status, priority, and assignee. `TaskService` (`create`, `update`, `get`, `listInGroup`) is the
operations, and `TaskCommand` the writes that create a task with its thread or in an existing
conversation and change it one way at a time, at the thread's next position, telling and admitting
by the change, and asking an agent's turn to stop when a change takes the agent off the task. A
group's thread lists carry each thread's task.

## Notifications

`@amends-dev/core/notification` holds `Notification.Notification`, the `NotificationStore` contract,
`NotificationService`, and the projection that generates notifications. A notification references a
source log entry and a human, agent, contact, or triage recipient (one triage recipient per
workspace), and is `Pending`; `Discarded` when its agent participation ends or its person leaves the
source's group; `Seen` once a person saw it; `Accepted` once an agent took it into a turn or a
delivery took it to a contact; or `Informational` from the start, when its activity asks an agent
for no work, as another agent's message does. A human or agent recipient names the membership
notified as well as the identity (`Notification.ofMember`), so an inbox belongs to one membership:
someone who rejoins under a new member ID starts with an empty one.

`NotificationService` serves the acting member's own `inbox`, newest first with each source they can
still read as its timeline shows it, its `countPending`, in all and by group, and a person's `markSeen` and
`markSeenThrough`; contact and triage inboxes are read only through the store. A person seeing a
notification is a `NotificationFacts.Seen` fact. `NotificationProjection` generates notifications
from each recorded activity's recipients, settles pending agent input when a participation ends,
and marks a person's notifications seen as they see them or read their thread.
Notifications never create turns, accept their input, or run work.

## Read state

`@amends-dev/core/read-state` holds each person's private read state: `ReadStateService.markThreadRead`
and `markGroupRead` record `ReadStateFacts.ThreadRead` and `GroupRead`, which `ReadStateProjection`
keeps in the `ReadStateStore`; reading a thread also marks the person's notifications from it seen
up to the position, through `NotificationProjection`. Starting a thread and replying record the
author's position in the same commit, so an author has read what they posted. It is what makes
ambient activity visible in the
[attention model](../../docs/core-model.md#agreed-attention-is-directed-followed-or-ambient). The
thread and group projections keep each thread's and group's latest message, and notifications from
thread activity carry their thread and sequence, so reading a thread settles exactly its
notifications.

## Replica

A replica is the copy of a workspace one member's browser keeps, of what that member may see.
`@amends-dev/core/replica` holds `ReplicaRecord`, every kind of record a replica holds, as core
keeps it, with the `Key` each is held under: a turn without where its log begins, which only the
server reads, and a connection or an agent with how ready it is. `placeOf` says where a record
sits, in the workspace, a group, or a thread, so a replica that drops a group or a thread drops
what sits in it: a group's admissions, follows, read time, and threads, and everything a thread
holds. `ReplicaVisibility.canSee` decides,
from a viewer's grants and the groups they belong to, whether they may see a record, as core's
operations authorize reading it: the workspace, its roles, and its contacts are every member's;
members, assignments, invitations, channels, connections, and agents follow their read permission,
and a member always sees their own record and assignments; a group and its members are its
members' under `group.read`, a public team's whoever may join it, and a member's own admission and
follow theirs while they belong to the group; a thread and everything in it are its group's members'
under `thread.read` on it; and read state and notifications are their member's alone.

`ReplicaQuery` is the replica's reads. `keysChangedBy` names the records one commit changed: each
fact's subject names the record it changes, and a few facts change more as their projections apply
them. A thread's activity generates notifications, a member leaving a group ends their
participations there and settles their notifications from it, reading a thread marks what was
pending from it seen, and a change to a connection can change whether the agents that use it can
run. `readRecords` reads the records under keys as a replica holds them, with a connection's
readiness from `ConnectionReadiness` and an agent's from `AgentReadiness`. `viewerOf` reads a
member's access, their grants and the groups they belong to, and `placesOf` the groups and threads
some records belong to, which `canSee` asks for. `snapshot` streams everything a member may see now,
a group and a thread at a time: the workspace's own records, each group they may see with its
threads and what each holds, then their notifications. It leaves out what has ended where a replica
no longer reads it: a revoked assignment, a removed connection or channel, and an ended follow.

`ReplicaService.changes(after)` is a person's replica as the workspace changes, as `ReplicaChange`
batches, one for each commit at its position. It starts after the position their replica holds, or
with `Reset` and a snapshot when it holds none, then sends each commit's changes as it lands. Within
a commit, a changed record reaches them as `Changed` when they may see it as the workspace stands
after it, so nothing reaches them once they lost access; joining a group sends what it holds,
leaving one sends `Dropped` for the group, which takes everything in it along, then what of it they
still see; a change to their grants resets the replica; and their own requests' outcomes arrive as
`Completed` and `Rejected`, a reset's among its changes, since nothing follows it for its commit. The stream fails with `Denied` once they are no longer a member, and with
`Unavailable` (`LogInterrupted`) when following stops short. `ReplicaCommits` reads each commit and
the records it changed once for every member following the workspace: one reader follows the
journal while anyone does, and a stream that starts later reads the commits before it joined from
the journal itself.

## Connections

`@amends-dev/core/connection` holds a workspace's connections, each its link to one integration its
host installs, as [connection](../connection/README.md) declares integrations. `ConnectionService`
lists the host's `integrations`, each as `Connection.IntegrationView` (its auth methods, what it
gives, whether the agent of its harnesses `requiresSandbox`, and its settings form), which every
member may see; lists and reads the connections the actor may read, as `Connection.View`, and the
`models` each offers an agent; and creates, renames, configures, replaces the key of, checks, and
removes them. A view is the record without its key, `manageable`, and its readiness: `Ready`,
`Invalid` when the integration no longer takes its settings or auth method, or `Uninstalled` when
the host no longer installs it.

Creating takes the key with the connection, when it authenticates with one and only then, and the
integration validates its settings and auth method first (`CoreError.Invalid` with
`UnknownIntegration` or `IntegrationRefused`). The key goes to `ConnectionCredentialStore`, one
credential per connection, in the commit that records the connection; replacing it overwrites it,
and removal deletes it and keeps the record, so a retried create finds the connection and answers
`NotFound`. No fact or view carries a key. `check` reads the key and asks the
integration to check the connection with its system, returning `Health`, and holds no commit open
while the system answers.

`connection.create` works on the workspace, and `connection.read`, `connection.manage`, and
`connection.use` on each connection. Members read and use connections; administrators and the owner
create and manage them, and checking is managing, since it sends the key. Using a connection is
giving it to what runs on it, as to an agent. `ConnectionCredentialStore` reports `Unavailable` on a
host that keeps no credentials (`CredentialsUnavailable`). The gateway supplies the host's
integrations as `Integrations`.

## Agents

`@amends-dev/core/agent` holds a workspace's agents. An agent is a workspace member that works:
`Agent.Agent` keeps its instructions; its `harness`, the harnesses of one of the workspace's
connections, or `Auto`, for amends to choose among them; its `model`, one a connection offers, by
id, with an `effort`; and its `sandbox`, the sandboxes of a connection, or none. Its name, role, and
departure are its membership's. `AgentFacts.Created` records an agent in the commit that adds its
membership, and `Configured` replaces its setup as a whole.

`AgentService` lists and reads the agents the actor may read, as `Agent.View`, and creates,
configures, and renames them. Creating adds the agent's membership with `MemberCommand.add`, with a
role the actor must be able to grant; its role changes, and it is removed, as any member's is.
Creating and configuring refuse a connection the actor may not read and use, or that is not active
(`CoreError.Invalid` with `ConnectionUnusable`, naming the part), and a setup that cannot run
(`Incomplete`), except that an agent on `Auto` may wait for a connection that gives a harness. A
view carries the agent's readiness, as `AgentReadiness` finds it against the workspace's connections
and the host's integrations: `Ready`; or `Incomplete` with issues naming a part whose connection was
`Removed`, whose integration is `Uninstalled`, or that does not give the part as the agent takes it
(`Invalid`), `SandboxRequired` when its harness's agent works only in a sandbox and it has none, and
`NoHarness` when, on `Auto`, no connection gives a harness it can run on.

`AgentQuery` is what turns read of the agent they run. `select` gives the `Agent.Selection` a turn
runs on: the agent's model and sandbox, and its harness, which on `Auto` is that of the agent's last
turn in the conversation while it can still run on it, and otherwise the oldest connection whose
harness it can run on. `buildRunnable` gives the agent ready to run on a selection, as data
(`AgentQuery.Runnable`): its instructions, and the connections of the selection's harness, model,
and sandbox, each with its key, beside the model as its integration's endpoint takes it. Whoever
runs the agent builds its harness and sandbox from these with the host's integrations, so core runs
nothing of an agent. Both fail with `CoreError.Invalid` (`Incomplete`) when the agent cannot run.

`agent.create` works on the workspace, and `agent.read` and `agent.configure` on the agent's
membership. Members read agents; administrators and the owner create and configure them.
`agent.use`, declared by `AgentPermissions.Use`, is directing an agent: asking it for work in a
thread, and stopping or retrying its [turns](#turns).

## Turns

`@amends-dev/core/turn` holds agents' turns in threads. A `Turn.Turn` is one harness turn of one
agent in one thread: `queued` until its job starts it, `running`, `cancelling` once asked to stop,
then `completed`, `failed`, or `cancelled`, never reopening. An agent has at most one active turn
per thread, which the stores enforce, and work that arrives while it is active waits for the next. A
turn records the participation it works for, the timeline position through which it accepted work
(`acceptedThroughSequence`), where its entries begin in the participation's session log
(`logAfter`), the turn it retries and who asked (`retry`), the `Agent.Selection` it started on, the
reply it posted, and why it failed or was asked to stop.

Agents handle their notifications as people do theirs. Each agent in each thread has a turn
[job](#jobs), which runs the agent and writes the participation's session log. What the job asks of
the workspace is `TurnExecution`: commands and queries over data, holding nothing in memory, each
change its own commit attributed to the agent.

- `accept` gives the agent's active turn in the thread or, while it has none, accepts its pending
  work notifications there into a new turn, settling them as `Accepted`. Work waits while the agent
  cannot open the thread.
- `start` readies the turn. A turn asked to stop, or whose participation ended, ends as it stands,
  and so does one with nothing to say. Otherwise the turn starts on what [`AgentQuery`](#agents)
  selects, kept if it runs again, and fails with the reason when the agent cannot run on it. `start`
  answers `Idle`, or `Ready` with the turn, the agent's `Runnable`, its prompt and how many messages
  it tells, and what the participation's session resumes from. The prompt (`TurnPrompt.promptOf`) is
  the agent's view of the timeline since it was last prompted there: first the thread as it stands,
  its title and its task's state, then each activity that told the agent, in its kind's words, and,
  for a retry, who asked. What told the agent is its notifications from the thread in that range,
  whatever their state, so the recipient rules decide what an agent is told and the prompt only how
  each kind reads, with the agent itself as "you". A running turn, as a run cut short leaves it, is
  ready again as it was.
- `joinedConversation` is the conversation the agent joined: the thread's messages before it took
  part (`TurnPrompt.conversationOf`), which a new session log starts with.
- `close` posts the reply its job gives, the text of the turn's last step (`SessionLog.answerOf`),
  as the agent's own message to the thread's current participants, naming the turn as the message's
  `via`, saves what the session resumes from, and completes the turn, in one commit. A reply of only
  space posts nothing, one the agent may no longer post fails the turn, and a turn asked to stop
  meanwhile stops instead.
- `fail` and `confirmStopped` end a turn and post nothing.

`SessionStateStore` keeps, per participation, what a session resumes from: the harness's agent that
ran it last and what that agent returned of its own, how far the agent has been prompted, and the
selection its last turn ran on, so its next turn in the thread resumes on the same harness. Every
way a turn ends, including a queued turn stopped by a reader, goes through `TurnCommand.endTurn`,
which publishes the turn's fact and records `turn.ended` in its thread's timeline in the ending
commit.

Each participation has a session log, the record of the agent's conversation in the thread: one of
the workspace's logs, apart from the journal, which `SessionLog.SessionLogs` opens and a run appends
to outside every commit, each batch after the one it wrote last (`expectedAfter`), so a log another
run wrote past refuses it. Its entries are stored as JSON.
Its entries (`SessionLog.Entry`) are `Joined`, the conversation the agent joined, and, each naming
its turn, `Prompted`, `Started` when a run started the turn, on which harness agent and with what
continues the turn when the agent gives that, each `Step`, and `Interrupted` when a run stopped
short. `SessionLog.historyOf` rebuilds the conversation the harness resumes with: what was joined,
then each turn's prompt and its steps since it last started, so that a compaction leaves its summary
in place of what came before. How a turn ended is its record's to say, not the log's.
`SessionLog.reader` reads a turn's entries as the items readers see (`Turn.LogItem`): the prompt,
each step that wrote text, which is the reply once the turn posts it, and interruptions, never
reasoning or tool calls.

`TurnService` lets a reader who may read a thread `get` its turns as `Turn.View`s, with whether the
reader may stop (`stoppable`) or retry (`retryable`) them now, and `listActive` the workspace's
active turns in threads the reader may read. `Turn.view` builds a view from what the reader may
direct and whether the turn can run again. A turn in a thread outside the reader's audience is
`NotFound`, and one in a thread they may not read is `CoreError.Denied` (`NotGranted`). A reader who
may direct its agent may `cancel` an active turn, a queued one at once and a running one once its
job confirms it, and `retry` a failed or stopped turn as a new queued turn for the same agent,
participation, and accepted work, prompted again with who asked. Only the agent's latest turn on the
thread can be retried, while no other is active and the agent still takes part there; otherwise it
is `CoreError.Conflict` (`NotRetryable`) with the reason (`active`, `completed`, `superseded`, or
`departed`). A retry takes its ID from the turn it retries, so repeating it returns the turn it
created.

`TurnService.watchLog` follows a turn's session log for a reader who may read its thread, as a
stream of `Turn.LogMessage`s: `Opened` with the items as they stand, `Changed` with the items each
append adds or changes, and `Ended` once the turn's ending commit has been read and the reply it
names marked. It follows the journal from its head as it stood before the turn and log are read, so
nothing in between is missed. Each append checks that the reader may still read the thread, as does
each commit that changes anyone's group memberships, assignments, or role permissions, or removes a
member; following ends once the commit that took the reader's access is read. A stream that cannot go on fails with `CoreError.Unavailable`
(`LogInterrupted`).

A turn's changes also show in its thread's timeline as `TurnActivity` kinds, recorded in the commits
that make them: `turn.created` where the agent took on the work, or where a retry asked again,
`turn.started`, `turn.stopping`, and `turn.ended` with its outcome, reply, and reason. They inform
no one and are not new activity; the replies are. A client folds a turn's items into one row at its
`turn.created` position.

## Channels

`@amends-dev/core/channel` is a connection's external conversations as threads in one group. `Channel.Channel` names the
connection, the group new conversations open in, and whether they open tasks;
`ChannelBinding.ChannelBinding` is a bound thread's conversation, keyed by the thread, as the connection's
[transport](../channel/README.md) identifies it; `Contact.Contact` is a person heard from through a
channel, named as the system names them; and `Delivery.Delivery` is one message's delivery to a
conversation, `requested`, `sent`, or `failed`.

`ChannelService` (`create`, `list`, `get`, `redirect`, `remove`, `getBinding`) is the operations,
under `channel.create` on the workspace and `channel.read` and `channel.manage` on the channel.
`ChannelIntake` takes in what a channel's system sent, as no member: `receive` gives the request to
the channel's transport and takes in each event it makes, and `intake` takes one event in, each in a
commit of its own as the contact. `DeliveryExecution` is what the delivery job asks of the
workspace: `accept` the contacts' pending notifications into deliveries, `start` one with what to
post and how to reach the system, and `recordSent` or `recordFailed`; the job posts. `ChannelQuery`
is the reads they share.

## Jobs

A job is work a commit asks for that runs outside any request. Core declares which facts request
which job, as journal reactions, in the commit that publishes the
fact: the request is stored with the commit and discarded if it rolls back, a request that cannot be
stored fails the commit, and neither replay nor a retried publication asks again.

- A **turn job** (`TurnJobs`), one for each agent in each thread, runs the agent's work there, one
  [turn](#turns) at a time, through `TurnExecution`, and stops its turn when asked. Activity that
  asks the agent for work, and a turn's end or retry, request a run; a request to stop a turn, and
  the end of the agent's participation or its leaving the thread's group, request a stop.
- A **delivery job** (`DeliveryJobs`), one for each thread bound to a channel's conversation,
  carries what the thread's contacts were told to the conversation, through `DeliveryExecution`.
  Activity that tells a contact something requests it.

`TurnJobs.TurnJobs` and `DeliveryJobs.DeliveryJobs` are host services, shared by every workspace,
which deliver each request to whatever runs the jobs; each one's `layerNoRunner` accepts requests
and runs nothing. A host's jobs reach `JobServices` through the gateway's `inWorkspace`.
[Cluster](../cluster/README.md)'s `TurnJob` and `DeliveryJob` run them, as the local host does.

## Presence

Who has a workspace open now, and where they are typing, is never recorded. `PresenceService.watch`
follows it as the actor sees it: everyone present, and the thread each types in where the actor may
read it, each time it changes; for as long as they follow it, the actor is present on a connection
of their own, which says so every 15 seconds and says it is gone as it closes, and following ends
once their membership has. `PresenceService.type` says the actor types in a thread they may read,
which lapses after six seconds unless said again, or that they stopped. Each process keeps what it
heard, `Presence.State`, from `PresenceRelay`, a host service shared by every workspace that carries
each signal to every process; a connection lapses 45 seconds after it was last heard.
`PresenceRelay.layerMemory` serves a host of one process.

## Memory

Every store contract has a `layerMemory` beside it that implements it in
process memory: the reference implementation of the storage contracts, which enforces with plain
maps what the PostgreSQL adapter enforces with keys and indexes, and which core's tests run over.
Nothing survives the process.

Every store contract builds its store with `make(workspaceId, driver)`, over the driver an adapter
implements: the store checks each input against its schema, and a record against the workspace,
through the log package's `StoreInput`, with `WorkspaceId.rejectForeign`, before the driver sees
it. The checkpoint store, whose inputs name no workspace, takes the driver alone,
as the log package's `Store.make` does. A
driver keeps only what storage keeps, such as reused IDs and conditional writes, which it rejects
with `StoreError` (`Rejected`), and an adapter's module returns the contract's `make` over its
driver from its constructor, as each `layerMemory` does.

- `MemoryDatabase`, in the journal feature, is the storage every connected host shares. Each
  workspace has one `Space`: its logs, as the log package's `MemoryStore.Space`, projected records by
  kind, with the live projection versions and rebuild checkpoints, and what is kept outside the
  journal: connections' credentials and sessions' harness state. Beside
  the workspaces sit the session logs, and tables and locks by name, created on first use, for what
  a host stores across its workspaces, such as its accounts. `MemoryDatabase.makeRows` is how a
  store keeps one kind of record.
- `MemoryDatabase.Connection` is one host's connection: its transactions take turns on a
  one-permit gate, as on one database connection.
- `MemoryBinding.layer(workspaceId)` binds one workspace over the connection: it provides the
  workspace's log store, the log package's `MemoryStore` over the same transactions, its
  `WorkspaceId.CurrentWorkspaceId`, and the `MemoryBinding` that every other store's `layerMemory`
  reads and writes through. The gateway's
  [memory workspace storage](../gateway/README.md#memory) merges them all for each workspace it
  opens.

Records are the JSON of their encoded form, keyed by ID. Stored values never change: writes
replace them, and every read decodes a fresh record; journal entries are copied on the way in and
out. The stores check what the PostgreSQL adapter enforces with keys and unique indexes: reused
IDs, one active membership per identity, one agent per membership, one direct group per member
set, one active follow per admission, one active participation per participant, and contiguous
thread sequences. Lists order IDs by their UTF-8 bytes, as binary collation does.

A transaction copies its workspace's maps, runs against the copy, and on success makes the copy
the committed state; a failure or interruption discards it. A workspace another connection is
writing reports `StoreError` (`Contended`) at once, as a lock wait that timed out immediately would;
the same connection's writers wait for each other. Each log has a lock shared by every host: a
transaction takes it on its first append to the log, or lookup of one of its keys, refreshes its
copy of that log from committed state, and keeps it until it ends; a standalone append takes only
its log's lock, so it never waits for the workspace. Reads outside a transaction see committed
state, and inside one its copy; a handle from another connection, workspace, or closed transaction
fails. Read-state writes outside a transaction apply at once, so a commit keeps the later of its
own and the committed values. Session logs take part in no transaction: an append is kept at once
and wakes waiting readers, as a commit's appends do.

## Conventions

### Features and modules

A feature owns a domain concept, its rules, and its lifecycle, and keeps the models, operations,
facts, projection, permissions, and store contract that evolve together in one directory. Add files
when those responsibilities exist; a small feature needs no empty version of every module.
Membership, in the workspace feature, shows the layout: one module per namespace, named after it
and flat in the feature directory, as the Effect repository lays its modules out.

```text
src/workspace/
  Member.ts             domain schemas, value types, and pure functions
  MemberId.ts           the ID alone, where references would otherwise make a cycle
  MemberService.ts      the operations actors call, authorized, failing with CoreError's kinds
  MemberCommand.ts      the internal writes other operations share
  MemberStore.ts        the persistence contract adapters implement
  MemberFacts.ts        versioned declarations of recorded changes
  MemberProjection.ts   replays the facts into the store, exported as `definition`
  MemberPermissions.ts  the permissions the feature owns
```

The internal reads other operations share go in one `<Feature>Query.ts`. A command may read through
the query; a query never writes; and a step with one caller stays a private function of that caller.
An outcome every feature reports is one kind in `CoreError`, whichever operation raises it: anything
missing, or out of the caller's reach, is `CoreError.NotFound`; anything that changed since the
caller read it is `CoreError.Changed`; a refusal of the actor is `CoreError.Denied`; a request the
state refuses is `CoreError.Conflict`; a request that cannot be done as asked is
`CoreError.Invalid`; what cannot be reached now is `CoreError.Unavailable`, the last four with
their reason; and a commit storage could not confirm is `CoreError.Uncertain`. Each says what it is
about in its fields, and a query or command raises the kind itself, so it passes through every
operation unchanged and a protocol or a browser client carries it without loading an
implementation. Each operation passes `Operation.report` to its `Effect.fn`, so its signature lists
only kinds; see [errors by kind](#errors-by-kind). Every store fails with one `StoreError`, naming the store and the
operation, whose reason says whether storage `Failed`, `Rejected` a write, or was `Contended`; an
operation reports contention as `CoreError.Unavailable` and the rest as defects. Any other
error belongs to the module that raises it, and its tag is its name there, as
`ThreadCommand.PositionChanged`. Helpers no consumer imports go under `internal/`.

Every module is written as the published packages are: a header paragraph and `@since` on every
module, `@category` and `@since` on every export, and a service key that names its module, such as
`@amends-dev/core/thread/ThreadStore`.

### Dependencies and exports

Models and ID modules are independent of services, projections, and storage. Facts depend on models;
projections on facts, store contracts, and projection machinery, and they replay recorded outcomes
without re-evaluating authority or time; services coordinate authorization, stores, and publication.
A workflow may use another feature's models, facts, or stores when it owns their coordination, as
removing a member revokes pending invitations and ends group admissions in the same commit.

Inside core, import the owning leaf module directly, with `import * as`. Each feature's `index.ts`
is a barrel that `bun run barrels` writes, as Effect's codegen writes its own: every module of the
feature as its namespace, with `export * as`, and never what is under `internal/`. Reserve
`Schema.suspend` for schemas that need deferred construction, such as recursive data; ID leaves
break model cycles.

### Schema and type names

Name an exported schema for its domain meaning and role, read with its module qualifier:
`Member.Member`, `Identity.Reference`, `Permission.Definition`. A module's main type takes the
module's name, as Effect's `Entity.Entity` does: the complete record with its identity, such as
`Member.Member` or `Event.Event`, or the value a focused module is about, such as `Grant.Grant`.
Ordinary records use `Schema.Struct` and a same-name interface; unions and scalar schemas use a
same-name type. Typed errors keep tagged error schemas.

| Name                 | Meaning and examples                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Entity>Id`         | The identity of an entity, named for it wherever it is declared: `ThreadId.ThreadId`, in a leaf module that others import without the record, or `Notification.NotificationId` beside its record. |
| `Reference`          | Enough to identify an entity or target: `Identity.Reference`, `Target.Reference`.                                                                                                                 |
| `Definition`         | A declaration: `Permission.Definition`, `Fact.Definition`, `Projection.Definition`.                                                                                                               |
| `<Operation>Input`   | Data supplied to one operation: `Invitation.IssueInput`, `Store.AppendInput`.                                                                                                                     |
| `<Operation>Options` | Parameters controlling an operation: `Store.ReadOptions`.                                                                                                                                         |
| `State`              | A lifecycle variant with data: `Invitation.State`.                                                                                                                                                |
| `Status`             | A simple lifecycle label: `Member.Status`.                                                                                                                                                        |
| `Foo["Service"]`     | The shape of a context service, read off its class, which is named after its module: `MemberStore.MemberStore["Service"]` is what a storage adapter implements.                                   |

Inline payload structs can stay inside their fact declarations; read their types through
`Fact.Payload<typeof MemberFacts.Added>`. Schemas used as public HTTP models carry stable
identifiers, such as `Workspace` and `WorkspaceMember`; status-specific variants are named in the
HTTP contract.

Source names and serialized names are separate contracts. Preserve fact names, versions, brands,
error tags, projection keys, and encoded fields when reorganizing code. A service key is not
serialized: it names its module, such as `@amends-dev/core/thread/ThreadStore`, and moves with it.
During development, change schemas in place at version 1 and reset development data: keep one
current database baseline, with no upgrade migrations, backfills, or legacy decoding.

### Constructors and layers

Core follows the [shared construction conventions](../README.md), which are Effect's: every service
implementation exports `make`, which constructs it, and `layer`, which provides it by delegating to
`make`. A constructor is an `Effect.gen` value, or `Effect.fnUntraced` when it takes arguments, as
Effect's are; it acquires its state and dependencies inside the Effect, so evaluating one twice
builds two implementations, and returns `Service.of(...)`.
Actor identity and the active transaction are resolved during each operation, never at construction.
Contracts implemented elsewhere, such as stores, `Actor.Actor`,
`Publication.Publication`, and `Store.Transaction`, have no `layer` here: a store contract's `make`
checks an adapter's driver, and its `layerMemory` is the reference implementation in process memory.
`Core.ts` composes the layers and implements nothing itself.

```ts
import { Log, Transaction } from "@amends-dev/core/journal"
import { Effect } from "effect"

const makeLogs = Effect.gen(function* () {
  const transaction = yield* Transaction.make
  return yield* Log.make.pipe(Effect.provideService(Transaction.Transaction, transaction))
})
```

This still requires host storage, from which the coordinator takes its workspace. `Log.layer`
supplies the coordinator and exposes both services, so the journal and logs share commit ownership.
Declarations use their own constructors: `Fact.make`, `Permission.make`, `Projection.make` with
`.on(...)` and `Projection.makeRunner`, and `Codec.make` and `Codec.makeForSchema`. Service methods
keep their domain verbs, such as `publish`, `resolve`, `issue`, and `accept`.

## Development

```sh
bun run test packages/core
```

Core's tests follow its domain and feature directories under `test/`, over its
[memory storage](#memory) (`test/memory.ts`); tests across authorization features live in `test/authorization/`.
What storage adapters must promise belongs in the
[storage conformance suites](../gateway/README.md#conformance), and core's operations are tested
as a host runs them in the [gateway's tests](../gateway/README.md#development).
Construction tests exercise transaction ownership, rollback, dependency capture, and lifetimes
rather than object shape.
