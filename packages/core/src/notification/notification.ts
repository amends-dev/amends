import { Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { Entry } from "../journal/entry.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { ThreadParticipationId } from "../thread/participation/id.ts";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("NotificationId"));
export type Id = typeof Id.Type;

/** A committed source entry in this notification's workspace; independent of a thread schema. */
export const Source = Schema.Struct({
  logId: Entry.LogId,
  entryId: Entry.Id,
});
export interface Source extends Schema.Schema.Type<typeof Source> {}

/** Triage is one workspace-local recipient; people and agents retain their identity kind. */
export const Recipient = Schema.TaggedUnion({
  Human: Identity.Reference.cases.Human.fields,
  Agent: Identity.Reference.cases.Agent.fields,
  Contact: Identity.Reference.cases.Contact.fields,
  Triage: {},
});
export type Recipient = typeof Recipient.Type;

/** Acknowledgment outcomes will extend this state when their operations are implemented. */
export const State = Schema.TaggedUnion({
  Pending: {},
  Discarded: { reason: Schema.Literal("participation-ended") },
});
export type State = typeof State.Type;

/**
 * One recipient's notification of a recorded source. Generation chooses
 * a stable ID and recorded time from historical input, including on replay.
 * Source existence and recipient selection are responsibilities of that workflow.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  source: Source,
  /** Present for thread-generated member notifications; ties pending work to one participation. */
  participationId: Schema.optionalKey(ThreadParticipationId.Id),
  recipient: Recipient,
  recordedAt: Schema.DateTimeUtcFromString,
  state: State,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Notification from "./notification.ts";
