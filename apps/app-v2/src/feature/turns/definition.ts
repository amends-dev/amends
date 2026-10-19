/**
 * A thread's agents' turns, as the person sees them: oldest first, each with its agent by name and
 * how it stands, which they stop while it runs, run again when nothing but who may direct its agent
 * keeps it from running again, and whose log they follow while online.
 */

import { Grant } from "@amends-dev/core/authorization"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadId } from "@amends-dev/core/thread"
import { Turn, TurnId } from "@amends-dev/core/turn"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

/** A turn, whether a change to it is on its way, and whether nothing but who may direct its agent keeps it from running again. */
export const TurnItem = Schema.Struct({ turn: ReplicaRecord.Turn, pending: Schema.Boolean, retryOpen: Schema.Boolean })
export type TurnItem = typeof TurnItem.Type

/** How following a turn's log stands: opening, following as the turn writes it, ended with the turn, or failed, with why. */
export const LogState = defineTaggedUnion({
  Opening: {},
  Following: {},
  Ended: {},
  Failed: { error: Schema.String }
})
export type LogState = typeof LogState.Type

/** The turn whose log the person follows, the log's items so far, and how following it stands. */
export const TurnLog = Schema.Struct({ turnId: TurnId.TurnId, items: Schema.Array(Turn.LogItem), state: LogState })
export type TurnLog = typeof TurnLog.Type

/**
 * The thread's turns, oldest first, the workspace's members, who name their agents, what the person
 * may do, the log they follow, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  threadId: ThreadId.ThreadId,
  turns: Schema.Array(TurnItem),
  members: Schema.Array(Member.Member),
  grants: Schema.Array(Grant.Grant),
  log: Schema.Option(TurnLog),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedTurns: { turns: Schema.Array(TurnItem) },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  ReceivedGrants: { grants: Schema.Array(Grant.Grant) },
  ReceivedLog: { turnId: TurnId.TurnId, logMessage: Turn.LogMessage },
  FailedRead: { error: Schema.String },
  FailedFollowLog: { turnId: TurnId.TurnId, error: Schema.String },
  ClickedStop: { turnId: TurnId.TurnId },
  ClickedRunAgain: { turnId: TurnId.TurnId },
  ClickedShowLog: { turnId: TurnId.TurnId },
  ClickedHideLog: {},
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const TurnsDefinition = Block.makeDefinition("Turns", { Model, Message })

/** Whether the person may direct the agent of `turn`: stopping its turns and running them again both need it. */
export const directs = (model: Model, turn: ReplicaRecord.Turn): boolean =>
  Grant.anyCovers(model.grants, Turn.directRequirement(turn))

/**
 * The turn whose log is being followed: while it is opening or following, so that following it
 * again after it ended or failed starts anew.
 */
export const followed = (model: Model): Option.Option<TurnId.TurnId> =>
  Option.flatMap(model.log, ({ turnId, state }) =>
    LogState.isAnyOf(["Opening", "Following"])(state) ? Option.some(turnId) : Option.none()
  )
