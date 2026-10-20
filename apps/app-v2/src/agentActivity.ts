/**
 * What an agent is doing, read from its turns: each turn it has under way, in what state and in which group, and, of
 * those, the agent's own activity: its most pressing state and each place it is at work. An agent with no turn under
 * way is idle. The agents list, the sidebar, and an agent's page show it.
 */

import type { Group } from "@amends-dev/core/group"
import type { Identity } from "@amends-dev/core/identity"
import type { ReplicaRecord } from "@amends-dev/core/replica"
import type { Turn, TurnId } from "@amends-dev/core/turn"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import type { LogoMotion } from "@amends-dev/design/logo"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import { placeName } from "./seen.ts"

/** A turn as the workspace's store holds it. */
export type StoredTurn = ReplicaRecord.Turn

/** Where a turn under way stands: waiting to start, working, or stopping as asked. */
export type ActivityState = "queued" | "working" | "stopping"

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

/** A state in a word, such as "Working". */
export const stateWord: Readonly<Record<ActivityState, string>> = {
  queued: "Queued",
  working: "Working",
  stopping: "Stopping"
}

/** How the logo moves for a state: the thread drawn through while it waits, the stitches lit at work, the patch tugged. */
export const motionOfState: Readonly<Record<ActivityState, LogoMotion>> = {
  queued: "thread",
  working: "working",
  stopping: "tug"
}

/** A turn under way: which, in what state, and where, by the group's name once the store holds the group. */
export type TurnUnderWay = Readonly<{ turnId: TurnId.TurnId; state: ActivityState; place: Option.Option<string> }>

/** What an agent is doing: its most pressing state, and each place it is at work, once. */
export type AgentActivity = Readonly<{ state: ActivityState; places: ReadonlyArray<string> }>

/** A stored turn that is under way, and the state it is in. */
type StoredTurnUnderWay = Readonly<{ turn: StoredTurn; state: ActivityState }>

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
  turns: ReadonlyArray<StoredTurn>,
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

/** Where an agent is at work, as a line: "#general", or "#general + 1 more". */
export const placesLine = (places: ReadonlyArray<string>): string =>
  places.length > 1 ? `${places[0]} + ${places.length - 1} more` : (places[0] ?? "")

/** What an agent is doing in words, as its mark says it: "Working in #general", or only "Working" while no place is read. */
export const activityLabel = ({ state, places }: AgentActivity): string =>
  places.length === 0 ? stateWord[state] : `${stateWord[state]} in ${placesLine(places)}`

/** What a turn under way is doing in words, as the agent's page lists it: "Queued in #design". */
export const turnLabel = ({ state, place }: TurnUnderWay): string =>
  Option.match(place, { onNone: () => stateWord[state], onSome: (place) => `${stateWord[state]} in ${place}` })
