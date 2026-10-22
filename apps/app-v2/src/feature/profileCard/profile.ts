/** A member as their card shows them, from what the person's replica holds of the workspace. */

import type { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import type { ReplicaRecord } from "@amends-dev/core/replica"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import { type AgentItem, activityOfAgent, readinessOfAgent } from "../../data/agents.ts"
import type { MemberProfile } from "./definition.ts"

/** What the replica holds that the card reads a member from. */
export type Workspace = Readonly<{
  members: ReadonlyArray<Member.Member>
  agents: ReadonlyArray<AgentItem>
  turns: ReadonlyArray<ReplicaRecord.Turn>
  groups: ReadonlyArray<Group.Group>
}>

/** Read a member and their agent state; former members have no current readiness or activity. */
export const readProfile = (
  subject: string,
  self: MemberId.MemberId,
  workspace: Workspace
): Option.Option<MemberProfile> =>
  Option.map(Option.fromUndefinedOr(workspace.members.find(({ id }) => id === subject)), (member) => {
    const isFormer = member.status === "removed"
    const agentId = Identity.MemberReference.match(member.identity, {
      Human: () => Option.none(),
      Agent: ({ id }) => Option.some(id)
    })
    const stored = Option.flatMap(agentId, (id) =>
      Option.fromUndefinedOr(workspace.agents.find(({ agent }) => agent.id === id))
    )
    const activity = isFormer
      ? Option.none()
      : Option.flatMap(stored, (agent) => activityOfAgent({ ...workspace, memberId: self }, agent))
    const readiness = isFormer ? Option.none() : Option.flatMap(stored, readinessOfAgent)

    return {
      memberId: member.id,
      name: member.name,
      kind: Option.isSome(agentId) ? "Agent" : "Person",
      isYou: member.id === self,
      isFormer,
      agentId,
      readiness,
      activity
    }
  })
