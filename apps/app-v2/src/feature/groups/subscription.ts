/**
 * The workspace's groups and members, the person's own admissions, and what they may do, read from their store as
 * they change, all of them together, so that the groups are read once each has been; and, apart from those, what the
 * groups' rows say: which have activity the person has not read, how many notifications wait for them in each, and
 * which turns are under way, and how the agents stand, which the rows of conversations with an agent say.
 */

import type { ReplicaRecord } from "@amends-dev/core/replica"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { activityStateOf } from "../../agentActivity.ts"
import type * as Pending from "../../store/Pending.ts"
import type * as Replica from "../../store/Replica.ts"
import * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { GroupsDefinition, Message } from "./definition.ts"
import { countWaiting, findNewActivity } from "./signals.ts"

/** The records of `Kind` as the store holds them. */
type Held<Kind extends ReplicaRecord.Kind> = ReadonlyArray<Pending.Held<Replica.RecordOf<Kind>>>

/** What the Block is told of the groups' signals from `records` as the store holds them: only the turns under way. */
export const receivedSignals = (
  memberId: MemberId.MemberId,
  records: Readonly<{
    reads: Held<"GroupRead">
    memberships: Held<"GroupMembership">
    threads: Held<"Thread">
    activities: Held<"ThreadActivity">
    notifications: Held<"Notification">
    turns: Held<"Turn">
    agents: Held<"Agent">
  }>
) =>
  Message.ReceivedSignals({
    newActivity: findNewActivity({
      memberId,
      memberships: records.memberships.map(({ record }) => record.value),
      reads: records.reads.map(({ record }) => record.value),
      threads: records.threads.map(({ record }) => record.value),
      activities: records.activities.map(({ record }) => record.value)
    }),
    waiting: countWaiting(
      memberId,
      records.notifications.map(({ record }) => record.value)
    ),
    turns: records.turns
      .map(({ record }) => record.value)
      .filter(({ status }) => Option.isSome(activityStateOf(status))),
    agents: records.agents.map(({ record, pending }) => ({ agent: record.value, pending }))
  })

/** The groups' signals as `store` holds the records they are read from, each time any of them changes. */
export const readSignals = (store: Store.Store["Service"], memberId: MemberId.MemberId) =>
  Stream.zipLatestAll(
    store.every("GroupRead"),
    store.every("GroupMembership"),
    store.every("Thread"),
    store.every("ThreadActivity"),
    store.every("Notification"),
    store.every("Turn"),
    store.list("Agent", Store.workspacePlace)
  ).pipe(
    Stream.map(([reads, memberships, threads, activities, notifications, turns, agents]) =>
      receivedSignals(memberId, { reads, memberships, threads, activities, notifications, turns, agents })
    )
  )

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
  ),
  signals: entry(
    "ReadSignals",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, reads: Schema.Int },
    {
      messages: [Message.ReceivedSignals, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, reads }) => ({ workspaceId, memberId, reads }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, (store) => readSignals(store, memberId))
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
