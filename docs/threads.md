# Threads

A thread is the one record of a conversation, of a task, and of a conversation that came through
a channel such as Slack or email. Everything else hangs off it by thread ID: participations,
messages, activities, turns, a task row, a channel binding. The thread row stays thin and has no
kind; what a thread is follows from which rows exist for it, and one thread can be both a task
and a channel conversation. This document fixes that model. It replaces the task and channel
sections of the [core model](core-model.md) where they differ, and it is implemented by changing
the current shapes, not by keeping them: facts take new versions, development databases are
reset, and nothing reads the old shapes.

The rules of the [core model](core-model.md) that this builds on: every thread is in exactly one
group, which is its audience; the timeline is an append-only, gap-free sequence of typed
activity; activity is the sole source of notifications, with recipients recorded as selected;
domain facts own state and activity owns position. None of that changes.

## The thread

| Field       | Holds                                                                             |
| ----------- | --------------------------------------------------------------------------------- |
| `id`        | Named by the caller, so a keyed start can name the same thread on a retry.        |
| `groupId`   | The group whose members may read it. Never changes.                               |
| `title`     | Its own text, or null. A trimmed line of at most 200 characters.                  |
| `origin`    | The thread this one was derived from, or null. Set at creation, never changed.    |
| `createdBy` | The author of its opening message: a member, or the contact a channel heard from. |
| `createdAt` |                                                                                   |

**Every thread opens with a message at sequence 1.** The create command takes that message and
the starting participants; whatever else the thread is created as, a task or a channel
conversation, is recorded in the same commit after it. There is no union of opening kinds. A
thread's description, when it has one, is its opening message, and there is no second copy of
that text anywhere.

**The title is independent of every message.** It is never derived at read time. When it is
null, readers show the opening message as the thread's preview, as the group stream does now. A
chat thread and a Slack conversation keep a null title; an email conversation takes its subject;
a task takes the title its creator typed, or none. Creating a task from a conversation may copy
the first line of the opening message into the title once, at creation. After that commit the two
texts have nothing to do with each other: editing the message never changes the title, and
renaming never changes the message.

Renaming publishes `thread.renamed` with the new title and the title the renamer last saw, as a
group rename does, so a concurrent rename is not silently replaced. The projection updates the
row; the same commit records a quiet `thread.renamed` activity. It needs `thread.rename` on the
thread.

The origin grants no access to either thread, and the originating thread may be in another
group. Derived threads are the way to split work out of a conversation: the new thread opens with
what its creator writes, in a group they can start threads in, and names where it came from.

## Messages

| Field         | Holds                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | Named by the caller, derived from the request key or the external message ID, so a retry names the same message.                                                          |
| `threadId`    |                                                                                                                                                                           |
| `author`      | A member or a contact.                                                                                                                                                    |
| `via`         | How it came about: `null` for a message written in amends, `Turn { turnId }` for an agent's reply, `Channel { channelId, externalMessageId }` for one a channel received. |
| `publishedAt` |                                                                                                                                                                           |
| `content`     | `Text { text, mentions, revision, editedAt }`, or `Deleted { deletedAt }`.                                                                                                |

The text is markdown as today, and the only copy of it in the read models. The journal entry
that recorded it and the session log of an agent that was told it keep their own copies by
design, as records of what was recorded and what was said.

**Editing** publishes `thread.message.edited` with the message, its next revision, the new text
and mentions, and the time. The projection replaces the content. The same commit records a
`message.edited` activity whose occurrence is the message and revision, so a retried edit records
once and two edits racing for the same revision conflict instead of both landing. The edit input
carries the revision the editor last saw. Timeline items show the current content because they
resolve the message by ID; clients collapse the edit activity into an "edited" mark. The change
feed carries the fact with the new text, so clients update in place.

**Deleting** publishes `thread.message.deleted`; the content becomes `Deleted` and the text is
gone from the row. The activity at the message's position stays, since participation joining
points, notification positions, read positions, and turns' accepted positions all refer to
sequences. The item shows a deleted message. Deleting the opening message leaves the thread with
no description; its preview falls back to the title, or to the deleted mark.

| Rule                          | Decision                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Who edits                     | The author, with `thread.publish`. Agents edit their own replies through their turns. Contacts' edits arrive through intake.                     |
| Who deletes                   | The author, or a member with `thread.moderate` on the thread's group.                                                                            |
| Recipients of an edit         | Members it newly mentions. On a task thread, an edit of the opening message is a requirement change and reaches every participant.               |
| Recipients of a deletion      | None.                                                                                                                                            |
| Unread                        | Edits and deletions are quiet; only publications are new activity.                                                                               |
| Reply count                   | The thread's messages after the opening one that are not deleted.                                                                                |
| What an agent is told         | A turn tells its agent of edits and deletions of messages it was already told, as it tells it of new messages. Session logs are never rewritten. |
| Triage as a message recipient | Messages never ask triage for anything; its notifications from them are informational.                                                           |

## Activity kinds

A kind definition gains a `version`, as a fact has one. The activity records its kind's version,
and reading an activity of another version is a mismatch, as decoding a fact of another version
is. A kind whose details change takes a new version; until the product ships, development
databases are reset rather than upgraded, as the [journal guide](journal.md) says of schemas.

Every kind, with the rules this document fixes. Occurrence "subject" means one activity of the
kind per subject; "none" means repeatable.

| Kind                     | Details                                                | Occurrence           | New activity | Recipients                                                                                                             |
| ------------------------ | ------------------------------------------------------ | -------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `message.published`      | message ID                                             | subject              | yes          | Mentioned members, or every participant but the author. A person's message asks agents for work; an agent's asks none. |
| `message.edited`         | message ID, revision                                   | message and revision | no           | Newly mentioned members; every participant for a task's opening message.                                               |
| `message.deleted`        | message ID                                             | subject              | no           | None.                                                                                                                  |
| `participation.followed` | participation ID                                       | subject              | no           | None.                                                                                                                  |
| `participation.ended`    | participation ID, reason                               | subject              | no           | None.                                                                                                                  |
| `thread.renamed`         | title, previous title                                  | none                 | no           | Every participant on a task thread; none otherwise.                                                                    |
| `turn.*`                 | As today.                                              | subject              | no           | None.                                                                                                                  |
| `task.created`           | status, priority, assignee, created by                 | subject (the thread) | no           | Triage when the status is triage; the assignee when set.                                                               |
| `task.updated`           | One change: status, assignee, or priority, from and to | none                 | no           | By change, below.                                                                                                      |

A requirement change on a task thread, its title or its opening message, asks the assignee for
work when the assignee is an agent, unless that agent's own turn made the change. Everyone else
is told.

## Tasks

A task is a row keyed by its thread, written by projections, holding current state only:

| Field       | Holds                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| `threadId`  | The key. A thread has at most one task, and a task has exactly one thread. |
| `groupId`   | Copied from the thread, for listing tasks by group.                        |
| `status`    | `triage`, `todo`, `doing`, `held`, `done`, or `dismissed`.                 |
| `priority`  | `none`, `low`, `medium`, `high`, or `urgent`.                              |
| `assignee`  | A member ID, or null. The group is the assignee pool.                      |
| `createdBy` | A member or a contact.                                                     |
| `createdAt` |                                                                            |

The title is the thread's title and the description is the thread's opening message, so a task
row holds no text. `task.created` records the row's initial values and `task.updated` records one
change with its previous and new value, which the activity's details carry, so a later change
cannot alter what an earlier item meant. The projection applies the change to the row.

A task comes about in three ways, all through the same two facts:

- **With its thread.** The creator writes the opening message and optionally a title, and the
  task is created at sequence 2 in the same commit, with `task.create` on the group.
- **From a conversation.** `task.created` is recorded at the thread's next sequence; the
  conversation's opening message becomes its description.
- **As a derived thread.** A new thread with an origin, opened by its creator, with the task at
  sequence 2.

Changes need `task.update` on the thread. Triage records its decisions as a job, as turn
execution does, without an actor. An assignee must be a participant: the change admits them at
its position, and they must hold a current group admission. Triage is admitted when a task enters
triage and stays.

| Change                                   | Recipients and effects                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Assignee set or changed                  | The new assignee is asked for work, whoever assigned. An unassigned agent's active turn on the thread is stopped. |
| Status to `triage`                       | Triage, which evaluates the workspace policy.                                                                     |
| Status to `todo` or `doing`              | Every participant; the assignee agent is asked for work, since this resumes it.                                   |
| Status to `held`, `done`, or `dismissed` | Every participant, informed. The assignee agent's active turn is stopped.                                         |
| Priority                                 | Every participant, informed.                                                                                      |

The change asks the turn to stop in its own commit, as a person's stop request does, and the
turn's job confirms it; the turn ends with the reason `task-changed`. `done` does not close the
thread; messages continue, and a later status change reopens the work.
A turn on a task thread is told the title and the task's state with its context, and task
changes as input, by the turn's prompt rules.

## Channels

A channel is a configured external communication point: a connection whose integration gives
channels, and one destination group. Its integration declares the channel contract as harness and
sandbox integrations declare theirs: how it receives events, how it posts a message as a reply
in an external conversation and what it returns, and whether it can edit or delete a posted
message. Changing a channel's destination affects new conversations only.

Three rows connect a thread to the outside:

| Row      | Key                                                       | Holds                                                                                                               |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| binding  | thread ID; unique on channel and external conversation    | channel ID, external conversation ID, the adapter's details such as a Slack channel and thread timestamp, bound at. |
| contact  | contact ID, derived from the channel and external user ID | channel ID, external user ID, display name. One person on two channels is two contacts; linking them is open.       |
| delivery | channel ID, external conversation ID, message ID          | status `requested`, `sent`, or `failed`; the external message ID returned; attempts and times.                      |

A binding is a fact with a projection and no activity, like thread creation. It is set when the
thread is created and never changes; a thread is bound to at most one external conversation.

**Intake** runs for each event the channel receives, with request keys derived from the event's
external ID, so a redelivered event is a retry:

1. Resolve the contact, creating it if new.
2. Find the binding for the external conversation. Without one, create the thread in the
   destination group: title from the event when it has one, such as an email subject; the
   contact as creator; the event's message as the opening message with `via: Channel`;
   participants the contact, the group's human followers, and triage when the channel opens
   tasks; the binding; and, when the channel opens tasks, `task.created` in `triage` at sequence 2.
   Agents that follow the destination group do not join; they come through triage, assignment, or
   a mention.
3. With a binding, publish the contact's message in the thread, readmitting the contact if their
   participation ended. Its recipients are the current participants, and it asks agents for work
   as any person's message does.
4. An edit or deletion event records `message.edited` or `message.deleted` as the contact.
5. An event whose sender is the channel's own identity, or whose external message ID matches a
   sent delivery, is an echo of our own post and is ignored.

**Delivery** mirrors the turn job: one job per bound thread, requested by a reaction to recorded
activity with contact recipients.

1. The job accepts: in one commit it reads the thread's pending contact notifications, creates a
   delivery for each distinct message they point to, and accepts them into it. A contact's
   notification is thereby `Accepted` by a delivery, as an agent's is by a turn: the state becomes
   `Accepted { by: Turn | Delivery, acceptedAt }`. Several contacts in one external conversation
   share one delivery.
2. It sends in sequence order through the channel's integration, as a reply in the bound
   conversation, and records `sent` with the external message ID, or `failed`. A message deleted
   before sending is not sent. Uncertain outcomes follow the core model's delivery rules.
3. Edits and deletions of a sent message are delivered when the integration can; otherwise they
   are not.

Members' and agents' messages are delivered. Contacts' are not, since they came from there.
Turn activity, task activity, and renames are never delivered.

## Reads

- A thread page reads the thread, its task, and its binding by key, then timeline and
  participant pages. Three key reads replace today's one.
- A group stream reads openings as today and the page's task rows in one batched read, to show
  status and assignee. Its preview is the title when present, else the opening message.
- Task views read the task table by group and status, or by assignee and status, then the threads
  by ID.
- The inbox is unchanged: every new kind has a resolver, so every notification has a source item.

## Code conventions

The thread feature, and the task and channel features built on it, are written as the published
packages are, `@amends-dev/harness` and `@amends-dev/sandbox`, which follow the Effect repository:
they are read by developers outside this repository, and documentation is generated from them.

- **One module per namespace, named after it.** `ThreadMessageService.ts` exports
  `ThreadMessageService`, flat in the feature directory, as `effect/ai` is flat. Helpers no
  consumer imports go in `internal/`. The barrel, `index.ts`, documents each export. A module does
  not re-export itself: the barrel exports it with `export * as`, and modules import one another
  with `import * as`, so a module's class can carry its name.
- **A header on every module**: a paragraph saying what the module is for and how it relates to its
  neighbours, then `@since`.
- **`@category` and `@since` on every export**, with a sentence or more on what it is, except a
  type that twins a schema, which carries only the tags. A service is a class named after its
  module, `ThreadStore.ThreadStore`, with its methods documented one by one in its shape. The categories are `schemas`, `options` for operation inputs and options,
  `models` for types that are not schemas, `errors`, `services`, `constructors`, `layers`,
  `utils`, `facts`, `projections`, `permissions`, and `kinds` for activity kinds.
- **Examples** where a reader would otherwise have to find a caller: `**Example** (Title)` and a
  ```ts block, formatted at the repository's print width, verified by extraction as
  [publishing](publishing.md) describes.
  ```
- **One word per concept, no stray comments.** A comment inside a body says why, never what. A
  service key names its module: `@amends-dev/core/thread/ThreadStore`.
- `@since` is `0.1.0`, the version core will first be published at.

The rest of core follows when touched. [Core's guide](../packages/core/README.md) records the
convention beside its schema vocabulary.

## What changes

In core:

0. The thread feature takes the layout and documentation above, with no change of behavior: a
   move and a documentation pass, checked by core's tests and every dependent's typecheck.
1. `Thread.Record` and `thread.created` gain `title` and `origin`; the fact takes version 2.
   `thread.renamed` fact, projection, activity kind, and `thread.rename` permission.
2. The opening union in the thread command is removed; `create` takes the opening message.
3. `ThreadMessage.Record` takes `via` and `content`; the message store gains an update for edits
   and deletions and a reply count; `thread.message.edited` and `thread.message.deleted` facts,
   projections, kinds, and operations; `thread.moderate` permission.
4. `ThreadActivityKind` gains `version`, recorded on the activity.
5. A task feature: record, store, facts, kinds, resolver, timeline items, operations, permissions,
   and the turn-stopping reactions.
6. A channel feature: channel, binding, contact, and delivery records and stores; their facts; the
   intake operation; the delivery job in cluster; the channel capability and contract in
   `connection`.
7. `Notification.State.Accepted` names what accepted it: a turn or a delivery.
8. Turn prompts tell edits, deletions, and task changes; a turn on a task thread is told the
   title and state.

Then both storage adapters and the conformance suites, the HTTP contract and handlers, the
client and UI, and the guides: [core model](core-model.md), [thread workflows](thread-workflows.md),
[turns](turns.md), and [known limitations](current-status.md).
