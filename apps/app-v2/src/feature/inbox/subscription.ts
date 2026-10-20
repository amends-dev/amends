/**
 * The person's notifications, with the threads and messages they are about, and the groups and
 * people that name them, read from their store as they change, and again each time the person asks to try again.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { InboxDefinition, Message } from "./definition.ts"

export const subscriptions = InboxDefinition.subscriptions((entry) => ({
  inbox: entry(
    "ReadInbox",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, reads: Schema.Int },
    {
      messages: [Message.ReceivedInbox, Message.ReceivedGroups, Message.ReceivedPeople, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, reads }) => ({ workspaceId, memberId, reads }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(store.inbox, (entries) =>
                  Message.ReceivedInbox({
                    items: entries.map(({ notification, thread, opening, message }) => ({
                      notification: notification.record.value,
                      thread,
                      opening,
                      message
                    }))
                  })
                ),
                Stream.merge(
                  Stream.map(store.list("Group", Store.workspacePlace), (groups) =>
                    Message.ReceivedGroups({ groups: groups.map(({ record }) => record.value) })
                  ),
                  Stream.map(store.people, (people) => Message.ReceivedPeople(people))
                )
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
