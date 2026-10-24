import { GroupId } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadMessage } from "@amends-dev/core/thread"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Dom from "foldkit/dom"
import { followEnd, scrollToEnd } from "../../control/conversationScroll.ts"
import * as Drafts from "../../store/Drafts.ts"
import * as Stores from "../../store/Stores.ts"
import { boxId } from "../composer/definition.ts"
import { threadsListId, Message, ThreadsDefinition } from "./definition.ts"

/** Why `error` kept the action from being written, as the person reads it. */
const failed = (error: string) => Message.FailedWriteAction({ error })

/** Move focus to the composer of `groupId`, such as to write the task that New task asks for. */
export const FocusComposer = ThreadsDefinition.makeCommand("FocusComposer", {
  args: { groupId: GroupId.GroupId },
  messages: [Message.CompletedFocusComposer],
  handler: function* () {
    return ({ groupId }) =>
      Dom.focus(`#${CSS.escape(boxId(Drafts.Place.cases.Thread.make({ groupId })))}`).pipe(
        Effect.ignore,
        Effect.as(Message.CompletedFocusComposer())
      )
  }
})

/**
 * Scroll the threads of `groupId` to their end once they are drawn, so that they open there; or, with `onlyIfNearEnd`,
 * only if the person was near their end, so that what is added stays in view while they are there and leaves them
 * where they scrolled to when they are not.
 */
export const ScrollThreadsToEnd = ThreadsDefinition.makeCommand("ScrollThreadsToEnd", {
  args: { groupId: GroupId.GroupId, onlyIfNearEnd: Schema.Boolean },
  messages: [Message.CompletedScrollThreadsToEnd],
  handler: function* () {
    return ({ groupId, onlyIfNearEnd }) =>
      (onlyIfNearEnd
        ? followEnd(threadsListId(groupId))
        : scrollToEnd(threadsListId(groupId), { unlessCurrent: false })
      ).pipe(Effect.as(Message.CompletedScrollThreadsToEnd()))
  }
})

/** Start a thread in `groupId` with `text` as its opening message, and its task, started as `task`, when it has one. */
export const StartThread = ThreadsDefinition.makeCommand("StartThread", {
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
