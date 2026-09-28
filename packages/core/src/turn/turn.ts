import { Schema } from "effect";
import { ConnectionId } from "../connection/id.ts";
import { EnvironmentId } from "../environment/id.ts";
import { GroupId } from "../group/id.ts";
import { Identity } from "../identity/identity.ts";
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

/**
 * One agent's attempt on one thread. Input is tracked by thread timeline position: after
 * `inputAfterSequence` is this attempt's to handle, through `acceptedThroughSequence` it has
 * accepted, and through `incorporatedThroughSequence` the harness has confirmed taking in.
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
  status: Status,
  inputAfterSequence: Sequence,
  acceptedThroughSequence: Sequence,
  incorporatedThroughSequence: Sequence,
  /** Recorded when execution starts. */
  selection: Schema.NullOr(Selection),
  /** The agent's reply this attempt published, if it closed with one. */
  messageId: Schema.NullOr(ThreadMessageId.Id),
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
      (record.inputAfterSequence <= record.incorporatedThroughSequence &&
        record.incorporatedThroughSequence <= record.acceptedThroughSequence &&
        record.inputAfterSequence < record.acceptedThroughSequence) ||
      "Input positions must be ordered, with accepted input after the boundary",
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

export * as Turn from "./turn.ts";
