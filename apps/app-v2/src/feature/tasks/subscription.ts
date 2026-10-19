/** The workspace's tasks, and the people that name them, read from the person's store as they change. */

import { ReplicaRecord } from "@amends-dev/core/replica"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { Message, TasksDefinition } from "./definition.ts"

const workspace = ReplicaRecord.Place.cases.Workspace.make({})

export const subscriptions = TasksDefinition.subscriptions((entry) => ({
  tasks: entry(
    "ReadTasks",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
    {
      messages: [Message.ReceivedTasks, Message.ReceivedPeople, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId }) => ({ workspaceId, memberId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(store.tasks, (items) => Message.ReceivedTasks({ items })),
                Stream.map(
                  Stream.zipLatest(store.list("Member", workspace), store.list("Contact", workspace)),
                  ([members, contacts]) =>
                    Message.ReceivedPeople({
                      members: members.map(({ record }) => record.value),
                      contacts: contacts.map(({ record }) => record.value)
                    })
                )
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
