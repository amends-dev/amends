import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadMessage } from "@amends-dev/core/thread"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stores from "../../store/Stores.ts"
import { Message, ThreadsDefinition } from "./definition.ts"

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Start a thread in `groupId` with `text` as its opening message, and its task, started as `task`, when it has one. */
export const StartThread = ThreadsDefinition.command("StartThread", {
  args: { ...Stores.AsMember, groupId: GroupId.GroupId, text: Schema.String, task: Schema.Option(Task.Options) },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  handler: function* () {
    const write = Stores.writer(yield* Stores.Stores, Message.WroteAction(), failed)
    return ({ groupId, text, task, ...member }) =>
      Stores.decoded(
        Thread.StartInGroupInput,
        {
          groupId,
          text,
          mentions: ThreadMessage.mentionedIn(text),
          ...(Option.isSome(task) ? { task: task.value } : {})
        },
        failed("A thread needs an opening message.")
      ).pipe(
        Effect.flatMap((input) => write(member, (store) => store.write("ThreadStarted", input))),
        Effect.catch(Effect.succeed)
      )
  }
})
