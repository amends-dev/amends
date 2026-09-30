import { Schema } from "effect";
import { ConnectionId } from "../connection/id.ts";
import { EnvironmentId } from "../environment/id.ts";
import { GroupId } from "../group/id.ts";
import { Identity } from "../identity/identity.ts";
import { Log } from "../journal/log.ts";
import { Notification } from "../notification/notification.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadMessageId } from "../thread/message/id.ts";
import { ThreadParticipationId } from "../thread/participation/id.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { TurnId } from "./id.ts";

export const Id = TurnId.Id;
export type Id = TurnId.Id;

/**
 * Where an attempt stands. `queued` holds accepted work until execution takes it; `running` is
 * executing; `cancelling` asked to stop and has not yet been confirmed stopped. The rest are
 * final: a finished turn never reopens.
 */
export const Status = Schema.Literals([
  "queued",
  "running",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
]);
export type Status = typeof Status.Type;

/** An agent has at most one turn in these states on each thread. */
export const active = (status: Status) =>
  status === "queued" || status === "running" || status === "cancelling";

const Sequence = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * The model access and environment an attempt actually runs with, recorded when it starts; the
 * agent's configuration may change afterwards without changing what the attempt used.
 */
export const Selection = Schema.Struct({
  connectionId: ConnectionId.Id,
  model: Schema.NonEmptyString,
  reasoning: Schema.NullOr(Schema.NonEmptyString),
  environmentId: EnvironmentId.Id,
});
export interface Selection extends Schema.Schema.Type<typeof Selection> {}

/** Why a turn stopped short: execution failed, or its cancellation was requested. */
export const CancelReason = Schema.Literals(["requested", "participation-ended"]);
export type CancelReason = typeof CancelReason.Type;

/** How a turn ended. */
export const Outcome = Schema.Literals(["completed", "failed", "cancelled"]);
export type Outcome = typeof Outcome.Type;

/**
 * One agent's attempt on one thread. Input is tracked by thread timeline position: after
 * `inputAfterSequence` is this attempt's to handle, and through `acceptedThroughSequence` it has
 * accepted. How far the harness has taken that input in is its agent's log's to say.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  threadId: ThreadId.Id,
  agentId: Identity.AgentId,
  /** The agent's membership, whose permissions the attempt acts with. */
  memberId: MemberId.Id,
  /** The participation the attempt's input came through. */
  participationId: ThreadParticipationId.Id,
  /**
   * Where this turn's entries begin in the agent's log for the thread: after this position, or at
   * the start of an empty log. Fixed when the turn is created, since only one turn of an agent
   * writes there at a time.
   */
  logAfter: Schema.NullOr(Log.Position),
  /**
   * The latest checkpoint in that log when the turn was created, which its history starts from,
   * or none while the log had none. Fixed when the turn is created: reading on from it finds any
   * checkpoint the turn records itself.
   */
  historyFrom: Schema.NullOr(Log.Position),
  /** The failed or stopped turn this one runs again, whose work it continues from. */
  retryOf: Schema.NullOr(Id),
  status: Status,
  inputAfterSequence: Sequence,
  acceptedThroughSequence: Sequence,
  /** Recorded when execution starts. */
  selection: Schema.NullOr(Selection),
  /** The agent's replies this attempt published when it closed, in order. */
  messageIds: Schema.Array(ThreadMessageId.Id),
  /** Why it failed. */
  failure: Schema.NullOr(Schema.String),
  /** Why it was asked to stop. */
  cancelReason: Schema.NullOr(CancelReason),
  createdAt: Schema.DateTimeUtcFromString,
  startedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  finishedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
}).check(
  Schema.makeFilter(
    (record) =>
      record.inputAfterSequence <= record.acceptedThroughSequence ||
      "Input positions must be ordered, with accepted input at or after the boundary",
  ),
);
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** The record with some fields changed. */
export const change = (record: Record, changes: Partial<Record>): Record =>
  Object.assign({}, record, changes);

/** Accepting work: the notifications it settles, and how far the accepted input reaches. */
export const Acceptance = Schema.Struct({
  notificationIds: Schema.NonEmptyArray(Notification.Id),
  acceptedAt: Schema.DateTimeUtcFromString,
});
export interface Acceptance extends Schema.Schema.Type<typeof Acceptance> {}

/** Why a turn cannot be retried: it has not ended, it replied, a later one followed, or its agent left. */
export const NotRetryableReason = Schema.Literals([
  "active",
  "completed",
  "superseded",
  "departed",
]);
export type NotRetryableReason = typeof NotRetryableReason.Type;

/**
 * A turn as a reader of its thread sees it, with what they may do with it now: ask it to stop,
 * while it is active and not already stopping, or retry it, once it failed or stopped and nothing
 * followed it. Both require directing its agent.
 */
export const View = Schema.Struct({
  ...Record.fields,
  stoppable: Schema.Boolean,
  retryable: Schema.Boolean,
});
export interface View extends Schema.Schema.Type<typeof View> {}

/**
 * One entry of a turn's log as its thread's readers see it: the facts of its work, never private
 * reasoning or a harness's own data. The harness took in a batch of the thread's input; a response
 * wrote text, verbatim, from its text blocks completed so far, and is a reply when the turn owes it
 * to the thread; or execution stopped short and continues the same turn.
 */
export const LogItem = Schema.TaggedUnion({
  InputTaken: { at: Schema.DateTimeUtcFromString, messages: Schema.Int },
  Responded: {
    at: Schema.DateTimeUtcFromString,
    responseId: Schema.NonEmptyString,
    text: Schema.String,
    /** The response's text blocks the text holds, by position. */
    parts: Schema.Array(Schema.Int),
    /** The turn owes this response to the thread as a reply, and posts it when it closes. */
    reply: Schema.Boolean,
  },
  Interrupted: {
    at: Schema.DateTimeUtcFromString,
    reason: Schema.String,
    retryable: Schema.Boolean,
  },
});
export type LogItem = typeof LogItem.Type;

/** A turn with its log, oldest entry first. */
export const LogView = Schema.Struct({ turn: View, items: Schema.Array(LogItem) });
export interface LogView extends Schema.Schema.Type<typeof LogView> {}

/** An item of a turn's log at its place among the items: new there, or replacing what was. */
export const LogChange = Schema.Struct({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  item: LogItem,
});
export interface LogChange extends Schema.Schema.Type<typeof LogChange> {}

/**
 * What following a turn's log delivers, as its agent's log grows. `Opened` starts every
 * subscription with the items as they stand. `Changed` carries the items later entries added or
 * changed, each at its index: a response's text grows block by block, and whether it is a reply
 * can change as input follows it. `Drafted` carries more of the response being written before its
 * block completes, at `offset` characters into its part; a reader that misses some waits for the
 * block. `Ended` follows the turn's end, once every item is delivered, and the stream closes.
 */
export const LogMessage = Schema.TaggedUnion({
  Opened: { items: Schema.Array(LogItem) },
  Changed: { changes: Schema.Array(LogChange) },
  Drafted: {
    responseId: Schema.NonEmptyString,
    part: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    text: Schema.String,
  },
  Ended: {},
}).annotate({ identifier: "TurnLogMessage" });
export type LogMessage = typeof LogMessage.Type;

/** Following the log stopped short; the reader follows it again from the start. */
export class LogUnavailable extends Schema.TaggedError<LogUnavailable>()(
  "Turn.LogUnavailable",
  {},
) {}

export * as Turn from "./turn.ts";
