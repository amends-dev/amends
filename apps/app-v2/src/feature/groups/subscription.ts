/** The workspace's groups and members, read from the person's store as they change. */

import { Group } from "@amends-dev/core/group"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as Order from "effect/Order"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { type GroupItem, GroupsDefinition, Message } from "./definition.ts"

const workspace = ReplicaRecord.Place.cases.Workspace.make({})

/** General first, then by name; conversations by their members' IDs. */
const byName = Order.mapInput(Order.String, ({ group }: GroupItem) =>
  Group.isGeneral(group) ? "" : "name" in group ? group.name : group.memberIds.join(", ")
)

export const subscriptions = GroupsDefinition.subscriptions((entry) => ({
  groups: entry(
    "ReadGroups",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
    {
      messages: [Message.ReceivedGroups, Message.ReceivedMembers, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId }) => ({ workspaceId, memberId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(store.list("Group", workspace), (groups) =>
                  Message.ReceivedGroups({
                    groups: Array.sort(
                      groups.map(({ record, pending }) => ({ group: record.value, pending })),
                      byName
                    )
                  })
                ),
                Stream.map(store.list("Member", workspace), (members) =>
                  Message.ReceivedMembers({ members: members.map(({ record }) => record.value) })
                )
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
