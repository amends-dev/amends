import { Schema } from "effect";
import { ThreadId } from "../id.ts";
import { ThreadMessageId } from "../message/id.ts";
import { ThreadParticipationId } from "../participation/id.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { Identity } from "../../identity/identity.ts";
export const Id = Schema.NonEmptyString.pipe(Schema.brand("ThreadActivityId"));
export type Id = typeof Id.Type;
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  sequence: Schema.Int.check(Schema.isGreaterThan(0)),
  kind: Schema.Literal("MessagePublished"),
  messageId: ThreadMessageId.Id,
  occurredAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}
/** Historical recipient selection, recorded with the activity rather than recomputed on replay. */
export const Recipient = Schema.Struct({
  participationId: ThreadParticipationId.Id,
  identity: Identity.MemberReference,
});
export interface Recipient extends Schema.Schema.Type<typeof Recipient> {}
export * as ThreadActivity from "./activity.ts";
