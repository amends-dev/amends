/** Shared agent records and activity derived from their turns. */

import type { Agent } from "@amends-dev/core/agent"
import type { Group, GroupId } from "@amends-dev/core/group"
import type { Identity } from "@amends-dev/core/identity"
import { ReplicaRecord } from "@amends-dev/core/replica"
import type { ThreadId } from "@amends-dev/core/thread"
import type { Turn, TurnId } from "@amends-dev/core/turn"
import { type Member, MemberId } from "@amends-dev/core/workspace"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { placeName } from "./groups.ts"

/** An agent of the workspace, and whether a change to it is on its way. Its name and role are its member's. */
export const AgentItem = Schema.Struct({ agent: ReplicaRecord.Agent, pending: Schema.Boolean })
export type AgentItem = typeof AgentItem.Type

/** Readiness reported by the server, unavailable while a local change is pending. */
export const readinessOfAgent = ({ agent, pending }: AgentItem): Option.Option<Agent.Readiness> =>
  pending ? Option.none() : Option.some(agent.readiness)

/** Where a turn under way stands: waiting to start, working, or stopping as asked. */
export const ActivityState = Schema.Literals(["queued", "working", "stopping"])
export type ActivityState = typeof ActivityState.Type

/** The states from the most pressing: a turn at work, one being stopped, one waiting. */
const mostPressingFirst: ReadonlyArray<ActivityState> = ["working", "stopping", "queued"]

/** The state of a turn in each status it is under way in; a turn that finished has none. */
const stateOfStatus: Readonly<Partial<Record<Turn.Status, ActivityState>>> = {
  queued: "queued",
  running: "working",
  cancelling: "stopping"
}

/** The state a turn in `status` is in while it is under way, none once it finished. */
export const activityStateOf = (status: Turn.Status): Option.Option<ActivityState> =>
  Option.fromUndefinedOr(stateOfStatus[status])

/**
 * A turn under way: which, in what state, and where: the thread it works in and its group, and the group's place once
 * the store holds the group.
 */
export type TurnUnderWay = Readonly<{
  turnId: TurnId.TurnId
  groupId: GroupId.GroupId
  threadId: ThreadId.ThreadId
  state: ActivityState
  place: Option.Option<string>
}>

/** An agent with a turn under way in one thread: whose membership it is, and what state its turn is in. */
export const AgentAtWork = Schema.Struct({ memberId: MemberId.MemberId, state: ActivityState })
export type AgentAtWork = typeof AgentAtWork.Type

/**
 * The agents with a turn under way in a thread, from the thread's `turns`: each by its membership and the state of
 * its turn, the oldest turn first. A thread has at most one under way for each agent.
 */
export const agentsAtWork = (turns: ReadonlyArray<ReplicaRecord.Turn>): ReadonlyArray<AgentAtWork> =>
  turns
    .toSorted(Order.mapInput(DateTime.Order, ({ createdAt }: ReplicaRecord.Turn) => createdAt))
    .flatMap(({ memberId, status }) =>
      Option.match(activityStateOf(status), {
        onNone: () => [],
        onSome: (state): ReadonlyArray<AgentAtWork> => [{ memberId, state }]
      })
    )

/** What an agent is doing: its most pressing state, and each place it is at work, once. */
export const AgentActivity = Schema.Struct({ state: ActivityState, places: Schema.Array(Schema.String) })
export type AgentActivity = typeof AgentActivity.Type

/** A stored turn that is under way, and the state it is in. */
type StoredTurnUnderWay = Readonly<{ turn: ReplicaRecord.Turn; state: ActivityState }>

const byPressing: Order.Order<StoredTurnUnderWay> = Order.combine(
  Order.mapInput(Order.Number, ({ state }: StoredTurnUnderWay) => mostPressingFirst.indexOf(state)),
  Order.mapInput(DateTime.Order, ({ turn }: StoredTurnUnderWay) => turn.createdAt)
)

/**
 * The turns of agent `agentId` that are under way, the most pressing first and, among those in the same state, the
 * oldest first, each in the place its group is named by among `groups`, as `self` reads it.
 */
export const turnsUnderWay = (
  agentId: Identity.AgentId,
  turns: ReadonlyArray<ReplicaRecord.Turn>,
  groups: ReadonlyArray<Group.Group>,
  members: ReadonlyArray<Member.Member>,
  self: MemberId.MemberId
): ReadonlyArray<TurnUnderWay> =>
  turns
    .filter((turn) => turn.agentId === agentId)
    .flatMap((turn) =>
      Option.match(activityStateOf(turn.status), {
        onNone: () => [],
        onSome: (state): ReadonlyArray<StoredTurnUnderWay> => [{ turn, state }]
      })
    )
    .toSorted(byPressing)
    .map(({ turn, state }) => ({
      turnId: turn.id,
      groupId: turn.groupId,
      threadId: turn.threadId,
      state,
      place: Option.map(Option.fromUndefinedOr(groups.find(({ id }) => id === turn.groupId)), (group) =>
        placeName(group, members, self)
      )
    }))

/**
 * What an agent is doing given its `turns` under way, most pressing first: the state of the first and each place any
 * of them is at work, once. Nothing for an agent with none, which is idle.
 */
export const activityOf = (turns: ReadonlyArray<TurnUnderWay>): Option.Option<AgentActivity> =>
  Option.map(Option.fromUndefinedOr(turns[0]), ({ state }) => ({
    state,
    places: [...new Set(turns.flatMap(({ place }) => Option.toArray(place)))]
  }))

/**
 * The most pressing state among the `turns` under way in the group `groupId`, whichever agent they are of: what the
 * group's row in the sidebar moves the logo as. None while no agent is at work there.
 */
export const stateInGroup = (
  turns: ReadonlyArray<ReplicaRecord.Turn>,
  groupId: GroupId.GroupId
): Option.Option<ActivityState> => {
  const statesHere = turns.flatMap((turn) =>
    turn.groupId === groupId ? Option.toArray(activityStateOf(turn.status)) : []
  )

  return Option.fromUndefinedOr(mostPressingFirst.find((state) => statesHere.includes(state)))
}

/** Records used to derive an agent's current work. */
export interface AgentActivitySource {
  readonly memberId: MemberId.MemberId
  readonly turns: ReadonlyArray<ReplicaRecord.Turn>
  readonly groups: ReadonlyArray<Group.Group>
  readonly members: ReadonlyArray<Member.Member>
}

/**
 * The turns of the agent that are under way, the most pressing first, each in the group it is in as the person names
 * it. An agent still on its way has none.
 */
export const turnsOfAgent = (source: AgentActivitySource, { agent, pending }: AgentItem) =>
  pending ? [] : turnsUnderWay(agent.id, source.turns, source.groups, source.members, source.memberId)

/** What the agent is doing, from its turns under way: nothing while it is idle. */
export const activityOfAgent = (source: AgentActivitySource, item: AgentItem): Option.Option<AgentActivity> =>
  activityOf(turnsOfAgent(source, item))
