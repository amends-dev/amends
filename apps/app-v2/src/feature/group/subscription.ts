/**
 * The group, its admissions, and the person's follow of it, the workspace's members, what the
 * person may do, and who is present, read from their store as they change.
 */

import { GroupId } from "@amends-dev/core/group"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { GroupDefinition, Message } from "./definition.ts"

const workspace = ReplicaRecord.Place.cases.Workspace.make({})

export const subscriptions = GroupDefinition.subscriptions((entry) => ({
  group: entry(
    "ReadGroup",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, groupId: GroupId.GroupId },
    {
      messages: [Message.ReceivedGroup, Message.ReceivedMembers, Message.ReceivedGrants, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, groupId }) => ({ workspaceId, memberId, groupId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, groupId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(store.group(groupId), ({ group, memberships, follow }) =>
                  Message.ReceivedGroup({
                    group: Option.map(group, ({ record, pending }) => ({ group: record.value, pending })),
                    memberships: memberships.map(({ record, pending }) => ({ membership: record.value, pending })),
                    follow: Option.map(follow, ({ record, pending }) => ({ follow: record.value, pending }))
                  })
                ),
                Stream.merge(
                  Stream.map(store.list("Member", workspace), (members) =>
                    Message.ReceivedMembers({ members: members.map(({ record }) => record.value) })
                  ),
                  Stream.map(store.grants, (grants) => Message.ReceivedGrants({ grants }))
                )
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
