# Thread workflows

Conversations in groups: starting them, replying, following, reading, and the notifications and
read state around them. The operations are `ThreadApplication`, `ThreadMessageApplication`,
`ThreadParticipationApplication`, `NotificationApplication`, `ReadStateApplication`, and
`SignalApplication` in a workspace context, such as `Gateway.asMember`. The gateway preserves the
outcomes named below and maps malformed input to `Gateway.InvalidInput`. Storage and consistency
failures remain failures.

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

The result contains `thread`, `message`, and `activity`. The operation accepts non-whitespace
text and preserves it verbatim, including indentation and newlines. `mentions` is an explicit
array of distinct workspace-member IDs; text such as `@Reviewer` does not itself address anyone.

Authorization and validation run in the same commit as the start:

- The caller must be a human with active workspace and group membership and `thread.start` on
  the group. An agent caller receives `ThreadApplication.HumanAuthorRequired`.
- Each mentioned agent requires `agent.use` on it. Agents that are not mentioned need no
  authority, including the agents of a direct group. Missing authority rejects the whole
  operation; recipients are never silently dropped.
- Mentioned members must currently belong to the group and the workspace. A mention cannot admit
  an outsider; missing, foreign, inactive, and outside-group mentions return
  `ThreadApplication.ParticipantUnavailable`.

Starting needs no `group.read`, `group.create`, or membership-management grant. Missing and
inaccessible groups share `ThreadApplication.GroupNotFound`.

## Starting a direct group

`ThreadApplication.startDirect({ memberIds, text, mentions })` starts a thread in the direct group
of the author and `memberIds`. The same members, in any order and whether or not the author is
listed, always reuse one direct group; a different set gets a different group. The first start
establishes the group and one admission per member in the same commit. The caller needs active
workspace membership, a human identity, and `thread.start` on the direct group. The start that
creates the group also needs `agent.use` for each agent member, since the group gives its agents a
place in every thread, as making an agent follow a team group does; later starts, through either
operation, need it only for mentioned agents. Every member takes part in the thread, and mentions,
which must name members, only narrow notification. Fewer than two distinct members returns
`ThreadApplication.DirectMembersRequired`; a missing or inactive member, or a mention outside the
group, returns `ThreadApplication.ParticipantUnavailable`. Later threads in the same direct group
can also start with `startInGroup`.

## Participation and recipients

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

An author mentioned explicitly appears only once, and a message never notifies its own author.
Participation and notification are separate recorded decisions. Other group members can read the
thread when they hold `thread.read`; reading does not enroll them. A later group addition does not
enroll that member in existing threads or create retroactive notifications.

Participants are members, contacts, or triage. Only the member workflows above exist today;
task and channel workflows will start threads with contacts and triage through the same internal
start. Notifications to agents are pending input for them to handle; no agent work runs yet.

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

The result contains `message` and `activity`. Text and mentions are validated as for starts.
Without a request key, every call publishes a new message; see [retrying safely](#retrying-safely).

The caller must be a human with active workspace membership, current membership in the thread's
group, and `thread.publish` on the thread. Replying needs no `thread.read`, `thread.start`,
`group.read`, or management grant, and audience membership or authorship alone does not
authorize it.

The author joins the thread if necessary, and explicit mentions admit eligible group members who
are not participating. An existing participant keeps their participation and joining point; a
returning member whose participation ended gets a fresh one, joining at the introducing message.
Earlier messages remain history, without retroactive notifications.

| Reply addressing  | Notification recipients                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| No mentions       | Every current participant except the replying author, including contacts and triage. |
| Explicit mentions | Only the mentioned eligible members, admitted in the same commit if needed.          |

Mentions do not remove existing participants, and an unmentioned reply does not enroll the rest of
the group. Each mentioned agent requires `agent.use`; an unmentioned reply reaches agents already
participating without it, since whoever brought them in authorized them to handle the thread.

Missing, foreign, and outside-audience threads share `ThreadMessageApplication.NotFound`.
Ineligible mentions return `ThreadMessageApplication.ParticipantUnavailable`, and agent callers get
`ThreadMessageApplication.HumanAuthorRequired`. Admission, the message, its timeline activity, and
its notifications commit together; the timeline never has gaps or duplicate positions.

## Retrying safely

Starts (`startInGroup` and `startDirect`) and replies take an optional second argument,
`{ requestKey }`. A client chooses a new key, such as a UUID, for each message it sends and repeats
it on every retry. A retry returns the thread or message the first attempt created and records
nothing more, including when the first attempt committed but its answer was lost. The same key with
a different input returns `Request.Reused`, and a retry after an attempt that rolled back runs
again. Keys belong to their member and their operation, so another member's key, or the same key
on a reply rather than a start, is a separate request. Without a key, every call creates anew.

## Following and unfollowing

`ThreadParticipationApplication.follow(threadId)` joins the acting human or agent and returns a
public `ThreadParticipation.Summary`. It requires active workspace and group membership and
`thread.follow` on the thread. A new follow records a quiet `ParticipationFollowed` timeline
activity at the next position, with no message and no notifications. Following while already
participating returns the existing summary and records nothing.

`unfollow({ threadId, participationId })` returns no value and ends only the actor's addressed
participation. It requires current workspace and group membership but no action grant, so a member
can unfollow after losing the follow permission. Other members' IDs, another thread's IDs, and
missing participations share `ThreadParticipationApplication.NotFound`; one's own ended
participation returns `AlreadyEnded`. An inaccessible or missing thread returns
`ThreadParticipationApplication.ThreadNotFound`.

Unfollowing records a `ParticipationEnded` activity with its reason and keeps the participation's
history. Pending agent notifications for that participation are discarded in the same commit;
human notification history remains. A later follow, own reply, or mention can establish a fresh
participation, which an old unfollow request cannot end. Unmentioned messages do not re-enroll an
unfollowed member. Muting is not implemented.

## Reading conversations

Every thread read requires active workspace membership, current membership in its group, and
`thread.read` on the thread, at workspace scope or for that exact thread. Membership, authorship,
ownership, group management, `group.read`, and `thread.start` do not replace it. Humans and agents
follow the same policy.

| Operation                                                                   | Result                                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get(threadId)`                                                             | The thread's metadata.                                                                                                                                                                                       |
| `listInGroup(groupId, { limit, before? })`                                  | A page of `Thread.ListItem` values, newest latest activity first: each readable thread with its latest message, the caller's read position, and `unread`. Threads without a covering read grant are skipped. |
| `readTimeline(threadId, { limit, afterSequence?, beforeSequence?, from? })` | An ascending sequence page of `Thread.TimelineItem` values with each activity's resolved subject, from the oldest or the newest end of the range.                                                            |
| `listParticipants(threadId, { limit, after? })`                             | A page of current `ThreadParticipation.Summary` values in participation-ID order, after the exclusive `after` participation ID.                                                                              |

`listInGroup` keeps reading until the page is full or the group has no older threads. Its
exclusive `before` cursor is the last item's latest activity time and thread ID. A thread is
`unread` when its latest message is past the caller's read position or, if never read, came after
the caller joined the group. Posting reads the thread through the author's own message.

A nonparticipant with group access and the grant can read the whole earlier conversation. Reading
creates no participation, acknowledges nothing, and requests no agent work. Later group members
can read earlier history without retroactive notifications.

Missing, foreign, and outside-audience threads share `ThreadApplication.NotFound`, and an
inaccessible group list returns `ThreadApplication.GroupNotFound`. A member of the audience without
the grant receives `Authorization.Denied` for a single thread; lists omit unreadable threads.
Reads follow core's [read boundaries](../packages/core/README.md#read-and-write-boundaries).

### Timeline pages

A page covers the activities strictly after `afterSequence` (a nonnegative safe integer; omitted or
zero, from the first) and strictly before `beforeSequence` (a positive safe integer greater than
`afterSequence`; omitted, through the latest), and holds at most `limit` of them, a positive safe
integer. By default it takes the range's oldest; with `from: "newest"`, its newest. Either way the
items are in ascending sequence order.

A view opens at the latest activity with `{ limit, from: "newest" }`, pages back by passing the
first item's `activity.sequence` as `beforeSequence` until a page comes back empty, and catches up
by passing the last item's sequence as `afterSequence`, where an empty page means no later activity
yet. Cursors belong to the thread; they are not journal or notification cursors.

Message items contain `{ activity, message }`. Participation items contain
`{ activity, participant }`, where `participant` is a public joining summary, even for a
participation that later ended. `ParticipationEnded` includes the departure reason and time. Use
`activity.kind` to tell them apart. Missing or inconsistent subjects fail the read instead of
producing partial pages.

### Current participants

Summaries contain `id`, `workspaceId`, `threadId`, `participant`, `joinedAt`, and
`joinedAtSequence`. `participant` is a public member (`memberId`), contact (`contactId`), or triage
reference, without routing identities or admission links. A member appears only while their
participation, its group admission, and their workspace membership are all active; contacts and
triage need only an active participation. Rejoining a group under a new admission cannot make an
old participation current again. A page skips participants who are no longer current and keeps
reading until it holds `limit` of them or the thread has no more; an empty page ends the list.

## Resolving a notification source

`NotificationApplication.resolveSource(notificationId)` returns the source's `Thread.TimelineItem`
for the acting human or agent. It first checks active workspace membership and that the caller owns
the notification: missing IDs and other recipients' notifications both return
`NotificationApplication.NotFound`, before any source lookup. It then checks current group access
and `thread.read` on the source thread, as timeline reads do, and returns the activity with its
message or participation summary.

Owning a notification does not grant access to its source. Missing or unsupported sources, and
sources outside current access, return `NotificationApplication.SourceUnavailable`. Unfollowing
keeps group access, so earlier sources stay readable with `thread.read`; leaving the group or
losing the grant blocks resolution, and readmission restores it without reviving the old
participation. Pending and discarded agent notifications both resolve. Resolving changes nothing.

## Acknowledging a notification

`NotificationApplication.acknowledge(notificationId)` records that the acting human saw their
notification and returns the updated `Notification.Record`. It requires active workspace
membership and ownership, but no action grant or thread access: a person can clear an old
notification after leaving its group or losing `thread.read`. It does not resolve the source,
rejoin participation, or mark the conversation read.

The state becomes `{ _tag: "Acknowledged", outcome: { _tag: "Seen" }, acknowledgedAt }`. The
notification stays in inbox history and leaves pending results and counts. Repeating it returns
the first time stored, including when two devices acknowledge at once. Missing and other
recipients' IDs return `NotificationApplication.NotFound`; an agent's notification returns
`HumanRecipientRequired`, and a discarded one `AlreadyHandled`.

`Seen` is private state, like read positions: it is kept outside the journal, takes no place in the
workspace's write order, and survives rebuilding projections. It creates no activity or
notifications. The person's other connected sessions hear of it as a `NotificationsSeen`
[signal](../packages/core/README.md#signals). Handing work to an agent's turn or a channel will be
recorded by those workflows, not by acknowledgment.

## Marking conversations read

`ReadStateApplication.markThreadRead({ threadId, throughSequence })` records that the acting
person has read a thread through a timeline position. It requires a human actor, current group
access, and `thread.read`: missing and inaccessible threads return
`ReadStateApplication.ThreadNotFound`, an agent returns `HumanRequired`, and a position past the
latest activity returns `BeyondTimeline`. The position only moves forward. The reader's pending
notifications from the thread up to that position become `Seen`. Reading a timeline does not mark
it read; clients call this for what they have shown.

`markGroupRead({ groupId })` records that the acting person caught up with a group now. It needs
current group membership and `group.read`, and returns `GroupNotFound` otherwise; the caught-up
time also only moves forward.

Positions and caught-up times are private state, like `Seen`: outside the journal, never waiting
for the workspace's conversation writes, and kept when projections are rebuilt. The person's other
sessions hear of each change as a `ThreadRead` or `GroupCaughtUp`
[signal](../packages/core/README.md#signals). Starting a thread or replying reads it through the
author's message in the same commit. [Thread lists](#reading-conversations) and
[group lists](group-workflows.md#reading-groups) report unread state from these records; only
messages count as new activity, not quiet participation changes.

## Typing

`SignalApplication.typing(threadId)`, and `POST /workspaces/:workspaceId/threads/:threadId/typing`
over HTTP, tells the thread's readers that the acting member is composing there. It needs the same
current group access and `thread.publish` as posting, and returns `ThreadNotFound` for missing and
inaccessible threads. The `Typing` [signal](../packages/core/README.md#signals) reaches the group's
members with `thread.read` for the thread, on every host, and lasts six seconds unless repeated;
repeats within two seconds are dropped. It is never stored.

## Departure and pending input

Each member participation belongs to the group admission that established it. Leaving or being
removed from the group, or from the workspace, ends every active participation under that admission,
each recording a participation-ended activity with reason `unfollowed`, `group-left`,
`group-removed`, or `workspace-removed`. Already ended participations keep their history, and
rejoining never revives old work.

Pending agent notifications from an ended participation become
`Discarded { reason: "participation-ended" }`, keeping their source, recipient, and time. Human
notification history is kept. All of it shares the departure's commit.

## Recorded history and delivery

A start records the thread, its initial participations, the message, and one `MessagePublished`
activity at sequence 1, in one commit; each later message, follow, and departure adds activity at
the next sequence. Notifications come from the recipients recorded with each activity, with IDs
derived from the activity and participation, never recomputed from today's group or grants. Replay
therefore reproduces the same timeline, recipients, and departures after permissions and
membership change. Recording the same fact again reuses the original, and a keyed start or reply
returns its first result on a retry ([retrying safely](#retrying-safely)).

Thread, participation, message, and activity facts reach the group's members with `thread.read`
for that thread over the [change feed](../packages/core/README.md#change-feed). Messages carry their
full text, so clients render them without a refetch. Activity events omit their recipients, and
participation events omit routing identities and admissions. Each notification an activity creates
reaches its human or agent recipient in the same commit message, as their inbox lists it, whether
or not they may read the thread. Notifications carry source references, not continuing authority to
read the source.
