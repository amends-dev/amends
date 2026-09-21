# Thread workflows

Core and both storage adapters implement human opening messages, replies, following/unfollowing,
and authorized reads in private team groups. Call the thread application services through
`Gateway.asMember` or a trusted workspace context. HTTP/UI, DMs,
standalone threads, attachments, and agent execution remain separate implementation steps.

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
is an explicit array of distinct workspace-member IDs. An empty array means broadcast;
text such as `@Reviewer` does not itself create structured addressing.

Authorization and validation run in the same journal commit as creation and publication:

- The caller must have active workspace and group membership and `thread.start` on that Group.
- Each selected agent requires `agent.use` on that agent's workspace-member target, whether
  selected through broadcast or an explicit mention. Narrowed messages need no authority over
  unselected agents. Missing authority rejects the whole operation; recipients are not silently dropped.
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

## Initial participation and recipient selection

| Opening message      | Initial participants                                              | Notification recipients               |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| No explicit mentions | All current active group members, including the author and agents | All those participants                |
| Explicit mentions    | The author plus the mentioned eligible members                    | The explicitly mentioned participants |

An author mentioned explicitly appears only once. There is no implicit sender exclusion:
broadcast includes the author; a narrowed message not mentioning its author does not notify them.
Participation and notification selection are separate recorded decisions. Other group members
remain in the inherited access audience when mentions narrow participation and can read
the thread when they hold `thread.read`. Reading does not enroll them.

A later group addition does not enroll that member in existing threads or create retroactive
notifications. Unmentioned replies address that thread's current participants plus their author,
without enrolling the whole group again. Members can also follow explicitly without posting.

Broadcast agent notifications represent input for recipient evaluation. The agreed design allows
an agent to ask a question, perform work, reply, or finish silently after evaluating relevance.
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

| Reply addressing  | Notification recipients                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| No mentions       | Current active thread participants, including the replying author.          |
| Explicit mentions | Only the mentioned eligible members, admitted in the same commit if needed. |

Mentions do not remove existing participants. Group members outside the thread are not enrolled
by an unmentioned reply, including members added to the group after the thread started. There
is no sender exclusion: an author receives their broadcast, or a message mentioning themselves.
Each selected agent requires `agent.use` on its Member target. A broadcast therefore requires
authority over participating agents; a message addressed only to humans does not. Missing agent
authority rejects the whole publication instead of silently dropping recipients.

Missing, foreign, and outside-audience thread IDs share `ThreadMessageApplication.NotFound`.
Ineligible mentions return `ThreadMessageApplication.ParticipantUnavailable`; agent callers get
`ThreadMessageApplication.HumanAuthorRequired`. The gateway preserves these errors and converts
malformed input to `Gateway.InvalidInput`. Storage and consistency failures remain failures.

Authorization, admission, message publication, next-sequence activity, notifications, and
checkpoints share one journal commit. An outer transaction is honored, including earlier replies,
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

All checks, facts, projections, and checkpoints share the existing workspace transaction.
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

| Operation                                           | Result                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `get(threadId)`                                     | The thread's metadata.                                                                                                |
| `listInGroup(groupId)`                              | Current readable threads in that group, in stable thread-ID order. Threads without a covering read grant are omitted. |
| `readTimeline(threadId, { limit, afterSequence? })` | An ascending sequence page of `Thread.TimelineItem` values with each activity's resolved subject.                     |
| `listParticipants(threadId)`                        | Current `ThreadParticipation.Summary` values in participation-ID order.                                               |

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

Participant summaries contain `id`, `workspaceId`, `threadId`, `memberId`, `joinedAt`, and
`joinedAtSequence`. They omit routing identities, group-admission linkage, and ended participation
history. A record appears only while its participation, exact original group admission, and
workspace membership are all active. Rejoining a group under a new admission cannot make an
old participation current again. Member profiles are read through their own authorized operations.

Missing, foreign, and outside-audience thread IDs share `ThreadApplication.NotFound` for metadata,
timeline, and participant reads. An inaccessible group list returns `ThreadApplication.GroupNotFound`.
A member in the audience without the action grant receives `Authorization.Denied` for a single
thread read; discovery omits unreadable threads. Removed or identity-mismatched actors fail the
current workspace-membership check. The gateway preserves these outcomes and maps invalid page
options to `Gateway.InvalidInput`. Existing notifications never bypass source access checks;
notification-source resolution remains a separate workflow.

Reads open no transaction and perform no journal, checkpoint, participation, or notification
writes. An enclosing caller transaction is honored, including staged activity, admissions,
departures, and grant changes. Separate reads and pages do not promise a shared snapshot;
revocation affects subsequent authorization checks but does not cancel an already-authorized read.
Thread discovery and participant lists are currently unpaginated.

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
is the notification projection’s sole input: for `ParticipationEnded`, it first discards existing
pending input for that agent participation, then runs the common recipient-generation step.
An empty recipient list suppresses new notifications without suppressing cleanup. Participation
domain facts update participation state; they do not directly change notifications.

The workflow records, in order, a thread, its initial participations, a user message, and one
`MessagePublished` activity at sequence 1. The timeline has an increasing sequence per thread;
storage rejects gaps, duplicate positions, and activities whose message belongs to another thread.
A timeline record references the message without duplicating its text. Internal stores preserve
workspace-qualified relationships and immutable IDs. The PostgreSQL adapter stores record fields
in relational columns, including a text array for mention IDs; SQLite uses validated JSON records
with indexed identity and relationship columns.

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

Thread creation, participation admissions, message publication, timeline activity, notification
inserts, and checkpoints commit together. Any failure rolls back all of them. An enclosing caller
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

Thread creation, participation, message, and activity facts are withheld from the workspace-wide
change feed, including text, recipient selection, and provenance. Mixed commits retain only their
other supported public events. A thread-only commit therefore provides no inbox refresh signal
through that feed. Audience-aware thread subscriptions and live notification delivery remain work.
Notifications expose source references, not continuing authority to read the source conversation.

The public surface provides starts, human replies, follow/unfollow, and the authorized reads above. Internal store reads are not
authorized thread APIs. Notification-source resolution, managing other participants, general
acknowledgment, silent agent completion, turn execution, task activity, DMs, and standalone threads
remain unimplemented. The [core model](core-model.md) describes the broader intent.

Opening messages and participation activity updated both development schema baselines. Recreate disposable
development databases when adopting that baseline; no upgrade chain or automatic data reset is provided. New permission bundles also
apply only to fresh workspace initialization unless stored roles are explicitly updated.
Activity rows reference either a message or a participation lifecycle occurrence. Existing stored roles do not automatically gain
`thread.read`, `thread.publish`, or `thread.follow`; assign explicit grants or update those roles before using the new operations.

## Verification

The mirrored adapter suites cover broadcast and mention routing, agent-use authority, custom
scopes, inaccessible references, validation without partial writes, notification and checkpoint
failures, outer transactions, concurrent departure, readmission, reopening, replay, and direct
store constraints. Read suites cover exact grants, nonparticipant and later-member access,
pagination, private identity filtering, no-write reads, current revocation, outer transactions,
and rejection of corrupt cross-thread references. Core tests verify withholding private thread facts from the public change feed.
Reply suites cover scoped action grants, live access changes, initial and returning admissions,
mention and broadcast selection, concurrent sequencing and removal, projection/checkpoint failures,
outer commits, reopening, and replay after grants or membership change.
Participation suites verify quiet following, repeat calls, self-only unfollow, stale requests,
notification retention/settlement, rejoining through follows and messages, concurrent publication,
projection/checkpoint rollback, outer commits, replay, and historical follow reads.
They also exercise the common notification generator with nonempty recipient selections on
non-message activity, ending activity for all departure paths, and rollback after a partial
multi-thread departure cascade.
Run `bun run check` and `bun run test` from the repository root.
