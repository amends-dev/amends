/** Thread lists and details derived from replica records and pending actions. */

import type { GroupId } from "@amends-dev/core/group"
import { ReplicaRecord } from "@amends-dev/core/replica"
import type { Task } from "@amends-dev/core/task"
import { type ThreadId, type ThreadMessage, ThreadParticipation } from "@amends-dev/core/thread"
import type { MemberId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import { type AgentAtWork, agentsAtWork } from "../../data/agents.ts"
import { byPublished } from "../../data/messages.ts"
import {
  summarizeReplies,
  deriveLastActiveAt,
  deriveParticipationChanges,
  type ParticipationChange
} from "../../data/threads.ts"
import * as Pending from "../Pending.ts"
import type * as Replica from "../Replica.ts"
import { deriveTurns, type TurnView } from "./turns.ts"

/** How far the member has read a thread, from their positions in it; nothing read is 0. */
const readThroughOf = (positions: ReadonlyArray<Pending.Held<Replica.RecordOf<"ThreadPosition">>>) =>
  positions.reduce((through, { record }) => Math.max(through, record.value.readThrough), 0)

/**
 * A thread as its group lists it for the person: its opening message, its task, how many messages follow the
 * opening and who wrote them, which agents are at work in it, when it was last active, and how much they have not
 * read.
 */
export interface ThreadView {
  readonly thread: Pending.Held<Replica.RecordOf<"Thread">>
  readonly opening: Option.Option<ThreadMessage.ThreadMessage>
  readonly task: Option.Option<Task.Task>
  /** How many of its messages come after the opening. */
  readonly replies: number
  /** The authors of those replies, each once, in the order of their first reply. */
  readonly repliers: ReadonlyArray<ThreadMessage.Author>
  /** The agents with a turn under way in it. */
  readonly working: ReadonlyArray<AgentAtWork>
  /** When its latest message was published, or when it was created while it has none. */
  readonly lastActiveAt: DateTime.Utc
  /** Its activities that count as new, past the member's position. */
  readonly unread: number
}

/**
 * A thread as the person sees it open: the thread, while the replica holds it, its messages, oldest
 * first, their own part in it, the changes to who takes part in it, the sequence of its latest activity, how far they
 * have read it, the task it tracks, and its agents' turns, oldest first.
 */
export interface ThreadDetail {
  readonly thread: Option.Option<Pending.Held<Replica.RecordOf<"Thread">>>
  readonly messages: ReadonlyArray<Pending.Held<Replica.RecordOf<"ThreadMessage">>>
  readonly participation: Option.Option<Pending.Held<Replica.RecordOf<"ThreadParticipation">>>
  readonly participationChanges: ReadonlyArray<ParticipationChange>
  readonly latest: number
  readonly readThrough: number
  readonly task: Option.Option<Pending.Held<Replica.RecordOf<"Task">>>
  readonly turns: ReadonlyArray<TurnView>
}

/** The group's threads after pending actions, with their reply, task, activity, and unread summaries. */
export const deriveThreads = (
  groupId: GroupId.GroupId,
  threads: ReadonlyArray<Replica.ThreadRecords>,
  pending: ReadonlyArray<Pending.Unfinished>
): ReadonlyArray<ThreadView> =>
  Pending.overlay(
    "Thread",
    ReplicaRecord.Place.cases.Group.make({ groupId }),
    threads.map(({ thread }) => thread),
    pending
  ).map((thread): ThreadView => {
    const threadId = thread.record.value.id
    const place = ReplicaRecord.Place.cases.Thread.make({ threadId })
    const held = threads.find((records) => records.thread.value.id === threadId)
    const messages = Array.sort(
      Pending.overlay("ThreadMessage", place, held?.messages ?? [], pending).map(({ record }) => record.value),
      byPublished
    )
    const positions = Pending.overlay("ThreadPosition", place, held?.positions ?? [], pending)
    const readThrough = readThroughOf(positions)
    return {
      thread,
      opening: Array.head(messages),
      task: Option.map(
        Array.head(Pending.overlay("Task", place, held?.tasks ?? [], pending)),
        ({ record }) => record.value
      ),
      ...summarizeReplies(messages),
      working: agentsAtWork(
        Pending.overlay("Turn", place, held?.turns ?? [], pending).map(({ record }) => record.value)
      ),
      lastActiveAt: deriveLastActiveAt(thread.record.value, messages),
      unread: (held?.activities ?? []).filter(({ value }) => value.newActivity && value.sequence > readThrough).length
    }
  })

/** The open thread after pending actions, with its messages, participation, task, and turns. */
export const deriveThread = (
  threadId: ThreadId.ThreadId,
  selfId: MemberId.MemberId,
  contents: Replica.ThreadContents,
  pending: ReadonlyArray<Pending.Unfinished>
): ThreadDetail => {
  const place = ReplicaRecord.Place.cases.Thread.make({ threadId })
  const participations = Pending.overlay("ThreadParticipation", place, contents.participations, pending)
  return {
    // A thread the person started sits in its group among their unfinished actions.
    thread: Array.findFirst(
      Pending.overlay("Thread", undefined, Option.toArray(contents.thread), pending),
      ({ record }) => record.value.id === threadId
    ),
    messages: Array.sort(
      Pending.overlay("ThreadMessage", place, contents.messages, pending),
      Order.mapInput(byPublished, ({ record }: Pending.Held<Replica.RecordOf<"ThreadMessage">>) => record.value)
    ),
    participation: Array.findFirst(participations, ({ record }) =>
      ThreadParticipation.Participant.matchOrElse(
        record.value.participant,
        { Member: ({ memberId }) => memberId === selfId },
        () => false
      )
    ),
    participationChanges: deriveParticipationChanges(
      contents.activities.map(({ value }) => value),
      contents.participations.map(({ value }) => value)
    ),
    latest: contents.activities.reduce((latest, { value }) => Math.max(latest, value.sequence), 0),
    readThrough: readThroughOf(Pending.overlay("ThreadPosition", place, contents.positions, pending)),
    task: Array.head(Pending.overlay("Task", place, contents.tasks, pending)),
    turns: deriveTurns(
      Pending.overlay("Turn", place, contents.turns, pending),
      participations.map(({ record }) => record.value)
    )
  }
}
