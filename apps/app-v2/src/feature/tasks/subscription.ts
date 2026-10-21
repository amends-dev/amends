/** The workspace's tasks, and the people that name them, read from the person's store as they change. */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { Message, TasksDefinition } from "./definition.ts"

export const subscriptions = TasksDefinition.subscriptions((entry) => ({
  tasks: entry(
    "ReadTasks",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
    {
      messages: [Message.ReceivedTasks, Message.ReceivedMembers, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId }) => ({ workspaceId, memberId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(store.tasks, (items) => Message.ReceivedTasks({ items })),
                Stream.map(store.people, ({ members }) => Message.ReceivedMembers({ members }))
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
