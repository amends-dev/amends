import { Schema } from "effect";
import { ThreadId } from "../id.ts";
import { ThreadMessageId } from "./id.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { MemberId } from "../../workspace/member/id.ts";
import { ThreadActivity } from "../activity/activity.ts";
export const Id = ThreadMessageId.Id;
export type Id = ThreadMessageId.Id;
/** Preserve the submitted text, including indentation; reject whitespace-only messages. */
export const Text = Schema.NonEmptyString.check(
  Schema.makeFilter(
    (text) => /\S/u.test(text) || "Message text must contain non-whitespace content",
  ),
);
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  authorMemberId: MemberId.Id,
  kind: Schema.Literal("User"),
  text: Text,
  mentions: Schema.UniqueArray(MemberId.Id),
  publishedAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}
export const PublishInput = Schema.Struct({
  threadId: ThreadId.Id,
  text: Text,
  mentions: Schema.UniqueArray(MemberId.Id),
});
export interface PublishInput extends Schema.Schema.Type<typeof PublishInput> {}
/** Publication result excludes internal admission and recipient identity snapshots. */
export const Published = Schema.Struct({ message: Record, activity: ThreadActivity.Record });
export interface Published extends Schema.Schema.Type<typeof Published> {}
export * as ThreadMessage from "./message.ts";
