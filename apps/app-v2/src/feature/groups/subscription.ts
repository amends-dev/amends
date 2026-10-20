/**
 * The workspace's groups and members, the person's own admissions, and what they may do, read from their store as
 * they change, all of them together, so that the groups are read once each has been.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { GroupsDefinition, Message } from "./definition.ts"

export const subscriptions = GroupsDefinition.subscriptions((entry) => ({
  groups: entry(
    "ReadGroups",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, reads: Schema.Int },
    {
      messages: [Message.ReceivedGroups, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, reads }) => ({ workspaceId, memberId, reads }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.zipLatestAll(store.groups, store.members, store.every("GroupMembership"), store.grants).pipe(
                Stream.map(([groups, members, memberships, grants]) =>
                  Message.ReceivedGroups({
                    groups: groups.map(({ group: { record, pending }, members: count }) => ({
                      group: record.value,
                      pending,
                      members: count
                    })),
                    members,
                    memberships: memberships.flatMap(({ record }) =>
                      record.value.memberId === memberId && record.value.status === "active" ? [record.value] : []
                    ),
                    grants
                  })
                )
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
