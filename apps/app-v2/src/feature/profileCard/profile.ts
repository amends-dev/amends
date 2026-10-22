/** A member as their card shows them, from what the person's replica holds of the workspace. */

import type { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import type { ReplicaRecord } from "@amends-dev/core/replica"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import type { Profile } from "@amends-dev/design/profile"
import * as Option from "effect/Option"
import { activityOf, turnsUnderWay } from "../../data/agents.ts"
import { initials } from "../../seen.ts"
import { motionOfState, statusOfAgent } from "../../view/agents.ts"
import type { MemberProfile } from "./definition.ts"

/** An agent of the workspace, and whether a change to it is on its way. */
type StoredAgent = Readonly<{ agent: ReplicaRecord.Agent; pending: boolean }>

/** What the replica holds that the card reads a member from. */
export type Workspace = Readonly<{
  members: ReadonlyArray<Member.Member>
  agents: ReadonlyArray<StoredAgent>
  turns: ReadonlyArray<ReplicaRecord.Turn>
  groups: ReadonlyArray<Group.Group>
}>

/**
 * What an agent is doing, from its turns under way: nothing while it is idle, and nothing while a change to it is on
 * its way, since the server has not yet told how ready it is.
 */
const activityOfStored = ({ agent, pending }: StoredAgent, workspace: Workspace, self: MemberId.MemberId) =>
  pending
    ? Option.none()
    : activityOf(turnsUnderWay(agent.id, workspace.turns, workspace.groups, workspace.members, self))

/**
 * The member `subject` as the card shows them to the person `self`, or none when the workspace has no such member. An
 * agent that is still there stands as its mark says, "Needs setup" or at work, and its logo moves while it is; a member
 * who left stands as no one.
 */
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
      : Option.flatMap(stored, (agent) => activityOfStored(agent, workspace, self))
    const status = isFormer
      ? undefined
      : Option.getOrUndefined(Option.map(stored, (agent) => statusOfAgent(agent, activity)))

    return {
      memberId: member.id,
      name: member.name,
      kind: Option.isSome(agentId) ? "Agent" : "Person",
      isYou: member.id === self,
      isFormer,
      agentId,
      standing: Option.map(Option.fromUndefinedOr(status), ({ kind, label, detail }) => ({
        kind,
        label,
        detail: Option.fromUndefinedOr(detail)
      })),
      motion: Option.map(activity, ({ state }) => motionOfState[state])
    }
  })

/** The member as the design draws their card: the letters of their name on the ground of what they are. */
export const shownProfile = (profile: MemberProfile): Profile => ({
  name: profile.name,
  mark: { text: initials(profile.name), tone: profile.kind === "Agent" ? "lilac" : "slate" },
  kind: profile.kind,
  isYou: profile.isYou,
  isFormer: profile.isFormer,
  status: Option.getOrUndefined(
    Option.map(profile.standing, ({ kind, label, detail }) => ({
      kind,
      label,
      ...Option.match(detail, { onNone: () => ({}), onSome: (reason) => ({ detail: reason }) })
    }))
  ),
  motion: Option.getOrUndefined(profile.motion)
})
