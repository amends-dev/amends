import { Schema } from "effect";
import { ThreadId } from "../id.ts";
import { ThreadMessageId } from "./id.ts";
import { WorkspaceId } from "../../workspace/id.ts";
import { MemberId } from "../../workspace/member/id.ts";
import { Identity } from "../../identity/identity.ts";
import { ThreadActivity } from "../activity/activity.ts";
export const Id = ThreadMessageId.Id;
export type Id = ThreadMessageId.Id;
/** Preserve the submitted text, including indentation; reject whitespace-only messages. */
export const Text = Schema.NonEmptyString.check(
  Schema.makeFilter(
    (text) => /\S/u.test(text) || "Message text must contain non-whitespace content",
  ),
);
/**
 * Who wrote a message: a member, human or agent, writing in a thread, or a contact whose message a
 * channel received. An agent's reply is its own message like anyone's; the turn that produced it
 * is how the agent worked, not who wrote it.
 */
export const Author = Schema.TaggedUnion({
  Member: { memberId: MemberId.Id },
  Contact: { contactId: Identity.ContactId },
});
export type Author = typeof Author.Type;
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  threadId: ThreadId.Id,
  author: Author,
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
export const Published = Schema.Struct({
  message: Record,
  activity: ThreadActivity.MessagePublished,
});
export interface Published extends Schema.Schema.Type<typeof Published> {}
export * as ThreadMessage from "./message.ts";
