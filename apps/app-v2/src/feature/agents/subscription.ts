/**
 * The workspace's agents and the members they are, its connections, roles, and workspace, and what
 * the person may do, and the turns under way and the groups they are in, read from their store as they change.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { activityStateOf } from "../../data/agents.ts"
import type * as Pending from "../../store/Pending.ts"
import type * as Replica from "../../store/Replica.ts"
import * as Store from "../../store/Store.ts"
import * as Stores from "../../store/Stores.ts"
import { AgentsDefinition, Message } from "./definition.ts"

/** The agents as `store` holds them, each time any of what they are read from changes. */
export const readAgents = (store: Store.Store["Service"]) =>
  Stream.zipLatestAll(
    store.list("Agent", Store.workspacePlace),
    store.members,
    store.list("Connection", Store.workspacePlace),
    store.list("Role", Store.workspacePlace),
    store.list("Workspace", Store.workspacePlace),
    store.grants
  ).pipe(
    Stream.map(([agents, members, connections, roles, workspaces, grants]) =>
      Message.ReceivedAgents({
        agents: agents.map(({ record, pending }) => ({ agent: record.value, pending })),
        members,
        connections: connections
          .filter(({ record }) => record.value.status === "active")
          .map(({ record, pending }) => ({ connection: record.value, pending })),
        roles: roles.map(({ record }) => record.value),
        workspace: Option.map(Array.head(workspaces), ({ record, pending }) => ({ workspace: record.value, pending })),
        grants
      })
    )
  )

/** What the Block is told of `turns` and `groups` as the store holds them: only the turns that are under way. */
export const receivedActivity = (
  turns: ReadonlyArray<Pending.Held<Replica.RecordOf<"Turn">>>,
  groups: ReadonlyArray<Pending.Held<Replica.RecordOf<"Group">>>
) =>
  Message.ReceivedActivity({
    turns: turns.map(({ record }) => record.value).filter(({ status }) => Option.isSome(activityStateOf(status))),
    groups: groups.map(({ record }) => record.value)
  })

/** The turns under way as `store` holds them, and the groups that name where, each time either changes. */
export const readActivity = (store: Store.Store["Service"]) =>
  Stream.zipLatestAll(store.every("Turn"), store.list("Group", Store.workspacePlace)).pipe(
    Stream.map(([turns, groups]) => receivedActivity(turns, groups))
  )

export const subscriptions = AgentsDefinition.makeSubscriptions((entry) => ({
  agents: entry(
    "ReadAgents",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, reads: Schema.Int },
    {
      messages: [Message.ReceivedAgents, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, reads }) => ({ workspaceId, memberId, reads }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, readAgents)
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  ),
  activity: entry(
    "ReadActivity",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, reads: Schema.Int },
    {
      messages: [Message.ReceivedActivity, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId, reads }) => ({ workspaceId, memberId, reads }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, readActivity)
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
