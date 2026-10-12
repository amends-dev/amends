# Thread workflows

Conversations in groups: starting them, as tasks or not, renaming them, replying, editing and
deleting messages, following, reading, tracking tasks, and the notifications and read state around
them. The operations are `ThreadService`, `ThreadMessageService`, `ThreadParticipationService`,
`TaskService`, `NotificationService`, and `ReadStateService` in a workspace context, such as
`Gateway.asMember`. The gateway preserves the
outcomes named below and maps malformed input to `GatewayErrors.InvalidInput`. Storage and consistency
failures remain failures. The [HTTP contract](../packages/http/README.md#conversations) exposes
each operation under `/workspaces/:workspaceId`, with the status each outcome returns.

## Starting a conversation

```ts
import { Group } from "@amends-dev/core/group";
import { ThreadService } from "@amends-dev/core/thread";
import { Effect } from "effect";

const start = (groupId: Group.Id) =>
  Effect.gen(function* () {
    const threads = yield* ThreadService.ThreadService;
    return yield* threads.startInGroup({
      groupId,
      text: "Here's the proposal",
      mentions: [],
    });
  });
```

The result contains `thread` and `message`; the timeline holds the activity that places the
message. The thread's `title` is null unless the start gives one, a trimmed line of 1 to 200
characters without hidden ones, and its `origin` is null: a start derives from no other thread.
The operation accepts non-whitespace
text and preserves it verbatim, including indentation and newlines. NUL characters and unpaired
surrogate halves, which storage cannot keep as given, are rejected as invalid input. `mentions` is an explicit
array of distinct workspace-member IDs; text such as `@Reviewer` does not itself address anyone.

Message text is markdown, as people write it and as agents reply. A mention in the text is a link
to the member, `[@Ada](member:<member ID>)`, which `ThreadMessage.mentionText` writes and
`ThreadMessage.mentionedIn` reads back: its label records the name they had when mentioned, and
readers show their current name. The text shows who was mentioned; `mentions` is whom the message
addresses, and the operation does not compare the two. The apps render emphasis, strikethrough,
code, lists, task lists, quotes, tables, and links; raw HTML shows as written, images show as
links to them without loading, and only web and email addresses link. A newline breaks the line.
The apps' composer writes this markdown as it formats a draft, and mentions a member by writing
their mention link.

Authorization and validation run in the same commit as the start:

- The caller must be a human with active workspace and group membership and `thread.start` on
  the group. An agent caller receives `CoreError.Denied` (`HumanRequired`).
- Each mentioned agent requires `agent.use` on it. Agents that are not mentioned need no
  authority, including the agents of a direct group. Missing authority rejects the whole
  operation; recipients are never silently dropped.
- Mentioned members must currently belong to the group and the workspace. A mention cannot admit
  an outsider; missing, foreign, inactive, and outside-group mentions return
  `ThreadService.ParticipantUnavailable`.

Starting needs no `group.read`, `group.create`, or membership-management grant. Missing and
inaccessible groups share `CoreError.NotFound`.

## Starting a direct group

`ThreadService.startDirect({ memberIds, text, mentions })` starts a thread in the direct group
of the author and `memberIds`. The same members, in any order and whether or not the author is
listed, always reuse one direct group; a different set gets a different group. The first start
establishes the group and one admission per member in the same commit. The caller needs active
workspace membership, a human identity, and `thread.start` on the direct group. The start that
creates the group also needs `agent.use` for each agent member, since the group gives its agents a
place in every thread, as making an agent follow a team group does; later starts, through either
operation, need it only for mentioned agents. Every member takes part in the thread, and mentions,
which must name members, only narrow notification. Fewer than two distinct members returns
`ThreadService.DirectMembersRequired`; a missing or inactive member, or a mention outside the
group, returns `ThreadService.ParticipantUnavailable`. Later threads in the same direct group
can also start with `startInGroup`.

## Renaming a thread

`ThreadService.rename({ threadId, title, expectedTitle })` requires `thread.rename` on the thread,
which every built-in role holds, and membership of its group. To anyone outside the group, the
thread is `CoreError.NotFound`, as a missing or foreign one is. The title follows the start's
rule, while `expectedTitle` is the title the renamer last saw, or null for a thread that had none.
Renaming records `thread.renamed` with the new title and, in the same commit, a quiet
`thread.renamed` activity whose details carry the new and previous titles; it returns the renamed
thread. The same title again records nothing. Otherwise `expectedTitle` must still be the thread's
title: one renamed meanwhile is `CoreError.Changed`, so a rename is never silently replaced,
and nothing is recorded. The activity notifies no one and makes nothing unread, and the title
never derives from a message: editing the opening message leaves the title as it is, and renaming
leaves every message as it is. Readers see the new title through the thread and its group's
stream, and the change feed delivers the fact to the group's readers. The [thread model](threads.md)
sets these rules.

## Tasks

A task is work a thread tracks: a row keyed by the thread with a `status` (`triage`, `todo`,
`doing`, `held`, `done`, or `dismissed`), a `priority` (`none` to `urgent`), and an `assignee`, a
member or null. Its title is the thread's and its description the thread's opening message, so it
holds no text; `Thread.ListItem` and `Thread.Opening` carry each thread's `task`, or null, and
`TaskService.get(threadId)` reads one under `thread.read`. A task comes about in three ways:

- **With its thread.** `ThreadService.startInGroup` with `task: { status?, priority?, assignee? }`
  creates the task at the thread's second position, in the same commit as the opening message,
  under `thread.start` and `task.create` on the group. A start may also name an `origin`, a thread
  the author can read that this one splits work out of; the origin grants no access either way.
- **From a conversation.** `TaskService.create({ threadId, status?, priority?, assignee? })` makes
  a thread the actor's group can reach a task, under `task.create`; the opening message becomes the
  description, and the title stays as it is. A thread that is a task already is
  `TaskService.AlreadyTask`.
- **Through a channel** ([channels](#channels)) that opens tasks, in `triage`, created by the
  contact whose message opened the conversation.

Without a status, a task starts in `triage`, or `todo` when assigned. An assignee must be able to
take part in the thread, or the operation is `TaskService.ParticipantUnavailable`, and assigning an
agent needs `agent.use` on it, as mentioning one does. The task's creation records `task.created`
and a quiet `task.created` activity whose details hold the initial values; it admits triage while
the task is in triage, and the assignee, and tells them: an agent assignee is asked for work when
the task is being worked (`todo` or `doing`).

`TaskService.update({ threadId, change })` changes one thing under `task.update` on the thread:
`{ _tag: "Status", from, to }`, `{ _tag: "Assignee", from, to }`, or
`{ _tag: "Priority", from, to }`, where `from` is the value the changer last saw. The same value
again records nothing; a task that changed meanwhile is `CoreError.Changed`. Each change
records `task.updated` and a quiet `task.updated` activity whose details are the change, so a later
change cannot alter what an earlier item meant. The change admits and tells by its kind, and
whoever made it is told nothing:

| Change                                   | Admits           | Tells                                                          |
| ---------------------------------------- | ---------------- | -------------------------------------------------------------- |
| Assignee                                 | The new assignee | The new assignee, asked for work when the task is being worked |
| Status to `triage`                       | Triage           | Triage                                                         |
| Status to `todo` or `doing`              | The assignee     | Every participant; the assignee agent is asked for work        |
| Status to `held`, `done`, or `dismissed` | Nobody           | Every participant                                              |
| Priority                                 | Nobody           | Every participant                                              |

An agent taken off a task, by reassignment or by a status that asks no work, has its active turn
in the thread asked to stop in the same commit, as a person's stop request does; the turn ends
with the reason `task-changed`. A task's title and description are its requirements: renaming the
thread or editing its opening message tells every participant and asks the assignee agent anew
while the task is being worked. `done` does not close the thread; messages continue, and a later
status reopens the work. `TaskService.listInGroup(groupId, { status?, before?, limit })` pages a
group's tasks newest created first, each as a `Thread.ListItem` under the rules of
`ThreadService.listInGroup`. To anyone outside a thread's group, the thread is `CoreError.NotFound`,
and for a thread without a task, the task is. Triage is a participant and recipient only: nothing yet
evaluates a policy or records a decision.

## Channels

A channel is a connection's external conversations, which become threads in one group: a support
inbox or a chat room, whatever the connection's integration gives as a `ChannelTransport`
([channel](../packages/channel/README.md)). `ChannelService.create({ connectionId,
groupId, name, opensTasks })` makes one under `channel.create`, over a connection the actor may read
and use whose integration gives channels (`ConnectionUnavailable` otherwise), into a group the actor
belongs to and may start threads in (`CoreError.NotFound` otherwise), since every member of that group
reads the channel's conversations. `list` and `get` read channels under `channel.read`;
`redirect({ channelId, groupId })` sends new conversations to another group, and `remove` stops the
channel's use, both under `channel.manage`. A removed channel's record and its threads' bindings
remain, and it receives nothing more. `getBinding(threadId)` is the external conversation a thread
came from, under `thread.read`; a thread that came through no channel has no binding, `CoreError.NotFound`.

What the external system sends the host reaches `ChannelIntake.receive(channelId, { headers, body })`
as no member: the channel's transport verifies the request, makes `events` of it, and says what to
`answer` the system with when it expects one. Each event is taken in as `intake` does, in a commit
of its own attributed to the **contact** who sent it, a person outside the workspace named as the
system names them, created when first heard from and renamed when called otherwise:

- A message in a conversation the channel has not heard before opens a thread in the channel's
  group, bound to that conversation, with the contact, the group's human followers, and, when the
  channel opens tasks, triage as participants, and the message as its opening, `via` the channel
  with the system's message id. The system's title, if any, is the thread's. A channel that opens
  tasks creates the task in `triage` at the second position, created by the contact.
- A message in a conversation it knows is published in its thread, readmitting the contact if their
  participation ended; everyone taking part is told, and no contact, since a contact's message tells
  no contact.
- An edit or a deletion of the contact's own message is applied to it, recording `message.edited` or
  `message.deleted`; one of a message intake never took in, or that is not theirs, and an edit that
  changes nothing, take in nothing (`Ignored`).
- Every id intake gives is derived from the external one, so an event the system sends again is a
  retry and takes in nothing more (`duplicate`); a message with no text to keep is `empty`; what the
  transport itself posted, received back, is an `echo`.

A contact is told of messages alone: a task's changes, follows, and departures are not delivered.
Activity that tells a contact something requests the thread's **delivery job** in its commit
(`DeliveryJobs`). The job accepts the contacts' pending notifications into **deliveries**, one for
each message, keyed by the channel, the conversation, and the message, so the contacts a message
notifies share one; accepting settles their notifications as `Accepted` by the delivery, in one
commit. Then, for each delivery still requested, in the order of the messages, it readies the
delivery (`DeliveryExecution.start`): the message's text with its author's name, the conversation
as the transport needs it, and the channel's connection with its key; posts it through the
connection's integration; and records the id the system gave the message (`sent`), or why it gave
up (`failed`). A message deleted before it was sent, a channel removed meanwhile, and a connection
that can no longer be reached fail the delivery as it stands. Edits and deletions of a sent message
are not carried yet. Over HTTP, channels sit under `/workspaces/:workspaceId/channels`, and systems'
requests arrive at `POST …/channels/:channelId/events` without a session
([channels over HTTP](../packages/http/README.md#channels)).

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

Participants are members, contacts, or triage. Tasks admit triage and their assignees through the
same internal start and activity, and [channels](#channels) admit contacts the same way. Notifications
to agents are pending input for them to handle, which their turns take up: a turn's prompt tells the
agent the thread as it stands, its title and its task, then every activity that notified it since
it was last prompted, each in its kind's words, so what an agent is told follows from these
recipient rules alone ([turns](../packages/core/README.md#turns)).

## Replying to a conversation

```ts
import { Thread, ThreadMessageService } from "@amends-dev/core/thread";
import { Effect } from "effect";

const reply = (threadId: Thread.Id) =>
  Effect.gen(function* () {
    const messages = yield* ThreadMessageService.ThreadMessageService;
    return yield* messages.publish({ threadId, text: "Here's my feedback", mentions: [] });
  });
```

The result is the published message: its `content` holds the text and mentions at revision 1, and
its `via` is null for a message written in amends, or names the agent's turn that posted it. Text
and mentions are validated as for starts. Without a request key, every call publishes a new
message; see [retrying safely](#retrying-safely).

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

The activity records, for each recipient, whether it asks that recipient for work. A person's
message asks every agent it reaches, whose notification stays `Pending` until a turn takes it up.
An agent's message asks no other agent, so agents cannot keep setting each other to work: their
notifications are created settled as `Informational`, never pending. People are told, never
asked; their notifications are pending until they see them, whoever wrote. Only people can reply
through `ThreadMessageService` today, so agents' messages will come from their turns.

Missing, foreign, and outside-audience threads share `CoreError.NotFound`.
Ineligible mentions return `ThreadMessageService.ParticipantUnavailable`, and agent callers get
`CoreError.Denied` (`HumanRequired`). Admission, the message, its timeline activity, and
its notifications commit together; the timeline never has gaps or duplicate positions.

## Editing and deleting a message

`ThreadMessageService.edit({ messageId, text, mentions, expectedRevision })` replaces what a
message says. Only its author edits it, with `thread.publish` on the thread and membership of the
group; anyone else gets `CoreError.Denied` (`NotAuthor`), and to someone outside the group the
message is `CoreError.NotFound`, as a missing one is. Agents edit their own replies through their
turns, so an agent caller gets `CoreError.Denied` (`HumanRequired`). The text and mentions follow a reply's
rules. The same text and mentions again record nothing; otherwise `expectedRevision`, the revision
the editor last saw, must still be the message's: one edited meanwhile is `CoreError.Changed`, and nothing is
recorded. A deleted message is `Deleted`.

An edit records `thread.message.edited` with the next revision, the new text and mentions, and the
time, and a quiet `message.edited` activity whose occurrence is the message and revision, in one
commit. The projection replaces the message's `content`, so the timeline shows the publication with
the content as it is now, and clients collapse the edit into an edited mark. Members the edit newly
mentions join the thread and are told, under a reply's rules, and nobody else hears of it; an
ineligible mention is `ParticipantUnavailable`.

`ThreadMessageService.delete(messageId)` deletes a message: its own author's under
`thread.publish` on the thread, anyone's under `thread.moderate` on the thread's group, which the
built-in administrator and owner roles hold. It records `thread.message.deleted` and a quiet
`message.deleted` activity; the content becomes `{ _tag: "Deleted", deletedAt }`, the text is gone
from the row, and the message's place in the thread stays, since read positions, notifications,
and turns refer to sequences. No one is told, and one already deleted records nothing. A deleted
reply no longer counts among a thread's replies, and a deleted opening message leaves the thread
with its title alone.

## Retrying safely

Starts (`startInGroup` and `startDirect`) and replies take an optional second argument,
`{ requestKey }`. A client chooses a new key, such as a UUID, for each message it sends and repeats
it on every retry. A retry returns the thread or message the first attempt created and records
nothing more, including when the first attempt committed but its answer was lost. The key alone
names the request: sent again with different text or mentions, it still returns what the first
attempt created. A retry after an attempt that rolled back runs again. Keys belong to their member
and their operation, so another member's key, or the same key on a reply rather than a start, is a
separate request. Without a key, every call creates anew.

A keyed start derives its thread's and opening message's IDs from the operation, the author, and
the key (`Request.derivedId`), and a keyed reply derives its message's ID the same way, so a retry
finds what its first attempt created by those IDs and records no receipt. A retry passes the same
checks as the first attempt before it looks: for a start, group membership, `thread.start`, and a
human author, so an author who has since left the group receives `CoreError.NotFound`; for a reply,
access to the thread, `thread.publish`, and a human author.

## Following and unfollowing

`ThreadParticipationService.follow(threadId)` joins the acting human or agent and returns a
public `ThreadParticipation.Summary`. It requires active workspace and group membership and
`thread.follow` on the thread. A new follow records a quiet `participation.followed` timeline
activity at the next position, with no message and no notifications. Following while already
participating returns the existing summary and records nothing.

`unfollow({ threadId, participationId })` returns no value and ends only the actor's addressed
participation. It requires current workspace and group membership but no action grant, so a member
can unfollow after losing the follow permission. Other members' IDs, another thread's IDs, and
missing participations share `CoreError.NotFound`; one's own ended
participation returns `AlreadyEnded`. An inaccessible or missing thread returns
`CoreError.NotFound` for the thread. Everyone in a direct conversation takes part in
all of its threads, so unfollowing one returns `ThreadParticipationService.FixedParticipation`
and records nothing.

Unfollowing records a `participation.ended` activity with reason `unfollowed` and keeps the
participation's history. It is the only ending a thread records: leaving a group ends
participations without thread activity ([departure and pending input](#departure-and-pending-input)). Pending agent notifications for that participation are discarded in the same commit;
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
| `listOpenings(groupId, { limit, before? })`                                 | A page of `Thread.Opening` values, newest start first: each readable thread with its opening message, reply count, latest message, the caller's read position, and `unread`, as its group's stream shows it. |
| `readTimeline(threadId, { limit, afterSequence?, beforeSequence?, from? })` | An ascending sequence page of `Thread.TimelineItem` values with each activity's resolved subject, from the oldest or the newest end of the range.                                                            |
| `listParticipants(threadId, { limit, after? })`                             | A page of current `ThreadParticipation.Summary` values in participation-ID order, after the exclusive `after` participation ID.                                                                              |

`listInGroup` keeps reading until the page is full or the group has no older threads. Its
exclusive `before` cursor is the last item's latest activity time and thread ID. `listOpenings`
applies the same access and unread rules in start order, so a reply never moves a thread; its
`before` cursor is the last item's thread `createdAt` and ID. Its reply count is the thread's
messages after the opening one, and the opening message is read by reference, so a page makes a
fixed number of reads however many threads it holds. A thread is `unread` when its latest message
is past the caller's read position or, if never read, came after the caller joined the group.
Posting reads the thread through the author's own message.

A nonparticipant with group access and the grant can read the whole earlier conversation. Reading
creates no participation, acknowledges nothing, and requests no agent work. Later group members
can read earlier history without retroactive notifications.

Missing, foreign, and outside-audience threads share `CoreError.NotFound`, and an
inaccessible group's list returns it for the group. A member of the audience without
the grant receives `CoreError.Denied` (`NotGranted`) for a single thread; lists omit unreadable threads.
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

Every item's `activity` has the thread position, a dotted `kind` and the `version` of its details,
its `subject`, `newActivity`, and kind-specific `details`. Message items (`message.published`) contain `{ activity, message }`,
with `details: { messageId }`. Participation items (`participation.followed` and
`participation.ended`) contain `{ activity, participant }`, where `participant` is a public joining
summary, even for a participation that later ended, and `details` holds the `participationId`; an
ending adds its `reason`, at the activity's `occurredAt`: `unfollowed`, or, in history recorded
before departures stopped writing to threads, `group-left`, `group-removed`, or
`workspace-removed`. Use `activity.kind` to tell them
apart. Missing or inconsistent subjects, and kinds this host has no resolver for, fail the read
instead of producing partial pages. See [activity kinds](../packages/core/README.md#activity-kinds).

### Current participants

Summaries contain `id`, `workspaceId`, `threadId`, `participant`, `joinedAt`, and
`joinedAtSequence`. `participant` is a public member (`memberId`), contact (`contactId`), or triage
reference, without routing identities or admission links. A member appears only while their
participation, its group admission, and their workspace membership are all active; contacts and
triage need only an active participation. Rejoining a group under a new admission cannot make an
old participation current again. A page skips participants who are no longer current and keeps
reading until it holds `limit` of them or the thread has no more; an empty page ends the list.

## Reading the inbox

`NotificationService.inbox({ limit, before?, pendingOnly? })` lists the acting human or agent's
notifications newest first, by recorded time then ID in descending binary order, all of them or
only those still pending. `before` is the last listed `{ recordedAt, id }`, an exclusive boundary.
Each item carries its notification and, as `source`, the timeline item it points to while the
reader may still read it (see [notification sources](#notification-sources)). It requires active
membership only, lists nobody else's notifications, and changes nothing. `countPending` counts what
is still pending for the acting identity, from any source, including threads they can no longer
read.

## Seeing everything at once

`NotificationService.markSeenThrough({ recordedAt, id })` records `Seen` for every
notification still pending for the acting human up to and including that position in inbox
order, typically the newest one they are shown, so a notification that arrives meanwhile stays
pending. It marks them in batches of 100, each written as `markSeen` writes one and heard by
the person's other sessions as one `NotificationsSeen` signal, and returns how many it marked;
nothing left to mark returns zero. Batches are not one transaction: a failure keeps what earlier
batches marked, and a retry continues. A batch that a departure settles part of meanwhile is read
again without those, up to twice. Agents receive `CoreError.Denied` (`HumanRequired`).

## Notification sources

An inbox item's `source` is the `Thread.TimelineItem` its notification points to: the activity with
its message or participation summary, read under current group access and `thread.read` on the
source thread, as timeline reads do. The inbox lists only the reader's own notifications, so no
other recipient's source is ever read.

Owning a notification does not grant access to its source. Missing or unsupported sources, and
sources outside current access, leave the item without one. Unfollowing keeps group access, so
earlier sources stay readable with `thread.read`; leaving the group or losing the grant hides the
source, and readmission shows it again without reviving the old participation. Pending and
discarded agent notifications both show their source.

## Marking a notification seen

`NotificationService.markSeen(notificationId)` records that the acting human saw their
notification and returns the updated `Notification.Notification`. It requires active workspace
membership and ownership, but no action grant or thread access: a person can clear an old
notification after leaving its group or losing `thread.read`. It does not resolve the source,
rejoin participation, or mark the conversation read.

The state becomes `{ _tag: "Seen", seenAt }`. The notification stays in inbox history and leaves
pending results and counts. Repeating it returns the first time stored, including when two devices
mark it at once. Missing and other
recipients' IDs return `CoreError.NotFound`; an agent's notification returns
`CoreError.Denied` (`HumanRequired`), and a discarded one `AlreadyHandled`, including one that leaving its
group settles while it is being marked.

`Seen` is private state, like read positions: it is kept outside the journal, takes no place in the
workspace's write order, and survives rebuilding projections. It creates no activity or
notifications. The person's other connected sessions hear of it as a `NotificationsSeen`
[signal](../packages/core/README.md#signals). Handing work to an agent's turn, or a message to a
delivery, is recorded by those workflows as `Accepted`, not by marking it seen.

## Marking conversations read

`ReadStateService.markThreadRead({ threadId, throughSequence })` records that the acting
person has read a thread through a timeline position. It requires a human actor, current group
access, and `thread.read`: missing and inaccessible threads return
`CoreError.NotFound`, an agent returns `CoreError.Denied` (`HumanRequired`), and a position past the
latest activity returns `BeyondTimeline`. The position only moves forward. The reader's pending
notifications from the thread up to that position become `Seen` in the same write. Reading a timeline does not mark
it read; clients call this for what they have shown.

`markGroupRead({ groupId })` records that the acting person read a group now. It needs current
group membership and `group.read`, and returns `CoreError.NotFound` otherwise; the read time also only
moves forward.

Positions and read times are private state, like `Seen`: outside the journal, never waiting
for the workspace's conversation writes, and kept when projections are rebuilt. The person's other
sessions hear of each change as a `ThreadRead` or `GroupRead`
[signal](../packages/core/README.md#signals). Starting a thread or replying reads it through the
author's message in the same commit. [Thread lists](#reading-conversations) and
[group lists](group-workflows.md#reading-groups) report unread state from these records; only
messages count as new activity, not quiet participation changes.

## Typing

`ThreadMessageService.typing(threadId)`, and `POST /workspaces/:workspaceId/threads/:threadId/typing`
over HTTP, tells the thread's readers that the acting member is composing there. It needs the same
current group access and `thread.publish` as publishing, and returns `CoreError.NotFound`
for missing and inaccessible threads. The `Typing` [signal](../packages/core/README.md#signals) reaches the group's
members with `thread.read` for the thread, on every host, and lasts six seconds unless repeated;
repeats within two seconds are dropped. It is never stored.

## Departure and pending input

Each member participation belongs to the group admission that established it. Leaving or being
removed from the group, or from the workspace, is one `group.membership.removed` fact however many
threads the member took part in. Projections end every active participation under that admission
with it, at the departure's time, and record nothing in the threads: the departure is a group event,
seen in the group's roster. Already ended participations keep their history, and rejoining never
revives old work. Journals recorded before this also hold an ending activity per participation
after the departure; rebuilding reads them as already ended and reaches the same state.

Pending agent notifications from an ended participation become
`Discarded { reason: "participation-ended" }`, keeping their source, recipient, and time: an
unfollow's ending settles that participation's, and a departure settles all of the agent's from the
group. A person's notifications stay pending when they only unfollow a thread, since they can still
read it. Leaving or being removed from the group, or from the workspace, ends their access, so their
pending, unseen notifications from its threads become `Discarded { reason: "access-lost" }`: out of
the pending count and pending lists, kept in the full inbox as history. Ones already seen keep their
Seen. All of it shares the departure's commit, and rebuilding from the journal settles them the same
way, since the projections derive it from the recorded departure.

## Recorded history and delivery

A start records the thread, its initial participations, the message, and one `message.published`
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
reaches its human or agent recipient's membership in the same commit message, as their inbox
lists it, whether or not they may read the thread. Notifications carry source references, not continuing authority to
read the source.
