import { Schema, Struct } from "effect";
import * as Agent from "../agent/agent.ts";
import * as GroupId from "../group/id.ts";
import * as Identity from "../identity/identity.ts";
import * as Notification from "../notification/notification.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as ThreadMessageId from "../thread/ThreadMessageId.ts";
import * as ThreadParticipationId from "../thread/ThreadParticipationId.ts";
import * as WorkspaceId from "../workspace/id.ts";
import * as MemberId from "../workspace/member/id.ts";
import * as TurnId from "./id.ts";

export const Id = TurnId.Id;
export type Id = TurnId.Id;

/**
 * Where a turn stands. `queued` holds accepted work until its job starts it; `running` is
 * running; `cancelling` asked to stop and has not yet been confirmed stopped. The rest are
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
 * Why a turn was asked to stop: someone asked, its agent stopped taking part in the thread, or the
 * thread's task was taken from the agent or stopped asking for work.
 */
export const CancelReason = Schema.Literals(["requested", "participation-ended", "task-changed"]);
export type CancelReason = typeof CancelReason.Type;

/** How a turn ended. */
export const Outcome = Schema.Literals(["completed", "failed", "cancelled"]);
export type Outcome = typeof Outcome.Type;

/** A failed or stopped turn that a turn runs again, and the member who asked. */
export const Retry = Schema.Struct({ of: Id, by: MemberId.Id });
export interface Retry extends Schema.Schema.Type<typeof Retry> {}

/**
 * One harness turn of an agent in a thread: it prompts the agent with the thread's messages its
 * session has not been given, through `acceptedThroughSequence`, and posts the agent's answer.
 * What the session was given before is its session log's to say, where the turn's own entries
 * follow `logAfter`.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  threadId: ThreadId.Id,
  agentId: Identity.AgentId,
  /** The agent's membership, whose permissions the turn acts with. */
  memberId: MemberId.Id,
  /** The participation the turn's input came through, whose session it continues. */
  participationId: ThreadParticipationId.Id,
  retry: Schema.NullOr(Retry),
  status: Status,
  /** The thread position the turn's input reaches: the work it accepted. */
  acceptedThroughSequence: Sequence,
  /**
   * Where the turn's entries begin in its participation's session log: after this position, which
   * was the log's latest when the turn was created, or 0 for an empty log.
   */
  logAfter: Sequence,
  /** What the turn runs on, recorded when it starts and kept when it runs again. */
  selection: Schema.NullOr(Agent.Selection),
  /** The agent's reply, once the turn posted it. */
  messageIds: Schema.Array(ThreadMessageId.Id),
  /** Why it failed. */
  failure: Schema.NullOr(Schema.String),
  /** Why it was asked to stop. */
  cancelReason: Schema.NullOr(CancelReason),
  createdAt: Schema.DateTimeUtcFromString,
  startedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  finishedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** The record with some fields changed. */
export const change = (record: Record, changes: Partial<Record>): Record =>
  Object.assign({}, record, changes);

/** A new turn, queued until its job starts it, which has run nothing and posted nothing yet. */
export const queued = (
  turn: Omit<
    Record,
    "status" | "selection" | "messageIds" | "failure" | "cancelReason" | "startedAt" | "finishedAt"
  >,
): Record => ({
  ...turn,
  status: "queued",
  selection: null,
  messageIds: [],
  failure: null,
  cancelReason: null,
  startedAt: null,
  finishedAt: null,
});

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
 * followed it. Both require directing its agent. Where its log begins is for following it alone.
 */
export const View = Schema.Struct({
  ...Struct.omit(Record.fields, ["logAfter"]),
  stoppable: Schema.Boolean,
  retryable: Schema.Boolean,
});
export interface View extends Schema.Schema.Type<typeof View> {}

/**
 * More of a response a turn is writing, before it completes: `text` continues the response's part
 * at `offset` characters. The turn's job shows drafts to those following the turn's log, and the
 * completed response in the log replaces them.
 */
export const Draft = Schema.Struct({
  responseId: Schema.NonEmptyString,
  /** The part's position among the step's parts, as the session log records the step. */
  part: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  text: Schema.String,
});
export interface Draft extends Schema.Schema.Type<typeof Draft> {}

/**
 * One entry of a turn's log as its thread's readers see it: the facts of its work, never private
 * reasoning. The agent was prompted with the thread's messages; a step of the turn wrote text,
 * verbatim, and is the reply when it answered the prompt rather than calling tools; or the turn's
 * run stopped short, and it ran again from its prompt.
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
    reply: Schema.Boolean,
  },
  Interrupted: {
    at: Schema.DateTimeUtcFromString,
    reason: Schema.String,
    retryable: Schema.Boolean,
  },
});
export type LogItem = typeof LogItem.Type;

/** An item of a turn's log at its place among the items: new there, or replacing what was. */
export const LogChange = Schema.Struct({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  item: LogItem,
});
export interface LogChange extends Schema.Schema.Type<typeof LogChange> {}

/**
 * What following a turn's log delivers, as the log grows. `Opened` starts every subscription with
 * the items as they stand. `Changed` carries the items later entries added, each at its index.
 * `Drafted` carries more of the step being written before it finishes, at `offset` characters
 * into its part; a reader that misses some waits for the step. `Ended` follows the turn's end,
 * once every item is delivered, and the stream closes.
 */
export const LogMessage = Schema.TaggedUnion({
  Opened: { items: Schema.Array(LogItem) },
  Changed: { changes: Schema.Array(LogChange) },
  Drafted: Draft.fields,
  Ended: {},
}).annotate({ identifier: "TurnLogMessage" });
export type LogMessage = typeof LogMessage.Type;

/** Following the log stopped short; the reader follows it again from the start. */
export class LogUnavailable extends Schema.TaggedError<LogUnavailable>()(
  "Turn.LogUnavailable",
  {},
) {}
