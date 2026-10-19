/**
 * The workspace's channels, connections, and groups, the person's admissions to them, the members
 * that name their conversations, and what the person may do, read from their store as they change.
 */

import { ReplicaRecord } from "@amends-dev/core/replica"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { ChannelsDefinition, Message } from "./definition.ts"

const workspace = ReplicaRecord.Place.cases.Workspace.make({})

export const subscriptions = ChannelsDefinition.subscriptions((entry) => ({
  channels: entry(
    "ReadChannels",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
    {
      messages: [
        Message.ReceivedChannels,
        Message.ReceivedConnections,
        Message.ReceivedGroups,
        Message.ReceivedMemberships,
        Message.ReceivedMembers,
        Message.ReceivedGrants,
        Message.FailedRead
      ],
      modelToDependencies: ({ workspaceId, memberId }) => ({ workspaceId, memberId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.map(store.list("Channel", workspace), (channels) =>
                Message.ReceivedChannels({
                  channels: channels
                    .filter(({ record }) => record.value.status === "active")
                    .map(({ record, pending }) => ({ channel: record.value, pending }))
                })
              ).pipe(
                Stream.merge(
                  Stream.map(store.list("Connection", workspace), (connections) =>
                    Message.ReceivedConnections({
                      connections: connections
                        .filter(({ record }) => record.value.status === "active")
                        .map(({ record, pending }) => ({ connection: record.value, pending }))
                    })
                  )
                ),
                Stream.merge(
                  Stream.map(store.list("Group", workspace), (groups) =>
                    Message.ReceivedGroups({ groups: groups.map(({ record }) => record.value) })
                  )
                ),
                Stream.merge(
                  Stream.map(store.every("GroupMembership"), (memberships) =>
                    Message.ReceivedMemberships({
                      memberships: memberships.flatMap(({ record }) =>
                        record.value.memberId === memberId && record.value.status === "active" ? [record.value] : []
                      )
                    })
                  )
                ),
                Stream.merge(
                  Stream.map(store.list("Member", workspace), (members) =>
                    Message.ReceivedMembers({ members: members.map(({ record }) => record.value) })
                  )
                ),
                Stream.merge(Stream.map(store.grants, (grants) => Message.ReceivedGrants({ grants })))
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
