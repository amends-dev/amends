/**
 * A thread's agents' turns, as the person sees them where each took on the work: how it stands, which they stop while
 * it runs, retry when nothing but who may direct its agent keeps it from running again, and whose log they follow
 * while online, which the side pane shows in place of the thread. It reports when the person goes back to the thread
 * from the log, when they close it, which leaves the thread too, and when they ask for the settings of the agent whose
 * turn failed.
 */

import { Grant } from "@amends-dev/core/authorization"
import { Identity } from "@amends-dev/core/identity"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadId } from "@amends-dev/core/thread"
import { Turn, TurnId } from "@amends-dev/core/turn"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { Refusal } from "./problem.ts"

/**
 * A turn, whether a change to it is on its way, and whether nothing but who may direct its agent keeps it from
 * running again.
 */
export const TurnItem = Schema.Struct({ turn: ReplicaRecord.Turn, pending: Schema.Boolean, retryOpen: Schema.Boolean })
export type TurnItem = typeof TurnItem.Type

/**
 * How following a turn's log stands: opening, following as the turn writes it, ended with the turn, out of reach, or
 * failed, with why.
 */
export const LogState = defineTaggedUnion({
  Opening: {},
  Following: {},
  Ended: {},
  Unavailable: {},
  Failed: { error: Schema.String }
})
export type LogState = typeof LogState.Type

/**
 * The turn whose log the person follows, the log's items so far, how following it stands, and whether it grew while
 * the person was not at its end.
 */
export const TurnLog = Schema.Struct({
  turnId: TurnId.TurnId,
  items: Schema.Array(Turn.LogItem),
  state: LogState,
  hasNewActivity: Schema.Boolean
})
export type TurnLog = typeof TurnLog.Type

/**
 * The thread's turns, oldest first, the workspace's members, who name their agents, its connections, which name what a
 * turn ran on, what the person may do, the log they follow, the stops and retries the server refused, the one the
 * browser could not keep, and why the last read failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  threadId: ThreadId.ThreadId,
  turns: Schema.Array(TurnItem),
  members: Schema.Array(Member.Member),
  connections: Schema.Array(ReplicaRecord.Connection),
  grants: Schema.Array(Grant.Grant),
  log: Schema.Option(TurnLog),
  refused: Schema.Array(Refusal),
  unkept: Schema.Option(Refusal),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedTurns: { turns: Schema.Array(TurnItem) },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  ReceivedConnections: { connections: Schema.Array(ReplicaRecord.Connection) },
  ReceivedGrants: { grants: Schema.Array(Grant.Grant) },
  ReceivedRefusals: { refusals: Schema.Array(Refusal) },
  ReceivedLog: { turnId: TurnId.TurnId, logMessage: Turn.LogMessage },
  FailedRead: { error: Schema.String },
  FoundLogUnavailable: { turnId: TurnId.TurnId },
  FailedFollowLog: { turnId: TurnId.TurnId, error: Schema.String },
  ClickedStop: { turnId: TurnId.TurnId },
  ClickedRetry: { turnId: TurnId.TurnId },
  ClickedViewLog: { turnId: TurnId.TurnId },
  ClickedBackToThread: {},
  ClickedViewReply: {},
  ClickedCloseLog: {},
  ClickedAgentSettings: { agentId: Identity.AgentId },
  ClickedJumpToLatest: {},
  CompletedScrollLogToEnd: {},
  FollowedLogEnd: {},
  LeftLogBehind: {},
  WroteAction: {},
  FailedStop: { turnId: TurnId.TurnId },
  FailedRetry: { turnId: TurnId.TurnId }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  ReturnedToThread: {},
  ClosedLog: {},
  OpenedAgent: { agentId: Identity.AgentId }
})
export type OutMessage = typeof OutMessage.Type

export const TurnsDefinition = Block.makeDefinition("Turns", { Model, Message, OutMessage })

/** The turn `turnId`, while the thread has it. */
export const findTurn = (model: Model, turnId: TurnId.TurnId): Option.Option<TurnItem> =>
  Option.fromUndefinedOr(model.turns.find(({ turn }) => turn.id === turnId))

/** Whether the person may direct the agent of `turn`: stopping its turns and retrying them both need it. */
export const directs = (model: Model, turn: ReplicaRecord.Turn): boolean =>
  Grant.anyCovers(model.grants, Turn.directRequirement(turn))

/**
 * Why the last stop or retry of `turnId` did not go through: what the browser could not keep, else what the server
 * refused.
 */
export const problemOf = (model: Model, turnId: TurnId.TurnId): Option.Option<Refusal["problem"]> =>
  Option.orElse(
    Option.filter(model.unkept, (unkept) => unkept.turnId === turnId),
    () => Option.fromUndefinedOr(model.refused.find((refusal) => refusal.turnId === turnId))
  ).pipe(Option.map(({ problem }) => problem))

/**
 * The turn whose log is being followed: while it is opening or following, so that following it
 * again after it ended or failed starts anew.
 */
export const followed = (model: Model): Option.Option<TurnId.TurnId> =>
  Option.flatMap(model.log, ({ turnId, state }) =>
    LogState.isAnyOf(["Opening", "Following"])(state) ? Option.some(turnId) : Option.none()
  )

/** The `id` of the list of the activity of the log of `turnId`, which the scroll that keeps it at its end finds. */
export const logListId = (turnId: TurnId.TurnId): string => `turn-log-${turnId}`
