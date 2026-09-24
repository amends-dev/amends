# Thread workflows

Core and both storage adapters implement human opening messages in team and direct groups,
starting direct groups, replies, following/unfollowing, and authorized reads, with source
resolution and human notification acknowledgment. Every start uses one internal thread start.
Call the application services through
`Gateway.asMember` or a trusted workspace context. HTTP/UI, the task and channel workflows that
admit contacts and triage, attachments, and agent execution remain separate implementation steps.

## Starting a conversation

```ts
import { Group } from "@amends/core/group";
import { ThreadApplication } from "@amends/core/thread";
import { Effect } from "effect";

const start = (groupId: Group.Id) =>
  Effect.gen(function* () {
    const threads = yield* ThreadApplication.Service;
    return yield* threads.startInGroup({
      groupId,
      text: "Here's the proposal",
      mentions: [],
    });
  });
```

The result contains `thread`, `message`, and `activity`. Internal participation identity snapshots
are not returned; authorized participant reads provide public summaries instead. The operation accepts
non-whitespace text and preserves it verbatim, including indentation and newlines. `mentions`
is an explicit array of distinct workspace-member IDs. In a team group, an empty array starts
the thread with its author alone; text such as `@Reviewer` does not itself create structured
addressing.

Authorization and validation run in the same journal commit as creation and publication:

- The caller must have active workspace and group membership and `thread.start` on that Group.
- Each mentioned agent requires `agent.use` on that agent's workspace-member target. Agents that are
  not mentioned need no authority, including the agents of a direct group started with
  `startInGroup`. Missing authority rejects the whole operation; recipients are not silently
  dropped.
- Mentioned members must currently belong to this group and have active workspace membership.
  A mention cannot admit an outsider to the group. Missing, foreign, inactive, and outside-group
  mention targets return `ThreadApplication.ParticipantUnavailable`.
- This first publication workflow accepts human authors. An agent caller receives
  `ThreadApplication.HumanAuthorRequired`; assistant publication from a producing turn is future work.

`ThreadPermissions.Start` and `AgentPermissions.Use` declare these permissions. Both have a
Viewer default tier, so newly initialized Viewer, Administrator, and Owner bundles include them.
Stored grants govern authorization; role names confer no authority. Existing role records are
not updated automatically. Starting needs no additional `group.read`, `group.create`, or
membership-management grant. Missing and inaccessible groups share `ThreadApplication.GroupNotFound`.
The gateway preserves these outcomes and maps malformed input to `Gateway.InvalidInput`.

## Starting a direct group

`ThreadApplication.startDirect({ memberIds, text, mentions })` starts a thread in the direct group
of the author and `memberIds`. The same members, in any order and whether or not the author is
listed, always reuse one direct group; a different set of members gets a different group. The
first start establishes the group and one admission per member in the same commit. The caller
needs active workspace membership, a human identity, `agent.use` for each agent member, and
`thread.start` on the direct group; no group-creation or membership-management grant is needed.
Every member participates in the thread, and mentions, which must name members, only narrow
notification. Fewer than two distinct members returns `ThreadApplication.DirectMembersRequired`;
a missing or inactive member, or a mention outside the group, returns
`ThreadApplication.ParticipantUnavailable`. Later threads in the same direct group can also start
with `startInGroup`. Direct-group membership is fixed; see [group workflows](group-workflows.md).

## Initial participation and recipient selection

These rules follow the agreed [attention
model](core-model.md#agreed-attention-is-directed-followed-or-ambient). A team-group post is not a
broadcast: it admits the group's [followers](group-workflows.md#following-a-group), and the rest of
the group can read the thread without participating; [thread lists](#reading-conversations) show it
as unread.

| Opening message                        | Initial participants                                          | Notification recipients                 |
| -------------------------------------- | ------------------------------------------------------------- | --------------------------------------- |
| Team group, no explicit mentions       | The author and the group's followers                          | The followers                           |
| Team group, explicit mentions          | The author, the mentioned eligible members, and the followers | The explicitly mentioned participants   |
| Direct group, with or without mentions | All members of the direct group                               | All participants, or the mentioned ones |

Every start runs through the internal `ThreadStart` service. It creates the thread, admits the
starting participants at sequence 1, and records the first message activity with its recipients
in the caller's commit. A thread's `createdBy` is a member or, for a conversation a channel
receives, a contact. Future task and channel workflows call the same start with their own
authorization and starting participants: a task's creator and triage, or a conversation's contacts
and triage, without enrolling the group.

An author mentioned explicitly appears only once. A message never notifies its own author, even
when it mentions them.
Participation and notification selection are separate recorded decisions. Other group members
remain in the inherited access audience and can read the thread when they hold `thread.read`.
Reading does not enroll them.

A later group addition does not enroll that member in existing threads or create retroactive
notifications. Unmentioned replies address that thread's current participants plus their author,
without enrolling the group. Members can also follow explicitly without posting.

Unmentioned messages reaching agent participants represent input for recipient evaluation. The
agreed design allows an agent to ask a question, perform work, reply, or finish silently after
evaluating relevance.
An explicit mention makes the request direct; it does not require a meaningless visible response.
Ordinary assistant replies remain informational to other agents; explicit work requests can
ask them to act. These handling rules remain design intent: this slice creates durable pending
notifications and launches no turns, models, harnesses, or background recipient processors.

## Replying to a conversation

```ts
import { Thread, ThreadMessageApplication } from "@amends/core/thread";
import { Effect } from "effect";

const reply = (threadId: Thread.Id) =>
  Effect.gen(function* () {
    const messages = yield* ThreadMessageApplication.Service;
    return yield* messages.publish({ threadId, text: "Here's my feedback", mentions: [] });
  });
```

The result contains `message` and `activity`, with no internal participation or recipient
snapshots. Text and structured mentions use the same validation as opening messages.
Every invocation publishes a new message; there is no request-level idempotency receipt.
Reconcile an uncertain commit before submitting the operation again.

The caller must be a human with active workspace membership, current membership in the
thread's group, and `thread.publish` on that Thread target. `ThreadMessagePermissions.Publish`
declares this permission with a Viewer default tier. New Viewer and higher-tier bundles include
it; existing stored roles need an explicit grant or update. Publication does not require
`thread.read`, `thread.start`, `group.read`, or membership-management permission. Audience
membership and authorship alone do not authorize a reply.

The author joins the thread if necessary. Explicit mentions also admit eligible group members
who are not participating. An existing participant keeps their participation ID and joining
boundary; a returning member whose prior participation ended receives a fresh participation tied
to their current group admission. Its `joinedAtSequence` is the introducing message's sequence.
Earlier messages remain history, without retroactive notifications.

| Reply addressing  | Notification recipients                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| No mentions       | Every current participant except the replying author, including contacts and triage. |
| Explicit mentions | Only the mentioned eligible members, admitted in the same commit if needed.          |

Mentions do not remove existing participants. Group members outside the thread are not enrolled by
an unmentioned reply, including members added to the group after the thread started. A reply never
notifies its author. Each mentioned agent requires `agent.use` on its Member target. An unmentioned
reply reaches agents already participating without that authority: whoever brought them into the
thread authorized them to handle it. Missing agent authority rejects the whole publication instead
of silently dropping recipients.

Missing, foreign, and outside-audience thread IDs share `ThreadMessageApplication.NotFound`.
Ineligible mentions return `ThreadMessageApplication.ParticipantUnavailable`; agent callers get
`ThreadMessageApplication.HumanAuthorRequired`. The gateway preserves these errors and converts
malformed input to `Gateway.InvalidInput`. Storage and consistency failures remain failures.

Authorization, admission, message publication, next-sequence activity, and notifications
share one journal commit. An outer transaction is honored, including earlier replies,
grant changes, and group departures. Concurrent writers use the existing workspace transaction
boundary; storage still rejects timeline gaps and duplicate positions. Contention can reject an
attempt and does not trigger an automatic retry. Notification records remain pending input;
publication starts no agent execution.

## Following and unfollowing

`ThreadParticipationApplication.follow(threadId)` joins the acting human or agent and returns
a public `ThreadParticipation.Summary`. It requires active workspace and group membership and
`thread.follow` on that Thread target. `ThreadParticipationPermissions.Follow` has a Viewer
default tier; any covering role or direct grant can supply it. No read, publish, management,
or `agent.use` grant is required. Following oneself does not request work from an agent.

A new follow records an admission and a quiet `ParticipationFollowed` timeline activity at the
next sequence, atomically. Its sequence is the participation's `joinedAtSequence`; earlier
activity is history. The operation publishes no message, generates no notifications, and starts
no work. Following while already participating returns the existing summary without changing
its joining boundary, appending activity, or writing another commit. Every call still checks
current access and the follow grant.

`unfollow({ threadId, participationId })` returns no value and ends only the actor's addressed
participation. It requires current workspace/group membership but no action grant. A member can
unfollow after losing their follow permission. Group membership and permission-governed read
access remain intact. Other members' IDs, another thread's IDs, and missing participations share
`ThreadParticipationApplication.NotFound`; one's own ended participation returns `AlreadyEnded`.
An inaccessible or missing thread returns `ThreadParticipationApplication.ThreadNotFound`.
Malformed input becomes `Gateway.InvalidInput` at the gateway.

Unfollow records `thread.participation.ended` and a `ParticipationEnded` timeline activity,
preserving the record and its original joining boundary. The activity records the departure reason.
Pending agent notifications for that exact participation become discarded in the same commit;
human notification history remains. The departure activity selects no notification recipients.
Reading earlier participation activity still returns its historical public joining summary.

A later follow, own reply, or authorized mention can establish a fresh participation, even under
the same group admission. Unmentioned messages do not re-enroll an unfollowed member. Old work
stays settled, and an old unfollow request cannot end a newer participation. Following and
unfollowing are distinct from muting; mute preferences remain unimplemented.

All checks, facts, and projections share the existing workspace transaction.
Concurrent publication and departure have a consistent order; an enclosing commit sees staged
participation, permission, and membership changes. Failures roll back admission or departure
along with their timeline and notification effects. No automatic retry is performed.

## Reading conversations

Every thread read requires active workspace membership, current membership in its group,
and `thread.read` on that Thread target. `ThreadPermissions.Read` is included in newly initialized
Viewer and higher-tier bundles. Roles and direct grants can supply it at workspace scope or
for an exact thread. Membership, authorship, ownership, group management, `group.read`, and
`thread.start` do not replace the read grant. No additional `group.read`, `member.read`, or
`agent.use` grant is required to read an accessible thread. Humans and agents follow the same policy.

| Operation                                           | Result                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get(threadId)`                                     | The thread's metadata.                                                                                                                                                                                       |
| `listInGroup(groupId, { limit, before? })`          | A page of `Thread.ListItem` values, newest latest activity first: each readable thread with its latest message, the caller's read position, and `unread`. Threads without a covering read grant are skipped. |
| `readTimeline(threadId, { limit, afterSequence? })` | An ascending sequence page of `Thread.TimelineItem` values with each activity's resolved subject.                                                                                                            |
| `listParticipants(threadId, { limit, after? })`     | A page of current `ThreadParticipation.Summary` values in participation-ID order, after the exclusive `after` participation ID.                                                                              |

`listInGroup` checks `thread.read` for each page of threads with one grant resolution and keeps
reading until the page is full or the group has no older threads. Its exclusive `before` cursor
is the last item's latest activity time and thread ID. A thread is `unread` when its latest
message is past the caller's read position or, never read, came after the caller joined the group.
The caller's own messages are read: posting advances the author's position to their message.

A nonparticipant can read the complete earlier conversation when they have group access and
the action grant. Reading neither creates participation nor acknowledges or generates notifications.
It never requests agent work. Later group members can read earlier history without receiving
retroactive notifications; a returning group member can read again without reviving old participation.

### Timeline pagination

`limit` is a positive safe integer. `afterSequence` is an optional nonnegative safe integer;
omission or zero starts before the first activity. Pages contain at most `limit` items,
strictly after that sequence, ordered by sequence rather than timestamps. Pass the last
returned item's `activity.sequence` as the next cursor. An empty page means no later activity
is currently available. Later appended activity can be read using that same boundary.
The cursor belongs to the selected thread; it is not a journal position or notification cursor.

Message items contain `{ activity, message }`. Participation items contain `{ activity, participant }`,
where `participant` is a public joining summary, including for a participation that later ended.
`ParticipationEnded` includes the immutable departure reason and occurrence time. Use
`activity.kind` to identify the activity; the item schema is a union of those two shapes.

The application validates page bounds and order, then verifies each referenced message or
participation belongs to that thread and workspace. A follow's joining sequence must match its
activity. An ending must match the ended participation and its departure time. Missing or inconsistent subjects, duplicate or unordered
activity, and storage failures fail the read instead of producing partial content or empty pages.
Paging tests also seed canonical activity with nonmonotonic timestamps to isolate ordering;
reply tests verify pages containing messages published through the application.

### Current participants and access loss

Participant summaries contain `id`, `workspaceId`, `threadId`, `participant`, `joinedAt`, and
`joinedAtSequence`. `participant` is a public member (`memberId`), contact (`contactId`), or triage
reference. Summaries omit routing identities, group-admission linkage, and ended participation
history. A member appears only while its participation, exact original group admission, and
workspace membership are all active; contacts and triage need only active participation. The
current start and reply workflows admit members only. Rejoining a group under a new admission cannot make an
old participation current again. Member profiles are read through their own authorized operations.
A page skips participants who are no longer current and keeps reading until it holds `limit` of
them or the thread has no more; an empty page ends the listing. Reads return active participations
only, so a thread's ended history never adds to a page's cost.

Missing, foreign, and outside-audience thread IDs share `ThreadApplication.NotFound` for metadata,
timeline, and participant reads. An inaccessible group list returns `ThreadApplication.GroupNotFound`.
A member in the audience without the action grant receives `Authorization.Denied` for a single
thread read; discovery omits unreadable threads. Removed or identity-mismatched actors fail the
current workspace-membership check. The gateway preserves these outcomes and maps invalid page
options to `Gateway.InvalidInput`. Existing notifications never bypass source access checks;
the source-resolution operation below applies the same current audience and read permission.

Reads open no transaction and perform no journal, checkpoint, participation, or notification
writes. An enclosing caller transaction is honored, including staged activity, admissions,
departures, and grant changes. Separate reads and pages do not promise a shared snapshot;
revocation affects subsequent authorization checks but does not cancel an already-authorized read.
Group thread lists, timelines, and current-participant lists have cursor pages.

## Resolving a notification source

`NotificationApplication.resolveSource(notificationId)` returns the source's `Thread.TimelineItem`
for the acting human or agent. It first checks active workspace membership and notification
ownership. Missing IDs and other recipients' notifications both return
`NotificationApplication.NotFound`, before any source lookup.

The internal `NotificationSource` reader looks up the referenced journal entry directly by ID.
It supports the current `ThreadActivityFacts.Recorded` version in the workspace journal and
validates the notification's recorded time, selected recipient, historical participation, and
activity references. `ThreadActivityReading` then checks current group audience and `thread.read`
on the Thread target before resolving the subject. Timeline pages use the same internal reader.
The result contains the activity and its message or public participation summary; it does not
expose the journal envelope, recipient selection, or internal identity/admission snapshots.

Owning a notification does not grant access to its source. Missing entries, unsupported logs or
fact versions, and sources outside current access return `NotificationApplication.SourceUnavailable`.
Inconsistent stored references and storage failures fail the operation and remain internal errors
at the gateway. Invalid notification IDs become `Gateway.InvalidInput`.

Unfollowing does not remove group access, so earlier sources remain readable with `thread.read`.
Leaving the group or losing that grant blocks subsequent resolution. Readmission can restore
access to history without reviving the old participation. Both pending notifications and discarded
agent notifications can resolve; reading never acknowledges input, changes notification state,
joins a thread, or requests work. These reads open no transaction, honor an enclosing commit,
and have the same snapshot and revocation limits as timeline reads.

Source resolution is implemented in core, the gateway, and the storage adapters. Its HTTP route and
client integration remain future work.

## Acknowledging a notification

`NotificationApplication.acknowledge(notificationId)` records that the acting human saw their
notification and returns the updated `Notification.Record`. It requires active workspace
membership and ownership, checked on every call. It needs no action grant or thread access: a
person can clear an old notification after leaving its group or losing `thread.read`.
Acknowledgment does not resolve the source, rejoin participation, or mark conversation content read.

The state becomes `{ _tag: "Acknowledged", outcome: { _tag: "Seen" }, acknowledgedAt }`, with the
server's current time. The notification keeps its ID, source, recipient, participation reference,
and original recorded time. It remains in inbox history and disappears from pending results and
pending counts. Repeating the acknowledgment returns its original state and timestamp; when two
devices acknowledge at once, both succeed and return the first time stored. Missing and other recipients' IDs return `NotificationApplication.NotFound`.
An owned agent notification returns `HumanRecipientRequired`; an incompatible terminal state
returns `AlreadyHandled`. Removed or identity-mismatched actors fail the current membership check.

A human's `Seen` is private state beside the notification, recorded by `NotificationStore.markSeen`
outside the journal, like read positions: it takes no journal commit and no place in the
workspace's write order, since people read far more often than they write. The store keeps the
first time. The journal settles a notification only as `Pending` or `Discarded`; reads show a seen
pending notification as `Acknowledged`. `markSeen` accepts only pending notifications of human
recipients in its workspace, all or none of a call, and joins the caller's transaction when there
is one, so an enclosing rollback restores pending state. Rebuilding projections keeps it: the seen
records reference notifications by ID, and the rebuilt notifications read as seen again.

Acknowledgment creates no thread activity, no new notifications, and no journal commit; the
person's other connected sessions hear of it as a `NotificationsSeen`
[signal](../packages/core/README.md#signals) on the change feed. Handoffs of work, such as an
agent's turn accepting input or a channel delivery accepting a reply, will be journal facts that
their owning workflows record in the same commit as the turn or delivery. The operation is
implemented through core and the gateway on every storage adapter; its HTTP route and client
action remain pending.

## Marking conversations read

`ReadStateApplication.markThreadRead({ threadId, throughSequence })` records that the acting
person has read a thread through a timeline position. It requires a human actor, the thread's
current group access, and `thread.read`, like any thread read; missing and inaccessible threads
return `ReadStateApplication.ThreadNotFound`, an agent returns `HumanRequired`, and a position past
the thread's latest activity returns `BeyondTimeline`. The position only moves forward: marking an
earlier position changes nothing. The reader's pending notifications from that thread's activity
up to the position are marked `Seen`. Both are private state written without a journal commit. Reading a timeline does not mark it read; clients
call this operation for what they have shown.

`markGroupRead({ groupId })` records that the acting person caught up with a group now. It needs
current group membership and `group.read`, and returns `GroupNotFound` otherwise; the caught-up
time also only moves forward.

Read positions and caught-up times are private state in `ReadStateStore`, outside the journal, as is
human `Seen` beside the notifications: they are not facts, the change feed carries no events for
them, and rebuilding projections keeps them. The person's connected sessions hear of each change
as a `ThreadRead` or `GroupCaughtUp` [signal](../packages/core/README.md#signals). A write outside a journal commit runs on its own, so reading does not wait for the
workspace's conversation writes.

Each thread records the sequence and time of its latest message, and each group the time of its
latest message in any thread; quiet participation activity does not count. The thread activity
projection maintains both, and `ThreadStore.getLatest` and `GroupStore.getLatest` read them in
batches. Notifications from thread activity carry their thread and sequence, so reading a thread
settles exactly its notifications.

Starting a thread or replying reads it through the author's message in the same commit: their
position advances, and their pending notifications from the thread up to it are marked `Seen`,
both joining that commit. The message itself never notifies its author. [Thread lists](#reading-conversations) and
[group lists](group-workflows.md#reading-groups-and-their-current-members) report unread state
from these records.

Read-state tables reference no projection rows, so rebuilding projections from the journal keeps
positions and caught-up times. Operations write read state only for threads and groups they have
checked.

## Typing

`SignalApplication.typing(threadId)`, and `POST /workspaces/:workspaceId/threads/:threadId/typing`
over HTTP, tells the thread's readers that the acting member is composing there. It needs the
same current group access and `thread.publish` as posting, and returns `ThreadNotFound` for
missing and inaccessible threads. The `Typing` [signal](../packages/core/README.md#signals)
reaches the group's members with `thread.read` for the thread, on every host, and lasts six
seconds unless repeated; repeats within two seconds are dropped. It is never stored, creates no
activity or participation, and a reader who connects later never sees it.

## Recorded changes and replay

Every timeline item uses `ThreadActivityFacts.Recorded` with the same `{ activity, recipients }`
envelope. `activity` is a typed `MessagePublished`, `ParticipationFollowed`, or `ParticipationEnded`
record. `ThreadActivityRecording` owns next-position lookup, validates the position again before
recording, assigns the activity ID, and publishes the common fact within the caller's transaction.
Domain facts remain separate: message publication and participation changes own their state;
activity owns their position in the conversation. Each activity references its causing domain fact.

The notification projection consumes this one activity fact for all kinds. It generates durable
notifications from the recorded recipient selection without switching on activity kind or
recomputing current membership. The workflow selects recipients: messages follow addressing
rules, while explicit follow and all participation endings currently select an empty list.
Quiet activity still passes through the same recording and notification pipeline. Recorded activity
is the projection's sole input for generation and departure settlement: for `ParticipationEnded`, it first discards existing
pending input for that agent participation, then runs the common recipient-generation step.
An empty recipient list suppresses new notifications without suppressing cleanup. Participation
domain facts update participation state; they do not directly change notifications.

The workflow records, in order, a thread, its initial participations, a user message, and one
`MessagePublished` activity at sequence 1. The timeline has an increasing sequence per thread;
storage rejects gaps, duplicate positions, and activities whose message belongs to another thread.
A timeline record references the message without duplicating its text. Internal stores preserve
workspace-qualified relationships and immutable IDs. The PostgreSQL adapter stores record fields
in relational columns, including a text array for mention IDs; the memory adapter keeps each
record's encoded JSON. Admission reads only the members and participants a start or reply names:
the admissions of members joining, with `GroupMembershipStore.findActiveMany`, and the current
participation of each addressed participant, with `ThreadParticipationStore.findActive`. A reply
without mentions also reads the thread's current participants, the people it notifies, in pages of
active participations. Neither reads a group's roster or a thread's ended participations, so a
reply costs the same in a large group or a long-lived thread as in a small one. The notification
projection loads every recipient's participation and inserts their notifications together, so a
start or reply reads the same number of times at any group size. Timeline pages load their messages and
participations the same way.

`ThreadCreation` is an internal service for authorized workflows to reuse. It validates domain
references and requires an existing transaction and publication context. It is excluded from
`Core.Operations` and performs no additional member-level permission check. There is no public
empty-thread operation. The complete start workflow owns participation and initial publication.

`ThreadMessageApplication` owns reply authorization and its transaction. Both starts and replies
use internal `ThreadMessagePublication` and `ThreadParticipationAdmission` services. Those services
validate domain relationships and require the caller's transaction and publication context; they
do not impose another action permission or open another commit. `ThreadAccess` shares current
audience checks between reads and replies without imposing a read grant on a write. All these
internal services are excluded from `Core.Operations`. The opening message remains covered by
`thread.start`; it does not call the public reply operation or require `thread.publish`.

Thread creation, participation admissions, message publication, timeline activity, and notification
inserts commit together. Any failure rolls back all of them. An enclosing caller
transaction is honored, including staged permission or admission changes. Concurrent starts and
departures share the workspace transaction boundary. Storage contention can reject an attempt;
operations do not retry automatically.

Creation provides the causal parent of participation and message facts; the message fact causes
its timeline activity. Activity facts record the chosen participation IDs and recipient identities.
Notification generation uses that recorded selection, the activity event as its source, and a
stable ID derived from the source event and participation. It does not recompute recipients from
today's group or current grants. Replay preserves timestamps, provenance, sequence, recipients,
and subsequent departure outcomes even after permissions and membership change.

Facts use their stable record IDs as occurrence identities. Matching republication reuses the
recorded occurrence, but calling `startInGroup` again generates a new thread. There is no
request-level idempotency receipt yet; reconcile an uncertain commit before invoking it again.

## Departure and pending input

Each participation references the exact group admission that established it. Internal
`GroupMembershipDeparture` records group departure and calls `ThreadParticipationDeparture`
for each active participation under that admission. Explicit unfollow calls the same participation
departure service. Workspace-member removal uses the group departure service for each admission.
Each affected thread receives an explicit participation-ended fact and activity, with reason
`unfollowed`, `group-left`, `group-removed`, or `workspace-removed`. Already-ended participations
are skipped by cascades; their history stays intact. Participation and notification projections
do not derive hidden bulk changes from group-removal facts. Replay applies the recorded per-thread
changes, without rerunning the departure workflows. Rejoining never revives old work.

Pending agent notifications from the ended participation become
`Discarded { reason: "participation-ended" }`. Their source, recipient, participation ID, and
recorded time remain intact. Human notification history is retained. Cleanup shares the
removal transaction; failure restores membership, participation, and pending input together.
Actual turn cancellation will be added with turn execution; there are no running turns yet.

## Privacy and current limits

Thread creation, participation, message, and activity facts reach the thread's group members
with `thread.read` for that thread over the [change feed](../packages/core/README.md#change-feed).
Messages carry their full text, so clients render them without a refetch. Activity events omit
their notification recipients, and participation events omit routing identities and admissions.
Each notification an activity creates reaches its human or agent recipient in the same commit
message, as their inbox lists it, with or without read access to the thread. Typing reaches the
same readers as the thread's facts, and read-state signals only the reader's own sessions.
Notifications expose source references, not continuing authority to read the source conversation.

The public core surface provides starts, human replies, follow/unfollow, and the authorized reads above. Internal store reads are not
authorized thread APIs. Managing other participants, agent/contact/triage acknowledgment,
silent agent completion, turn execution, task activity, and task or channel
thread starts remain unimplemented. The [core model](core-model.md) describes the broader intent.

Opening messages and participation activity updated both development schema baselines. Recreate disposable
development databases when adopting that baseline; no upgrade chain or automatic data reset is provided. New permission bundles also
apply only to fresh workspace initialization unless stored roles are explicitly updated.
Activity rows reference either a message or a participation lifecycle occurrence. Existing stored roles do not automatically gain
`thread.read`, `thread.publish`, or `thread.follow`; assign explicit grants or update those roles before using the new operations.
Human `Seen` lives in PostgreSQL's `notification_seen` table, which replaced the notification's
acknowledgment columns in the development baseline; recreate disposable PostgreSQL databases when
adopting it. Message, activity, and participation
facts carry their thread's `groupId`, which decides their [audience](journal.md#fact-audiences);
facts recorded before that change do not decode, so recreate development databases that hold
threads. Notifications also record their thread's group, which added `thread_group_id` to
PostgreSQL's development baseline.

## Verification

The mirrored adapter suites cover author-only and mention routing, agent-use authority for
mentioned agents only, custom
scopes, inaccessible references, validation without partial writes, notification and late
failures, outer transactions, concurrent departure, readmission, reopening, replay, and direct
store constraints. Read suites cover exact grants, nonparticipant and later-member access,
pagination, private identity filtering, no-write reads, current revocation, outer transactions,
and rejection of corrupt cross-thread references. Core tests verify that the change feed delivers thread facts only to the group's readers, and
signals by their reach under the reader's current access. Signal suites cover typing across hosts
and its authorization, and read state reaching only the reader's own sessions.
Reply suites cover scoped action grants, live access changes, initial and returning admissions,
mention and unmentioned selection, agent use for mentioned agents only, concurrent sequencing and
removal, projection and late failures,
outer commits, reopening, and replay after grants or membership change.
Read-state suites cover latest activity from messages only, forward-only positions and caught-up
times, settling the inbox up to a position in one commit, writing no commit when nothing is
pending, positions past the timeline, human and access checks, and read-state storage inside and
outside transactions.
Participation suites verify quiet following, repeat calls, self-only unfollow, stale requests,
notification retention/settlement, rejoining through follows and messages, concurrent publication,
projection and late-failure rollback, outer commits, replay, and historical follow reads.
Source-resolution suites cover human/agent ownership, current grant and audience revocation,
historical reads after unfollow or readmission, discarded agent input, malformed references,
message and participation subjects, direct entry lookup, read-only behavior, outer commits,
reopening, and gateway outcomes on every storage adapter.
Acknowledgment suites cover ownership, agent rejection, the first time kept on repeats, no journal
writes, source-access loss, failed writes, caller transactions, concurrent requests from two hosts,
direct-store validation, and `Seen` surviving reopening, projection rebuilds, and departure.
They also exercise the common notification generator with nonempty recipient selections on
non-message activity, ending activity for all departure paths, and rollback after a partial
multi-thread departure cascade.
Run `bun run check` and `bun run test` from the repository root.
