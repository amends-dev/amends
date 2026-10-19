/**
 * The workspace's groups and members, the person's own admissions, and what they may do, read from
 * their store as they change.
 */

import { Group } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as Order from "effect/Order"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { type GroupItem, GroupsDefinition, Message } from "./definition.ts"

/** General first, then by name; conversations by their members' IDs. */
const byName = Order.mapInput(Order.String, ({ group }: GroupItem) =>
  Group.isGeneral(group) ? "" : "name" in group ? group.name : group.memberIds.join(", ")
)

export const subscriptions = GroupsDefinition.subscriptions((entry) => ({
  groups: entry(
    "ReadGroups",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
    {
      messages: [
        Message.ReceivedGroups,
        Message.ReceivedMembers,
        Message.ReceivedMemberships,
        Message.ReceivedGrants,
        Message.FailedRead
      ],
      modelToDependencies: ({ workspaceId, memberId }) => ({ workspaceId, memberId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.merge(
                  Stream.map(store.groups, (groups) =>
                    Message.ReceivedGroups({
                      groups: Array.sort(
                        groups.map(({ group: { record, pending }, members }) => ({
                          group: record.value,
                          pending,
                          members
                        })),
                        byName
                      )
                    })
                  ),
                  Stream.map(store.members, (members) => Message.ReceivedMembers({ members }))
                ),
                Stream.merge(
                  Stream.map(store.every("GroupMembership"), (memberships) =>
                    Message.ReceivedMemberships({
                      memberships: memberships.flatMap(({ record }) =>
                        record.value.memberId === memberId && record.value.status === "active" ? [record.value] : []
                      )
                    })
                  ),
                  Stream.map(store.grants, (grants) => Message.ReceivedGrants({ grants }))
                )
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
