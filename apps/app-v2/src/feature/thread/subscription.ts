/** The thread, who could have written in it, and who is present, read from the person's store as they change. */

import { ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { Message, ThreadDefinition } from "./definition.ts"

export const subscriptions = ThreadDefinition.subscriptions((entry) => ({
  thread: entry(
    "ReadThread",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, threadId: ThreadId.ThreadId },
    {
      messages: [Message.ReceivedThread, Message.ReceivedPeople, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, threadId }) => ({ workspaceId, memberId, threadId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, threadId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(
                  store.thread(threadId),
                  ({ thread, messages, participation, participationChanges, latest, readThrough }) =>
                    Message.ReceivedThread({
                      title: Option.flatMap(thread, ({ record }) => Option.fromNullOr(record.value.title)),
                      messages: messages.map(({ record, pending }) => ({ message: record.value, pending })),
                      following: Option.map(participation, ({ record, pending }) => ({
                        participationId: record.value.id,
                        active: record.value.status === "active",
                        pending
                      })),
                      changes: participationChanges,
                      latest,
                      readThrough
                    })
                ),
                Stream.map(store.people, (people) => Message.ReceivedPeople(people))
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  ),
  presence: entry(
    "WatchPresence",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
    {
      messages: [Message.ReceivedPresence],
      modelToDependencies: ({ workspaceId, memberId }) => ({ workspaceId, memberId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.map(store.present, (present) => Message.ReceivedPresence({ present }))
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.ReceivedPresence({ present: [] }))))
      }
    }
  )
}))
