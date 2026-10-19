/**
 * The workspace's agents and the members they are, its connections, roles, and workspace, and what
 * the person may do, read from their store as they change.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
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

export const subscriptions = AgentsDefinition.subscriptions((entry) => ({
  agents: entry(
    "ReadAgents",
    { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
    {
      messages: [Message.ReceivedAgents, Message.FailedRead],
      modelToDependencies: ({ workspaceId, memberId }) => ({ workspaceId, memberId }),
      handler: function* () {
        const stores = yield* Stores.Stores
        return ({ workspaceId, memberId }) =>
          stores
            .read(workspaceId, memberId, readAgents)
            .pipe(Stream.catchCause(() => Stream.make(Message.FailedRead({ error: Stores.unreadable }))))
      }
    }
  )
}))
