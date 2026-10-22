/** Tasks joined with their threads, groups, and message activity. */

import type { Group } from "@amends-dev/core/group"
import type { Task } from "@amends-dev/core/task"
import type { Thread, ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import type * as DateTime from "effect/DateTime"
import type * as Option from "effect/Option"
import { placeName } from "../../data/groups.ts"
import { byPublished } from "../../data/messages.ts"
import { deriveLastActiveAt } from "../../data/threads.ts"
import type * as Pending from "../Pending.ts"
import type * as Replica from "../Replica.ts"

/**
 * A task as the workspace lists it: the task, the thread that tracks it with its opening message, the place its
 * group is, when the thread was last active, and whether it is still being started.
 */
export interface TaskView {
  readonly task: Task.Task
  readonly thread: Thread.Thread
  /** Where its group is as a line says it: a team as `#` and its name, or a conversation by the others in it. */
  readonly place: string
  readonly opening: Option.Option<ThreadMessage.ThreadMessage>
  /** When the thread's latest message was published, or when it was created while it has none. */
  readonly lastActiveAt: DateTime.Utc
  /** Whether the thread is still being started. */
  readonly pending: boolean
}

/** What the tasks of a workspace are made of, as the person's unfinished actions leave it. */
export interface TaskRecords {
  readonly memberId: MemberId.MemberId
  readonly tasks: ReadonlyArray<Task.Task>
  readonly threads: ReadonlyArray<Pending.Held<Replica.RecordOf<"Thread">>>
  readonly messages: ReadonlyArray<ThreadMessage.ThreadMessage>
  readonly groups: ReadonlyArray<Group.Group>
  readonly members: ReadonlyArray<Member.Member>
}

/** The messages of each thread among `messages`, oldest first. */
const messagesByThread = (
  messages: ReadonlyArray<ThreadMessage.ThreadMessage>
): ReadonlyMap<ThreadId.ThreadId, ReadonlyArray<ThreadMessage.ThreadMessage>> => {
  const byThread = new Map<ThreadId.ThreadId, Array<ThreadMessage.ThreadMessage>>()
  for (const message of Array.sort(messages, byPublished)) {
    const earlier = byThread.get(message.threadId)
    if (earlier === undefined) byThread.set(message.threadId, [message])
    else earlier.push(message)
  }
  return byThread
}

/**
 * The `tasks` in the order given, each with its thread, the place its group is as the person reads it among `members`,
 * and the summary of the thread's messages. A task whose thread or group the replica lacks is left out, since it could
 * not be opened.
 */
export const deriveTasks = ({
  memberId,
  tasks,
  threads,
  messages,
  groups,
  members
}: TaskRecords): ReadonlyArray<TaskView> => {
  const heldThreads = new Map(threads.map((held) => [held.record.value.id, held] as const))
  const knownGroups = new Map(groups.map((group) => [group.id, group] as const))
  const written = messagesByThread(messages)

  return tasks.flatMap((task): ReadonlyArray<TaskView> => {
    const held = heldThreads.get(task.threadId)
    const group = held === undefined ? undefined : knownGroups.get(held.record.value.groupId)
    if (held === undefined || group === undefined) return []
    const thread = held.record.value
    const threadMessages = written.get(thread.id) ?? []
    return [
      {
        task,
        thread,
        place: placeName(group, members, memberId),
        opening: Array.head(threadMessages),
        lastActiveAt: deriveLastActiveAt(thread, threadMessages),
        pending: held.pending
      }
    ]
  })
}
