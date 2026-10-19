/** Making a thread a task, and changing the task, each an action written to the person's store. */

import { Task } from "@amends-dev/core/task"
import { ThreadId } from "@amends-dev/core/thread"
import * as Layer from "effect/Layer"
import * as Stores from "../../store/Stores.ts"
import { Message, TaskDefinition } from "./definition.ts"

const written = [Message.WroteAction, Message.FailedWriteAction]

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Make `threadId` a task. */
export const CreateTask = TaskDefinition.command("CreateTask", {
  args: { ...Stores.AsMember, threadId: ThreadId.ThreadId },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ threadId, ...member }) => write(member, (store) => store.write("TaskCreated", { threadId }))
  }
})

/** Change the task `threadId` tracks in one way, from the value the person saw. */
export const UpdateTask = TaskDefinition.command("UpdateTask", {
  args: { ...Stores.AsMember, threadId: ThreadId.ThreadId, change: Task.Change },
  messages: written,
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ threadId, change, ...member }) =>
      write(member, (store) => store.write("TaskUpdated", { threadId, change }))
  }
})

export const EffectsLayer = Layer.mergeAll(CreateTask.layer, UpdateTask.layer)
