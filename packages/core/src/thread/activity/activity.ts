import { Schema } from "effect";
import { ThreadId } from "../id.ts";
import { ThreadMessageId } from "../message/id.ts";
import { ThreadParticipationId } from "../participation/id.ts";
import { ThreadParticipation } from "../participation/participation.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { Identity } from "../../identity/identity.ts";
export const Id = Schema.NonEmptyString.pipe(Schema.brand("ThreadActivityId"));
export type Id = typeof Id.Type;
export const Common = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  occurredAt: Schema.DateTimeUtcFromString,
});
export const MessagePublished = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  sequence: Common.fields.sequence,
  kind: Schema.Literal("MessagePublished"),
  messageId: ThreadMessageId.Id,
  occurredAt: Common.fields.occurredAt,
});
export interface MessagePublished extends Schema.Schema.Type<typeof MessagePublished> {}
export const ParticipationFollowed = Schema.Struct({
  ...Common.fields,
  kind: Schema.Literal("ParticipationFollowed"),
  participationId: ThreadParticipationId.Id,
});
export interface ParticipationFollowed extends Schema.Schema.Type<typeof ParticipationFollowed> {}
export const ParticipationEnded = Schema.Struct({
  ...Common.fields,
  kind: Schema.Literal("ParticipationEnded"),
  participationId: ThreadParticipationId.Id,
  reason: ThreadParticipation.EndReason,
});
export interface ParticipationEnded extends Schema.Schema.Type<typeof ParticipationEnded> {}
export const Record = Schema.Union([MessagePublished, ParticipationFollowed, ParticipationEnded]);
export type Record = typeof Record.Type;
export const Subject = Schema.Union([
  Schema.Struct({ kind: MessagePublished.fields.kind, messageId: ThreadMessageId.Id }),
  Schema.Struct({
    kind: ParticipationFollowed.fields.kind,
    participationId: ThreadParticipationId.Id,
  }),
  Schema.Struct({
    kind: ParticipationEnded.fields.kind,
    participationId: ThreadParticipationId.Id,
    reason: ThreadParticipation.EndReason,
  }),
]);
export type Subject = typeof Subject.Type;
/** Historical recipient selection, recorded with the activity rather than recomputed on replay. */
export const Recipient = Schema.Struct({
  participationId: ThreadParticipationId.Id,
  identity: Identity.MemberReference,
});
export interface Recipient extends Schema.Schema.Type<typeof Recipient> {}
export * as ThreadActivity from "./activity.ts";
