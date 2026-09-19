import { Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { Entry } from "../journal/entry.ts";
import { WorkspaceId } from "../workspace/id.ts";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("NotificationId"));
export type Id = typeof Id.Type;

/** A committed source entry in this notification's workspace; independent of a thread schema. */
export const Source = Schema.Struct({
  logId: Entry.LogId,
  entryId: Entry.Id,
});
export interface Source extends Schema.Schema.Type<typeof Source> {}

/** Human and agent recipients retain their identity kind even when their IDs coincide. */
export const Recipient = Identity.Reference;
export type Recipient = Identity.Reference;

/** Acknowledgment outcomes will extend this state when their operations are implemented. */
export const State = Schema.TaggedUnion({ Pending: {} });
export type State = typeof State.Type;

/**
 * One recipient's pending notification of a recorded source. Generation will
 * choose a stable ID and recorded time from historical input, including on replay.
 * Source existence and recipient selection are responsibilities of that workflow.
 */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  source: Source,
  recipient: Recipient,
  recordedAt: Schema.DateTimeUtcFromString,
  state: State,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Notification from "./notification.ts";
