/**
 * The thread's task and group, what the person may do, and the group's members, read from the
 * person's store as they change.
 */

import { GroupId } from "@amends-dev/core/group"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Stores from "../../store/Stores.ts"
import { Message, TaskDefinition } from "./definition.ts"

const workspace = ReplicaRecord.Place.cases.Workspace.make({})

export const subscriptions = TaskDefinition.subscriptions((entry) => ({
  task: entry(
    "ReadTask",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, threadId: ThreadId.ThreadId },
    {
      messages: [Message.ReceivedTask, Message.ReceivedGrants, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, threadId }) => ({ workspaceId, memberId, threadId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, threadId }) =>
          stores
            .read(workspaceId, memberId, (store) =>
              Stream.merge(
                Stream.map(store.thread(threadId), ({ thread, task }) =>
                  Message.ReceivedTask({
                    groupId: Option.map(thread, ({ record }) => record.value.groupId),
                    task: Option.map(task, ({ record, pending }) => ({ task: record.value, pending }))
                  })
                ),
                Stream.map(store.grants, (grants) => Message.ReceivedGrants({ grants }))
              )
            )
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  ),
  // The group's active members, once the thread's group is known: a team's admitted, a conversation's fixed.
  members: entry(
    "ReadMembers",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, groupId: Schema.NullOr(GroupId.GroupId) },
    {
      messages: [Message.ReceivedMembers],
      modelToDependencies: ({ workspaceId, memberId, groupId }) => ({
        workspaceId,
        memberId,
        groupId: Option.getOrNull(groupId)
      }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId, groupId }) =>
          groupId === null
            ? Stream.empty
            : stores
                .read(workspaceId, memberId, (store) =>
                  Stream.map(
                    Stream.zipLatest(store.group(groupId), store.list("Member", workspace)),
                    ([{ group, memberships }, members]) => {
                      const admitted: ReadonlyArray<MemberId.MemberId> = Option.match(group, {
                        onNone: () => [],
                        onSome: ({ record }) =>
                          record.value.kind === "Direct"
                            ? record.value.memberIds
                            : memberships.flatMap(({ record }) =>
                                record.value.status === "active" ? [record.value.memberId] : []
                              )
                      })
                      return Message.ReceivedMembers({
                        members: members.flatMap(({ record }) =>
                          record.value.status === "active" && admitted.includes(record.value.id) ? [record.value] : []
                        )
                      })
                    }
                  )
                )
                .pipe(Stream.catchCause(() => Stream.make(Message.ReceivedMembers({ members: [] }))))
      }
    }
  )
}))
