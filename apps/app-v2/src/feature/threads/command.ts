import { GroupId } from "@amends-dev/core/group"
import { Thread } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stores from "../../store/Stores.ts"
import { Message, ThreadsDefinition } from "./definition.ts"

/** Start a thread in `groupId` with `text` as its opening message. */
export const StartThread = ThreadsDefinition.command("StartThread", {
  args: {
    workspaceId: WorkspaceId.WorkspaceId,
    memberId: MemberId.MemberId,
    groupId: GroupId.GroupId,
    text: Schema.String
  },
  messages: [Message.WroteAction, Message.FailedWriteAction],
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ workspaceId, memberId, groupId, text }) =>
      Schema.decodeEffect(Thread.StartInGroupInput)({ groupId, text, mentions: [] }).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.succeed(Message.FailedWriteAction({ error: "A thread needs an opening message." })),
          onSuccess: (input) =>
            stores
              .write(workspaceId, memberId, (store) => store.write("ThreadStarted", input))
              .pipe(
                Effect.as(Message.WroteAction()),
                Effect.catchCause(() => Effect.succeed(Message.FailedWriteAction({ error: Stores.unwritable })))
              )
        })
      )
  }
})
