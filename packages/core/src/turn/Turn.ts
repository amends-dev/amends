/**
 * A turn's record: one harness turn of one agent in one thread, with where it stands, the work it
 * accepted, what it runs on, and how it ended; the view a reader sees of it; and the items and
 * messages by which a reader follows its session log. `TurnStore`
 * keeps the record, `TurnExecution` and `TurnCommand` change it, and `TurnService` serves the
 * views and the log.
 *
 * @since 0.1.0
 */

import { Entry as LogEntry } from "@amends-dev/log"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"
import * as Agent from "../agent/Agent.ts"
import * as AgentPermissions from "../agent/AgentPermissions.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as GroupId from "../group/GroupId.ts"
import * as Identity from "../identity/Identity.ts"
import * as Request from "../request/Request.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadMessageId from "../thread/ThreadMessageId.ts"
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as TurnId from "./TurnId.ts"

/**
 * Where a turn stands. `queued` holds accepted work until its job starts it; `running` is
 * running; `cancelling` asked to stop and has not yet been confirmed stopped. The rest are
 * final: a finished turn never reopens.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Status = Schema.Literals(["queued", "running", "cancelling", "completed", "failed", "cancelled"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Status = typeof Status.Type

/**
 * Whether a turn in `status` is active: queued, running, or cancelling. An agent has at most one
 * active turn on each thread.
 *
 * @category predicates
 * @since 0.1.0
 */
export const active = (status: Status) => status === "queued" || status === "running" || status === "cancelling"

const Sequence = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/**
 * Why a turn was asked to stop: someone asked, its agent stopped taking part in the thread, or the
 * thread's task was taken from the agent or stopped asking for work.
 *
 * @category schemas
 * @since 0.1.0
 */
export const CancelReason = Schema.Literals(["requested", "participation-ended", "task-changed"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type CancelReason = typeof CancelReason.Type

/**
 * How a turn ended: its final status.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Outcome = Schema.Literals(["completed", "failed", "cancelled"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type Outcome = typeof Outcome.Type

/**
 * A failed or stopped turn that a turn runs again, and the member who asked.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Retry = Schema.Struct({ of: TurnId.TurnId, by: MemberId.MemberId })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Retry extends Schema.Schema.Type<typeof Retry> {}

/**
 * One harness turn of an agent in a thread: it prompts the agent with the thread's messages its
 * session has not been given, through `acceptedThroughSequence`, and posts the agent's answer.
 * What the session was given before is its session log's to say, where the turn's own entries
 * follow `logAfter`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Turn = Schema.Struct({
  id: TurnId.TurnId,
  workspaceId: WorkspaceId.WorkspaceId,
  groupId: GroupId.GroupId,
  threadId: ThreadId.ThreadId,
  agentId: Identity.AgentId,
  /** The agent's membership, whose permissions the turn acts with. */
  memberId: MemberId.MemberId,
  /** The participation the turn's input came through, whose session it continues. */
  participationId: ThreadParticipationId.ThreadParticipationId,
  retry: Schema.NullOr(Retry),
  status: Status,
  /** The thread position the turn's input reaches: the work it accepted. */
  acceptedThroughSequence: Sequence,
  /**
   * Where the turn's entries begin in its participation's session log: after this batch, which was
   * the log's latest when the turn was created, or null for an empty log.
   */
  logAfter: Schema.NullOr(LogEntry.Position),
  /** What the turn runs on, recorded when it starts and kept when it runs again. */
  selection: Schema.NullOr(Agent.Selection),
  /** The agent's reply, once the turn posted it. */
  messageIds: Schema.Array(ThreadMessageId.ThreadMessageId),
  /** Why it failed. */
  failure: Schema.NullOr(Schema.String),
  /** Why it was asked to stop. */
  cancelReason: Schema.NullOr(CancelReason),
  createdAt: Schema.DateTimeUtcFromString,
  startedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  finishedAt: Schema.NullOr(Schema.DateTimeUtcFromString)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Turn extends Schema.Schema.Type<typeof Turn> {}

/**
 * The record with `changes` applied, as a new record; the one given is left as it is.
 *
 * @category transforming
 * @since 0.1.0
 */
export const change = (record: Turn, changes: Partial<Turn>): Turn => Object.assign({}, record, changes)

/**
 * A new turn, queued until its job starts it, which has run nothing and posted nothing yet.
 *
 * @category constructors
 * @since 0.1.0
 */
export const queued = (
  turn: Omit<Turn, "status" | "selection" | "messageIds" | "failure" | "cancelReason" | "startedAt" | "finishedAt">
): Turn => ({
  ...turn,
  status: "queued",
  selection: null,
  messageIds: [],
  failure: null,
  cancelReason: null,
  startedAt: null,
  finishedAt: null
})

/**
 * Why a turn cannot be retried: it has not ended, it replied, a later one followed, or its agent
 * left.
 *
 * @category schemas
 * @since 0.1.0
 */
export const NotRetryableReason = Schema.Literals(["active", "completed", "superseded", "departed"])

/**
 * @category schemas
 * @since 0.1.0
 */
export type NotRetryableReason = typeof NotRetryableReason.Type

/**
 * A turn as a reader of its thread sees it, with what they may do with it now: ask it to stop,
 * while it is active and not already stopping, or retry it, once it failed or stopped and nothing
 * followed it. Both require directing its agent. Where its log begins is for following it alone.
 *
 * @category schemas
 * @since 0.1.0
 */
export const View = Schema.Struct({
  ...Struct.omit(Turn.fields, ["logAfter"]),
  stoppable: Schema.Boolean,
  retryable: Schema.Boolean
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface View extends Schema.Schema.Type<typeof View> {}

/**
 * What directing a turn's agent requires, which stopping and retrying the turn both need: using the
 * agent's membership.
 *
 * @category constructors
 * @since 0.1.0
 */
export const directRequirement = (turn: Turn): Requirement.Requirement =>
  Requirement.make(
    AgentPermissions.Use,
    Target.Reference.cases.Member.make({ workspaceId: turn.workspaceId, memberId: turn.memberId })
  )

/**
 * `turn` as a reader sees it, who may direct its agent or not, when nothing else keeps it from
 * running again or not.
 *
 * @category constructors
 * @since 0.1.0
 */
export const view = (turn: Turn, directs: boolean, retryOpen: boolean): View =>
  Object.assign({}, Struct.omit(turn, ["logAfter"]), {
    stoppable: directs && active(turn.status) && turn.status !== "cancelling",
    retryable: directs && retryOpen
  })

/**
 * One entry of a turn's log as its thread's readers see it: the facts of its work, never private
 * reasoning. The agent was prompted with the thread's messages; a step of the turn wrote text,
 * verbatim, and is the reply when it answered the prompt rather than calling tools; or the turn's
 * run stopped short, and it ran again from its prompt.
 *
 * @category schemas
 * @since 0.1.0
 */
export const LogItem = Schema.TaggedUnion({
  InputTaken: { at: Schema.DateTimeUtcFromString, messages: Schema.Int },
  Responded: {
    at: Schema.DateTimeUtcFromString,
    responseId: Schema.NonEmptyString,
    text: Schema.String,
    /** The step's parts the text holds, by position. */
    parts: Schema.Array(Schema.Int),
    /** The step answered the prompt: the turn posts its text as the reply when it closes. */
    reply: Schema.Boolean
  },
  Interrupted: {
    at: Schema.DateTimeUtcFromString,
    reason: Schema.String,
    retryable: Schema.Boolean
  }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type LogItem = typeof LogItem.Type

/**
 * An item of a turn's log at its place among the items: new there, or replacing what was.
 *
 * @category schemas
 * @since 0.1.0
 */
export const LogChange = Schema.Struct({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  item: LogItem
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface LogChange extends Schema.Schema.Type<typeof LogChange> {}

/**
 * What following a turn's log delivers, as the log grows. `Opened` starts every subscription with
 * the items as they stand. `Changed` carries the items later entries added, each at its index.
 * `Ended` follows the turn's end,
 * once every item is delivered, and the stream closes.
 *
 * @category schemas
 * @since 0.1.0
 */
export const LogMessage = Schema.TaggedUnion({
  Opened: { items: Schema.Array(LogItem) },
  Changed: { changes: Schema.Array(LogChange) },
  Ended: {}
}).annotate({ identifier: "TurnLogMessage" })

/**
 * @category schemas
 * @since 0.1.0
 */
export type LogMessage = typeof LogMessage.Type

/**
 * The ID of a turn a job accepts work into, as `Request.newId` gives it outside a request: new.
 *
 * @category constructors
 * @since 0.1.0
 */
export const newId = Effect.map(Request.newId("turn", []), (id) => TurnId.TurnId.make(id))

/**
 * The ID of the turn that retries `turnId`: derived from it, since a turn is retried at most once,
 * so asking again names the retry the first ask created.
 *
 * @category constructors
 * @since 0.1.0
 */
export const retryId = (workspaceId: WorkspaceId.WorkspaceId, turnId: TurnId.TurnId) =>
  Effect.map(Request.derivedId(["turn.retry", workspaceId, turnId]), (id) => TurnId.TurnId.make(id))
