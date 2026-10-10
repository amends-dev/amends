import { Schema } from "effect";
import { Agent } from "../agent/agent.ts";
import { Group } from "../group/group.ts";
import { GroupId } from "../group/id.ts";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { ThreadMessageId } from "../thread/ThreadMessageId.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { Turn } from "./turn.ts";

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

/** An agent accepted work into a new turn, settling the notifications that asked for it. */
export const Created = Fact.make("turn.created", {
  version: 1,
  audience,
  subject: (payload) => Subject.make("turn", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct({
    ...Turn.Record.fields,
    notificationIds: Turn.Acceptance.fields.notificationIds,
  }),
});

/**
 * Someone asked a failed or stopped turn to run again: a new turn for the same agent and input,
 * on what the agent is set up with now, continuing the session the turn it retries left.
 */
export const Retried = Fact.make("turn.retried", {
  version: 1,
  audience,
  subject: (payload) => Subject.make("turn", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct(Turn.Record.fields),
});

/** The turn's job started it, with the harness, model, and sandbox it runs on. */
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

/** Someone asked the turn to stop, or its agent stopped taking part; stopping is confirmed later. */
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

/** The turn finished its work, with the reply it posted, if it had one. */
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

/** The turn could not continue, for the reason recorded. */
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

export * as TurnFacts from "./facts.ts";
