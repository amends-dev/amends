/** A group's threads, read from the person's store as they change, and again each time the person asks to try again. */

import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { Message, ThreadsDefinition } from "./definition.ts"

export const subscriptions = ThreadsDefinition.subscriptions((entry) => ({
  threads: entry(
    "ReadThreads",
    {
      workspaceId: WorkspaceId.WorkspaceId,
      memberId: MemberId.MemberId,
      groupId: GroupId.GroupId,
      reads: Schema.Int
    },
    {
      messages: [Message.ReceivedThreads, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, groupId, reads }) => ({ workspaceId, memberId, groupId, reads }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, groupId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.map(store.threads(groupId), (threads) =>
                Message.ReceivedThreads({
                  threads: threads.map(
                    ({ thread, opening, task, replies, repliers, working, lastActiveAt, unread }) => ({
                      thread: thread.record.value,
                      opening,
                      task,
                      replies,
                      repliers,
                      working,
                      lastActiveAt,
                      pending: thread.pending,
                      unread
                    })
                  )
                })
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
