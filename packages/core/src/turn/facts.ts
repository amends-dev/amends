import { Schema } from "effect";
import { Group } from "../group/group.ts";
import { GroupId } from "../group/id.ts";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadMessageId } from "../thread/message/id.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { Turn } from "./turn.ts";

/** Every fact names the turn's thread and group; the group's members may learn of it. */
const Where = { workspaceId: WorkspaceId.Id, groupId: GroupId.Id, threadId: ThreadId.Id };
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
 * with the agent's current configuration, continuing from the turn it retries.
 */
export const Retried = Fact.make("turn.retried", {
  version: 1,
  audience,
  subject: (payload) => Subject.make("turn", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Schema.Struct(Turn.Record.fields),
});

/** An active turn accepted more input, settling the notifications that asked for it. */
export const InputAccepted = Fact.make("turn.input-accepted", {
  version: 1,
  audience,
  subject,
  payload: Schema.Struct({
    ...Where,
    turnId: Turn.Id,
    acceptedThroughSequence: Turn.Record.fields.acceptedThroughSequence,
    ...Turn.Acceptance.fields,
  }),
});

/** Execution took the turn, with the model access and environment it runs with. */
export const Started = Fact.make("turn.started", {
  version: 1,
  audience,
  subject,
  occurrence: (payload) => [payload.turnId],
  payload: Schema.Struct({
    ...Where,
    turnId: Turn.Id,
    selection: Turn.Selection,
    startedAt: Schema.DateTimeUtcFromString,
  }),
});

/** The harness confirmed taking in the turn's input through a timeline position. */
export const InputIncorporated = Fact.make("turn.input-incorporated", {
  version: 1,
  audience,
  subject,
  payload: Schema.Struct({
    ...Where,
    turnId: Turn.Id,
    incorporatedThroughSequence: Turn.Record.fields.incorporatedThroughSequence,
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

/** The turn finished its work, with the replies it published, in order. */
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

/** The turn stopped as it was asked to; its accepted input stays for a later turn. */
export const Cancelled = Fact.make("turn.cancelled", {
  version: 1,
  audience,
  subject,
  occurrence: (payload) => [payload.turnId],
  payload: Schema.Struct({
    ...Where,
    turnId: Turn.Id,
    finishedAt: Schema.DateTimeUtcFromString,
  }),
});

export * as TurnFacts from "./facts.ts";
