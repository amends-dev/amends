/**
 * The facts recorded about turns: a turn's creation or retry, its start, a request that it stop,
 * and how it ended. `TurnProjection` folds them into `TurnStore`, and `TurnJobs` reacts to those
 * that change an agent's work. Every fact names the turn's thread and group, whose members may
 * learn of it, and its agent's membership. The facts that end a turn are published only through
 * `TurnCommand.endTurn`, in the commit that records `turn.ended` in the thread's timeline.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Agent from "../agent/Agent.ts";
import * as Group from "../group/Group.ts";
import * as GroupId from "../group/GroupId.ts";
import * as Fact from "../journal/Fact.ts";
import * as Subject from "../journal/Subject.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as ThreadMessageId from "../thread/ThreadMessageId.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as Turn from "./Turn.ts";

/**
 * Every fact names the turn's thread and group, which the group's members may learn of, and its
 * agent's membership, whose work it changes.
 */
const Where = {
  workspaceId: WorkspaceId.Id,
  groupId: GroupId.Id,
  threadId: ThreadId.Id,
  memberId: MemberId.Id,
};
const audience = (payload: { readonly groupId: GroupId.Id }) => [Group.audienceOf(payload.groupId)];
const subject = (payload: { readonly turnId: Turn.Id }) => Subject.make("turn", payload.turnId);

/**
 * An agent accepted work into a new turn, settling the notifications that asked for it. The
 * payload is the turn's record with the notifications it settled.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("turn.created", {
  version: 1,
  audience,
  subject: (payload) => Subject.make("turn", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct({
    ...Turn.Turn.fields,
    notificationIds: Turn.Acceptance.fields.notificationIds,
  }),
});

/**
 * Someone asked a failed or stopped turn to run again: a new turn for the same agent and input,
 * on what the agent is set up with now, continuing the session the turn it retries left.
 *
 * @category facts
 * @since 0.1.0
 */
export const Retried = Fact.make("turn.retried", {
  version: 1,
  audience,
  subject: (payload) => Subject.make("turn", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct(Turn.Turn.fields),
});

/**
 * The turn's job started it, with the harness, model, and sandbox it runs on.
 *
 * @category facts
 * @since 0.1.0
 */
export const Started = Fact.make("turn.started", {
  version: 1,
  audience,
  subject,
  occurrence: (payload) => [payload.turnId],
  payload: Schema.Struct({
    ...Where,
    turnId: Turn.Id,
    selection: Agent.Selection,
    startedAt: Schema.DateTimeUtcFromString,
  }),
});

/**
 * Someone asked the turn to stop, or its agent stopped taking part; stopping is confirmed later,
 * by `Cancelled`, except for a queued turn, which `TurnCommand.requestStop` ends at once.
 *
 * @category facts
 * @since 0.1.0
 */
export const CancelRequested = Fact.make("turn.cancel-requested", {
  version: 1,
  audience,
  subject,
  occurrence: (payload) => [payload.turnId],
  payload: Schema.Struct({
    ...Where,
    turnId: Turn.Id,
    reason: Turn.CancelReason,
    requestedAt: Schema.DateTimeUtcFromString,
  }),
});

/**
 * The turn finished its work, with the reply it posted, if it had one.
 *
 * @category facts
 * @since 0.1.0
 */
export const Completed = Fact.make("turn.completed", {
  version: 1,
  audience,
  subject,
  occurrence: (payload) => [payload.turnId],
  payload: Schema.Struct({
    ...Where,
    turnId: Turn.Id,
    messageIds: Schema.Array(ThreadMessageId.Id),
    finishedAt: Schema.DateTimeUtcFromString,
  }),
});

/**
 * The turn could not continue, for the reason recorded.
 *
 * @category facts
 * @since 0.1.0
 */
export const Failed = Fact.make("turn.failed", {
  version: 1,
  audience,
  subject,
  occurrence: (payload) => [payload.turnId],
  payload: Schema.Struct({
    ...Where,
    turnId: Turn.Id,
    reason: Schema.NonEmptyString,
    finishedAt: Schema.DateTimeUtcFromString,
  }),
});

/**
 * The turn stopped, as it was asked to or because its agent no longer takes part where it worked;
 * its accepted input stays for a later turn.
 *
 * @category facts
 * @since 0.1.0
 */
export const Cancelled = Fact.make("turn.cancelled", {
  version: 1,
  audience,
  subject,
  occurrence: (payload) => [payload.turnId],
  payload: Schema.Struct({
    ...Where,
    turnId: Turn.Id,
    cancelReason: Turn.CancelReason,
    finishedAt: Schema.DateTimeUtcFromString,
  }),
});
